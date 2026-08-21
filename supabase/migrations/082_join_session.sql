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
    or exists (select 1 from sessions s where s.id = session_id and s.user_id = auth.uid())
  );

-- No write policies: both directions go through the functions below.

-- ── Shared-crew test ─────────────────────────────────────────────────────────
-- Whether the caller and p_user belong to at least one crew together. SECURITY
-- DEFINER because crew_members is readable only to fellow members, and the caller
-- may need to ask about someone in a crew they are not both in.
--
-- Referenced from a policy? No — only from the functions below, so it is safe to
-- keep out of client reach. It is NOT revoked here only because the join UI needs
-- it to decide which affordance to show; see shares_crew_with's grant note.
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

-- ── Direct join (crewmates) ──────────────────────────────────────────────────
-- Creates the group if the session has none, stamps group_id on the OWNER's session
-- row — the only column this feature ever writes on someone else's row — and
-- creates the caller's own session in the group.
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
  select s.user_id, s.date, nullif(trim(s.location), ''), s.group_id
    into v_owner, v_date, v_gym, v_group
    from sessions s where s.id = p_session;
  if v_owner is null then raise exception 'No such session'; end if;
  if v_owner = v_user then raise exception 'That is already your session'; end if;
  if v_gym is null then raise exception 'That session has no gym to share'; end if;
  if not shares_crew_with(v_owner) then
    raise exception 'NEEDS_APPROVAL: ask to join instead';
  end if;
  if v_group is not null and session_group_verdict_is_out(v_group) then
    raise exception 'VERDICT_OUT: the awards for that session are already in';
  end if;
  if exists (select 1 from sessions where user_id = v_user and date = v_date and trim(location) = v_gym) then
    raise exception 'ALREADY_LOGGED: you already logged a session that day at that gym';
  end if;

  if v_group is null then
    insert into session_groups (date, gym, created_by) values (v_date, v_gym, v_owner)
      returning id into v_group;
    update sessions set group_id = v_group where id = p_session;
  end if;

  insert into sessions (user_id, date, location, group_id)
    values (v_user, v_date, v_gym, v_group)
    returning id into v_session;
  delete from session_join_requests where session_id = p_session and user_id = v_user;
  return v_session;
end; $$;

-- ── Request, and approval ────────────────────────────────────────────────────
-- Same null-auth guard as join_session, for the same reason.
create or replace function public.request_to_join_session(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_owner uuid; v_group uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select s.user_id, s.group_id into v_owner, v_group from sessions s where s.id = p_session;
  if v_owner is null then raise exception 'No such session'; end if;
  if v_owner = v_user then raise exception 'That is already your session'; end if;
  if v_group is not null and session_group_verdict_is_out(v_group) then
    raise exception 'VERDICT_OUT: the awards for that session are already in';
  end if;
  if v_group is not null and exists (select 1 from sessions where group_id = v_group and user_id = v_user) then
    return;  -- already in
  end if;
  insert into session_join_requests (session_id, user_id) values (p_session, v_user)
    on conflict (session_id, user_id) do nothing;
end; $$;

-- The owner approves. Runs the same join, so there is one code path for "someone
-- joined": the group gets created here if it still does not exist.
--
-- v_user captures auth.uid() and the ownership check uses `is distinct from`
-- rather than `<>`: with the un-hardened `if v_owner is null or v_owner <>
-- auth.uid()`, an unauthenticated caller makes `auth.uid()` NULL, so
-- `v_owner <> auth.uid()` evaluates to NULL, the whole OR-condition can evaluate
-- to NULL instead of true, and plpgsql treats a NULL `if` condition as false —
-- silently skipping the "Only the session owner can approve" guard instead of
-- raising it. Migration 080 hit exactly this and fixed it with `is distinct
-- from`; the same fix applies here.
create or replace function public.approve_join_request(p_session uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_owner uuid; v_date date; v_gym text; v_group uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select s.user_id, s.date, nullif(trim(s.location), ''), s.group_id
    into v_owner, v_date, v_gym, v_group
    from sessions s where s.id = p_session;
  if v_owner is null or v_owner is distinct from v_user then
    raise exception 'Only the session owner can approve';
  end if;
  if not exists (select 1 from session_join_requests where session_id = p_session and user_id = p_user) then
    raise exception 'No such request';
  end if;
  if v_gym is null then raise exception 'That session has no gym to share'; end if;

  if v_group is null then
    insert into session_groups (date, gym, created_by) values (v_date, v_gym, v_owner)
      returning id into v_group;
    update sessions set group_id = v_group where id = p_session;
  end if;

  -- The approved climber may already have logged that evening themselves; leaving
  -- their existing session alone and adding a second one is the out-of-scope merge
  -- case, so attach the one they have rather than duplicating it.
  if exists (select 1 from sessions where user_id = p_user and date = v_date and trim(location) = v_gym and group_id is null) then
    update sessions set group_id = v_group
     where user_id = p_user and date = v_date and trim(location) = v_gym and group_id is null;
  elsif not exists (select 1 from sessions where user_id = p_user and group_id = v_group) then
    insert into sessions (user_id, date, location, group_id) values (p_user, v_date, v_gym, v_group);
  end if;

  delete from session_join_requests where session_id = p_session and user_id = p_user;
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

-- shares_crew_with stays client-callable on purpose: the feed needs it to choose
-- between "Join" and "Ask to join" before the user taps anything. It leaks only one
-- boolean about the caller's own crew overlap, which the caller could compute from
-- their own crew rosters anyway.
