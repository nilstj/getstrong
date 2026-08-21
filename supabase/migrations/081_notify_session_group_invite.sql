-- Notify a climber when they are invited into a shared session group.
--
-- The only signal today is the invite card at the top of /sessions, which a
-- climber may not open for days on a phone-in-a-gym app -- the whole feature is
-- gated on them happening to look. `session_partners` inserts used to fire
-- `on_session_tag_notify` for this job; that control was removed, so this
-- restores the capability on the path that replaced it: `invite_to_session_group`.
--
-- This is a separate migration, not an edit to 080, because 080 is already
-- applied in production. `create or replace function` re-creates
-- `invite_to_session_group` with an identical signature, so this is safe to run
-- on top of it -- the same technique migration 072 used to re-create an
-- existing function.
create or replace function public.invite_to_session_group(p_group uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_inserted session_group_invites;
  v_date date;
  v_gym text;
begin
  if not is_session_group_member(p_group) then
    raise exception 'Only people in the session can invite';
  end if;
  if exists (select 1 from sessions where group_id = p_group and user_id = p_user) then
    return;  -- already in
  end if;

  insert into session_group_invites (group_id, invited_user, invited_by)
    values (p_group, p_user, v_user)
    on conflict (group_id, invited_user) do nothing
    returning * into v_inserted;

  -- on conflict ... do nothing leaves `found` false and v_inserted null: a repeat
  -- invite (e.g. a double-tapped Ask) wrote no row, so it must not notify again.
  if not found then
    return;
  end if;

  select date, gym into v_date, v_gym from session_groups where id = p_group;

  perform public.create_notification(
    p_user, v_user, 'session_group_invite', p_group,
    jsonb_build_object('group_id', p_group, 'date', v_date, 'gym', v_gym)
  );
end; $$;
