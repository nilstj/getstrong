-- 084: fix open_award_round -- min(uuid) does not exist
--
-- 083's crew derivation aggregated a uuid column with min():
--
--   select case when count(*) = 1 then min(c.crew_id) end into v_crew from (...) c;
--
-- min()/max() over uuid are not available on this server's PostgreSQL, so that
-- expression raises 42883 "function min(uuid) does not exist". A plpgsql body is
-- NOT validated when the function is created, so 083 applied completely clean
-- and the fault only appeared when a climber actually tapped "Cast your votes":
-- open_award_round raised on EVERY call that took the create-a-round path, and
-- no round for a session group was ever created. Everything structural checked
-- out -- the function existed with the right signature, the arbiter index was
-- there, the old unique constraint was gone, crew_id was nullable, the definer
-- owned the table -- which is exactly the signature of a runtime-only fault in
-- an unvalidated body.
--
-- It stayed invisible for a second reason, fixed separately in the client
-- (568ca8a): postgrest-js only builds a real PostgrestError under
-- .throwOnError(), so `e instanceof Error` was false for every server failure
-- and the toast showed its generic fallback instead of this message.
--
-- Nothing else changes: same signature, same return type, same guards, same
-- semantics. Only the aggregate is swapped for one that exists everywhere.
--
-- RELEASE GATE: apply this before anyone can open a session's awards. Until it
-- is applied, "Cast your votes" fails on every session.

create or replace function public.open_award_round(p_group uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_id uuid; v_date date; v_gym text; v_crew uuid; v_members integer;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not is_session_group_member(p_group) then
    raise exception 'Only climbers from that session can open its awards';
  end if;

  select id into v_id from crew_award_rounds where group_id = p_group;
  if v_id is not null then
    -- A round already exists, so this call is just a lazy lookup -- but if
    -- the deadline has since passed (the timeout branch of
    -- award_round_status) and nobody has cast a vote since, cast_award_vote's
    -- latch above never ran and unlocked_at is still null. Catching it here
    -- too closes some of that gap: whichever member's client next opens the
    -- awards screen for this group latches the reveal. It cannot close it
    -- fully -- a round that times out and is never revisited through either
    -- this function or cast_award_vote keeps unlocked_at NULL indefinitely;
    -- see this migration's header note / the review report for that residual
    -- case.
    if (select unlocked from award_round_status(v_id)) then
      update crew_award_rounds set unlocked_at = coalesce(unlocked_at, now())
       where id = v_id and unlocked_at is null;
    end if;
    return v_id;
  end if;

  select date, gym into v_date, v_gym from session_groups where id = p_group;
  select count(*) into v_members from sessions where group_id = p_group;
  if v_members < 2 then
    raise exception 'Awards need at least two climbers in the session';
  end if;

  -- The streak's scope. session_groups.crew_id is never written by 080, so the
  -- crew is derived here: exactly one crew that EVERY current member belongs to,
  -- otherwise none. A crew climbing together gets a streak; a mixed group does
  -- not, which is what "crew-scoped where a crew exists" means.
  --
  -- (array_agg(...))[1] rather than min(...): crew_id is a uuid, and min/max
  -- over uuid does not exist on this server's PostgreSQL. The group is filtered
  -- to exactly one row by the count(*) = 1 guard, so element 1 IS that row --
  -- the two expressions are equivalent wherever min(uuid) exists at all.
  select case when count(*) = 1 then (array_agg(c.crew_id))[1] end into v_crew
    from (
      select cm.crew_id
        from crew_members cm
       where cm.user_id in (select user_id from sessions where group_id = p_group)
       group by cm.crew_id
      having count(distinct cm.user_id) = v_members
    ) c;

  insert into crew_award_rounds (crew_id, group_id, round_date, gym, opened_by, closes_at)
    values (v_crew, p_group, v_date, v_gym, v_user, now() + interval '24 hours')
    on conflict (group_id) where group_id is not null do nothing
    returning id into v_id;
  if v_id is null then
    select id into v_id from crew_award_rounds where group_id = p_group;
  end if;
  return v_id;
end; $$;

-- Guard against exactly the class of bug this migration fixes. A `do` block IS
-- executed when the migration runs, unlike a plpgsql function body, so if the
-- aggregate cannot resolve on this server the migration fails loudly here in
-- the dashboard rather than shipping a function that raises on first use.
do $$
declare v_probe uuid;
begin
  select case when count(*) = 1 then (array_agg(c.crew_id))[1] end into v_probe
    from (select cm.crew_id from crew_members cm limit 1) c;
end $$;
