-- Joining a friend's session from the feed.
--
-- Two paths, because consent runs the other way here from an invite. An invite is
-- the group asking you in; a join is you asking to come in, and on a follow-based
-- social graph anyone who follows you could otherwise attach themselves to your
-- evening and vote in its awards. So: a crewmate joins directly, and everyone else
-- files a request the owner approves.
--
-- Requests are keyed on the SESSION, not the group, because a session in the feed
-- may have no group yet and a pending request must not create one — creating a group
-- stamps group_id onto the owner's session row, which is the owner's call.
--
-- Nothing here awards beta_points.

create table if not exists session_join_requests (
  session_id uuid not null references sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
create index if not exists session_join_requests_user_idx on session_join_requests (user_id);

alter table session_join_requests enable row level security;

-- The requester sees their own; the session owner sees requests on their session.
-- `sessions` stays owner-only, so this sub-select is the owner's own row.
drop policy if exists "join requests readable by requester or session owner" on session_join_requests;
create policy "join requests readable by requester or session owner" on session_join_requests for select
  using (
    user_id = auth.uid()
    or exists (select 1 from sessions s where s.id = session_join_requests.session_id and s.user_id = auth.uid())
  );

-- No write policies: both directions go through the functions below.

-- ── Shared-crew test ─────────────────────────────────────────────────────────
-- Whether the caller and p_user belong to at least one crew together. SECURITY
-- DEFINER because crew_members is readable only to fellow members, and the caller
-- may need to ask about someone in a crew they are not both in.
--
-- Referenced from a policy? No — only from join_session below. Revoked from the
-- client roles at the bottom of this migration; see the note there.
create or replace function public.shares_crew_with(p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
      from crew_members a
      join crew_members b on b.crew_id = a.crew_id
     where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

-- ── Guard: a revealed verdict closes the roster ───────────────────────────────
-- Adding a participant to a round whose result people have already read is wrong.
-- `unlocked_at` arrives with the awards-on-groups migration (083); until then this
-- returns false and the guard is inert, which is deliberate.
create or replace function public.session_group_verdict_is_out(p_group uuid)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare v_out boolean := false;
begin
  begin
    execute 'select exists (select 1 from crew_award_rounds where group_id = $1 and unlocked_at is not null)'
      into v_out using p_group;
  exception when undefined_column or undefined_table then
    v_out := false;
  end;
  return coalesce(v_out, false);
end; $$;

-- ── Back-filling the shared list from the owner's already-logged problems ────
-- Lifted from create_session_group (080, verbatim except for parameterizing the
-- owner): whichever path first turns a solo session into a group must not hand
-- the group an empty list when the owner already logged boulders that evening.
-- create_session_group returns early once group_id is set, so once a group is
-- created without this back-fill it can never run for that group afterwards --
-- every call site that can be the one to stamp group_id must call this exactly
-- once, immediately after.
--
-- p_owner is the SESSION's owner, not the caller: join_session's caller is the
-- crewmate joining someone else's session, and approve_join_request's caller is
-- the owner approving someone else's request -- in both cases the boulders to
-- back-fill are the owner's already-logged ones, never the caller's.
--
-- Trusts p_group/p_session/p_owner without checking the caller owns any of
-- them -- it is meant to be reached only from create_session_group,
-- join_session and approve_join_request, which have already done that
-- checking. Revoked from the client roles at the bottom of this migration for
-- that reason; the three SECURITY DEFINER callers are unaffected because a
-- SECURITY DEFINER function's body runs as its owner, whose own EXECUTE grant
-- is untouched by revoking the client roles' grant.
create or replace function public.backfill_group_from_session(p_group uuid, p_session uuid, p_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_boulder_id uuid; r record;
begin
  for r in
    select id, gym_problem_id, grade_system, grade_value, grade_value_font,
           grade_value_vscale, color, hold_color, image_url, beta_video_url
      from problems
     where session_id = p_session and crag is null and user_id = p_owner
     order by created_at
  loop
    v_boulder_id := null;

    -- Two of the owner's problems can link the same published boulder; the
    -- partial unique index on (group_id, gym_problem_id) is the conflict
    -- target so the second insert is a no-op instead of an error. A null
    -- gym_problem_id never matches that index's predicate, so it always
    -- inserts its own row -- correct, since an unlinked boulder is identified
    -- only by what the climber typed.
    insert into session_group_boulders (
      group_id, gym_problem_id, grade_system, grade_value, grade_value_font,
      grade_value_vscale, color, hold_color, image_url, beta_video_url, added_by
    ) values (
      p_group, r.gym_problem_id, r.grade_system, r.grade_value, r.grade_value_font,
      r.grade_value_vscale, r.color, r.hold_color, r.image_url, r.beta_video_url, p_owner
    )
    on conflict (group_id, gym_problem_id) where gym_problem_id is not null do nothing
    returning id into v_boulder_id;

    -- Only the conflicting (skipped) insert reaches here with a null id; the
    -- pair (group_id, gym_problem_id) is unique, so this lookup is unambiguous.
    if v_boulder_id is null then
      select id into v_boulder_id from session_group_boulders
       where group_id = p_group and gym_problem_id = r.gym_problem_id;
    end if;

    -- problems_group_boulder_user_idx allows only one of the owner's rows per
    -- (user, group_boulder_id): when two of their problems link the same
    -- gym_problem_id, both resolve to the same v_boulder_id above, and only the
    -- first to reach here may claim it -- the guard skips the rest rather than
    -- raising a unique-violation and failing the whole share.
    update problems set group_boulder_id = v_boulder_id
     where id = r.id
       and not exists (
         select 1 from problems p2
          where p2.user_id = p_owner and p2.group_boulder_id = v_boulder_id
       );
  end loop;
end; $$;

-- ── create_session_group (080), redefined to use the shared back-fill helper ─
-- Same technique as 081's redefinition of invite_to_session_group: 080 is
-- already applied in production, and `create or replace function` with an
-- identical signature safely re-creates it on top. Everything here is
-- reproduced faithfully from 080 except the inline back-fill loop, which is
-- now the call to backfill_group_from_session above -- so create_session_group,
-- join_session and approve_join_request all run the identical back-fill code.
create or replace function public.create_session_group(p_session uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_date date; v_gym text; v_owner uuid; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  -- for update: two concurrent calls on the same session must not each insert
  -- a group and leave one orphaned.
  select s.user_id, s.date, nullif(trim(s.location), ''), s.group_id
    into v_owner, v_date, v_gym, v_id
    from sessions s where s.id = p_session
    for update;
  if v_owner is null then raise exception 'No such session'; end if;
  if v_owner is distinct from v_user then raise exception 'Only the session owner can share it'; end if;
  if v_id is not null then return v_id; end if;
  if v_gym is null then raise exception 'A shared session needs a gym'; end if;

  insert into session_groups (date, gym, created_by) values (v_date, v_gym, v_user)
    returning id into v_id;
  update sessions set group_id = v_id where id = p_session;

  -- Back-fill the shared list from what the owner already logged, so sharing a
  -- session never hands an invitee "Boulders (0)" and the owner's own status
  -- shows correctly against the list instead of "not logged".
  perform public.backfill_group_from_session(v_id, p_session, v_owner);

  return v_id;
end; $$;

-- ── Direct join (crewmates) ──────────────────────────────────────────────────
-- Creates the group if the session has none, stamps group_id on the OWNER's session
-- row — the only column this feature ever writes on someone else's row — and
-- creates (or attaches) the caller's own session in the group.
--
-- v_user captures auth.uid() up front and is checked explicitly: a NULL `if`
-- condition is treated as false in plpgsql, so comparing auth.uid() inline would
-- silently skip these guards for an unauthenticated caller, and CREATE FUNCTION
-- grants EXECUTE to PUBLIC by default.
create or replace function public.join_session(p_session uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_owner uuid; v_date date; v_gym text; v_group uuid; v_session uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  -- for update: two crewmates tapping Join on the same group-less session at the
  -- same moment must not each read group_id = null, each insert a session_groups
  -- row and stamp the owner's session, splitting the group in two -- see
  -- create_session_group in 080 for the identical race and fix.
  select s.user_id, s.date, nullif(trim(s.location), ''), s.group_id
    into v_owner, v_date, v_gym, v_group
    from sessions s where s.id = p_session
    for update;
  if v_owner is null then raise exception 'No such session'; end if;
  if v_owner = v_user then raise exception 'That is already your session'; end if;
  if v_gym is null then raise exception 'That session has no gym to share'; end if;
  if not shares_crew_with(v_owner) then
    raise exception 'NEEDS_APPROVAL: ask to join instead';
  end if;
  if v_group is not null and session_group_verdict_is_out(v_group) then
    raise exception 'VERDICT_OUT: the awards for that session are already in';
  end if;

  if v_group is null then
    insert into session_groups (date, gym, created_by) values (v_date, v_gym, v_owner)
      returning id into v_group;
    update sessions set group_id = v_group where id = p_session;
    perform public.backfill_group_from_session(v_group, p_session, v_owner);
  end if;

  -- The joiner may already have logged that evening themselves; leaving their
  -- existing session alone and adding a second one is the out-of-scope merge
  -- case, so attach the one they have rather than duplicating it (and rather
  -- than refusing, which is what this used to do). Case-insensitive and scoped
  -- to ungrouped sessions only (group_id is null): a session already tied to a
  -- *different* shared group at the same gym/date is a genuinely different
  -- evening and must not be touched here. Mirrors approve_join_request's
  -- identical attach below.
  if exists (
    select 1 from sessions
     where user_id = v_user and date = v_date and lower(trim(location)) = lower(v_gym)
       and group_id is null
  ) then
    -- Constrained to a single row via the id subquery + limit 1: a climber with
    -- two ungrouped sessions that day at that gym must not have both matched,
    -- which would violate the partial unique index on (group_id, user_id).
    update sessions set group_id = v_group
     where id = (
       select id from sessions
        where user_id = v_user and date = v_date and lower(trim(location)) = lower(v_gym)
          and group_id is null
        order by created_at
        limit 1
     )
    returning id into v_session;
  elsif not exists (select 1 from sessions where user_id = v_user and group_id = v_group) then
    -- on conflict: a concurrent duplicate call must not surface a raw
    -- duplicate-key error against the partial unique index on
    -- (group_id, user_id); recover the existing row's id instead, as 080's
    -- accept_session_group does for the identical case.
    insert into sessions (user_id, date, location, group_id)
      values (v_user, v_date, v_gym, v_group)
      on conflict (group_id, user_id) where group_id is not null do nothing
      returning id into v_session;
  end if;

  if v_session is null then
    select id into v_session from sessions where group_id = v_group and user_id = v_user;
  end if;

  delete from session_join_requests where session_id = p_session and user_id = v_user;
  return v_session;
end; $$;

-- ── Request, and approval ────────────────────────────────────────────────────
-- Same null-auth guard as join_session, for the same reason.
create or replace function public.request_to_join_session(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_owner uuid; v_date date; v_gym text; v_group uuid;
  v_inserted session_join_requests;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select s.user_id, s.date, nullif(trim(s.location), ''), s.group_id
    into v_owner, v_date, v_gym, v_group
    from sessions s where s.id = p_session;
  if v_owner is null then raise exception 'No such session'; end if;
  if v_owner = v_user then raise exception 'That is already your session'; end if;
  if v_gym is null then raise exception 'That session has no gym to share'; end if;
  if v_group is not null and session_group_verdict_is_out(v_group) then
    raise exception 'VERDICT_OUT: the awards for that session are already in';
  end if;
  if v_group is not null and exists (select 1 from sessions where group_id = v_group and user_id = v_user) then
    return;  -- already in
  end if;

  insert into session_join_requests (session_id, user_id) values (p_session, v_user)
    on conflict (session_id, user_id) do nothing
    returning * into v_inserted;

  -- on conflict ... do nothing leaves `found` false and v_inserted null: a
  -- repeat "Ask to join" tap wrote no row, so it must not notify again -- same
  -- technique as 081's invite_to_session_group.
  if not found then
    return;
  end if;

  perform public.create_notification(
    v_owner, v_user, 'session_join_request', p_session,
    jsonb_build_object('session_id', p_session, 'date', v_date, 'gym', v_gym)
  );
end; $$;

-- The owner approves. Runs the same join, so there is one code path for "someone
-- joined": the group gets created here if it still does not exist.
--
-- v_user captures auth.uid() and the ownership check uses `is distinct from`
-- rather than `<>`: with the un-hardened `v_owner <> auth.uid()`, an
-- unauthenticated caller makes `auth.uid()` NULL, so the comparison evaluates
-- to NULL, and plpgsql treats a NULL `if` condition as false — silently
-- skipping the "Only the session owner can approve" guard instead of raising
-- it. `is distinct from` already covers a NULL v_owner (no such session), which
-- is why that case is raised separately above rather than folded into this
-- disjunct. Migration 080 hit exactly this and fixed it with `is distinct
-- from`; the same fix applies here.
create or replace function public.approve_join_request(p_session uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_owner uuid; v_date date; v_gym text; v_group uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  -- for update: this call can create the group exactly like join_session does,
  -- so it needs the identical lock against a simultaneous join/approve on the
  -- same group-less session -- see join_session above.
  select s.user_id, s.date, nullif(trim(s.location), ''), s.group_id
    into v_owner, v_date, v_gym, v_group
    from sessions s where s.id = p_session
    for update;
  if v_owner is null then raise exception 'No such session'; end if;
  if v_owner is distinct from v_user then
    raise exception 'Only the session owner can approve';
  end if;
  if not exists (select 1 from session_join_requests where session_id = p_session and user_id = p_user) then
    raise exception 'No such request';
  end if;
  if v_gym is null then raise exception 'That session has no gym to share'; end if;

  -- Only an already-existing group can have a verdict out; a group this call is
  -- about to create cannot, so this must come before the group-creation block.
  if v_group is not null and session_group_verdict_is_out(v_group) then
    raise exception 'VERDICT_OUT: the awards for that session are already in';
  end if;

  if v_group is null then
    insert into session_groups (date, gym, created_by) values (v_date, v_gym, v_owner)
      returning id into v_group;
    update sessions set group_id = v_group where id = p_session;
    perform public.backfill_group_from_session(v_group, p_session, v_owner);
  end if;

  -- The approved climber may already have logged that evening themselves; leaving
  -- their existing session alone and adding a second one is the out-of-scope merge
  -- case, so attach the one they have rather than duplicating it. Case-insensitive
  -- and scoped to ungrouped sessions only, for the same reason as join_session's
  -- identical attach.
  if exists (
    select 1 from sessions
     where user_id = p_user and date = v_date and lower(trim(location)) = lower(v_gym)
       and group_id is null
  ) then
    -- Constrained to a single row via the id subquery + limit 1: a climber with
    -- two ungrouped sessions that day at that gym must not have both matched,
    -- which would violate the partial unique index on (group_id, user_id).
    update sessions set group_id = v_group
     where id = (
       select id from sessions
        where user_id = p_user and date = v_date and lower(trim(location)) = lower(v_gym)
          and group_id is null
        order by created_at
        limit 1
     );
  elsif not exists (select 1 from sessions where user_id = p_user and group_id = v_group) then
    -- on conflict: mirrors join_session's recovery for a concurrent duplicate
    -- call against the partial unique index on (group_id, user_id).
    insert into sessions (user_id, date, location, group_id)
      values (p_user, v_date, v_gym, v_group)
      on conflict (group_id, user_id) where group_id is not null do nothing;
  end if;

  delete from session_join_requests where session_id = p_session and user_id = p_user;

  -- The request row is gone and the checks above already required it to have
  -- existed, so reaching here always means the join actually happened -- no
  -- found/returning guard is needed the way request_to_join_session needs one.
  perform public.create_notification(
    p_user, v_user, 'session_join_approved', p_session,
    jsonb_build_object('session_id', p_session, 'date', v_date, 'gym', v_gym)
  );
end; $$;

-- v_user captures auth.uid() up front for the same null-auth reason as above.
-- The pre-hardening ownership check here was an EXISTS predicate
-- (`s.user_id = auth.uid()`), which already fails closed on a NULL auth.uid()
-- because no row can match a NULL equality — but it is hardened the same way as
-- the rest of this migration's write paths for a consistent, explicit
-- 'Not authenticated' error rather than relying on that incidental behaviour.
create or replace function public.decline_join_request(p_session uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from sessions s where s.id = p_session and s.user_id = v_user) then
    raise exception 'Only the session owner can decline';
  end if;
  delete from session_join_requests where session_id = p_session and user_id = p_user;
end; $$;

-- A requester must be able to withdraw: there is deliberately no DELETE policy
-- on session_join_requests, so without this a request filed in August could be
-- approved in November with no action from the requester at that moment,
-- silently creating a session in their log and moving their streak and stats.
-- Guarded by the primary key: the caller can only ever delete their own row.
create or replace function public.cancel_join_request(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  delete from session_join_requests where session_id = p_session and user_id = v_user;
end; $$;

-- ── "Am I already in that one?" for the feed ─────────────────────────────────
-- FriendSessionCard needs to know, per card, whether the caller is already a
-- member of that session's group -- otherwise it shows a join affordance to
-- someone already in. Batched like useSharedCrewUsers: one call for the whole
-- feed rather than one round-trip per card.
--
-- Discloses only facts about the CALLER: is_session_group_member (080) checks
-- the caller's own sessions row, so this never reveals who else is in a group,
-- only which of the given session ids the caller themselves shares a group
-- with. Guards a null auth.uid() explicitly rather than relying on it failing
-- to match, since a wrong-but-accidentally-safe query here would be a silent
-- privacy bug waiting to happen if the underlying check ever changed.
create or replace function public.sessions_i_am_in(p_sessions uuid[])
returns setof uuid language sql security definer stable set search_path = public as $$
  select s.id
    from sessions s
   where auth.uid() is not null
     and s.id = any(p_sessions)
     and s.group_id is not null
     and is_session_group_member(s.group_id);
$$;

-- shares_crew_with is revoked from the client roles: the feed batches crew
-- overlap via useSharedCrewUsers reading crew_members directly, so nothing in
-- src/ calls this function, and it is not referenced from any RLS policy
-- either -- only from join_session above, whose SECURITY DEFINER body runs as
-- the function owner, so the owner's own EXECUTE grant (untouched here) is all
-- it needs. As established in 079: revoking only `from anon, authenticated`
-- leaves the PUBLIC grant standing (CREATE FUNCTION grants EXECUTE to PUBLIC by
-- default), so it must also be revoked `from public` to actually close it off.
revoke execute on function public.shares_crew_with(uuid) from anon, authenticated;
revoke execute on function public.shares_crew_with(uuid) from public;

-- backfill_group_from_session trusts its three id arguments without checking
-- the caller owns any of them, so it must not be directly callable either --
-- see the comment on its definition above.
revoke execute on function public.backfill_group_from_session(uuid, uuid, uuid) from anon, authenticated;
revoke execute on function public.backfill_group_from_session(uuid, uuid, uuid) from public;

-- session_group_verdict_is_out is referenced only from join_session and
-- approve_join_request above, never from an RLS policy, so it is safe to close
-- off. As established in 079: revoking only `from anon, authenticated` leaves
-- the PUBLIC grant standing (CREATE FUNCTION grants EXECUTE to PUBLIC by
-- default), so it must also be revoked `from public` to actually close it off.
-- The `from anon, authenticated` revoke is kept too, redundant but explicit
-- about which roles this is defending against.
revoke execute on function public.session_group_verdict_is_out(uuid) from anon, authenticated;
revoke execute on function public.session_group_verdict_is_out(uuid) from public;
