-- Shared sessions: one real-world evening that several personal sessions point at.
--
-- Your `sessions` row stays yours. The group holds the date, the gym, who is in it,
-- and an explicit boulder list. Each climber's `problems` row attaches to a list
-- entry via group_boulder_id, so a boulder nobody logged costs nobody a row and
-- "your status" is derived: no row = not logged, sent = false = project, sent = true
-- = sent. There is no status column and none is wanted.
--
-- The list is an explicit table rather than a union of everyone's problems, because
-- deduping boulders that are not linked to a published gym boulder would need
-- (grade, colour, hold colour) signature matching — the same guessing that made the
-- awards feature fail on its first day in production.
--
-- Nothing here awards beta_points.

-- ── Tables ───────────────────────────────────────────────────────────────────
create table if not exists session_groups (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  gym text not null,
  crew_id uuid references crews(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on column session_groups.crew_id is
  'Unwritable here: nothing in this migration and no client can set it. Reserved '
  'for a later migration that re-anchors session awards onto groups and needs a '
  'crew to count a repeat-donkey streak within. Not dead weight -- do not drop.';

alter table sessions add column if not exists group_id uuid references session_groups(id) on delete set null;
create index if not exists sessions_group_idx on sessions (group_id);

-- One session per (group, user): guards against two concurrent accept calls
-- (e.g. a double-tapped button) both inserting a session row for the same
-- climber in the same group. Partial predicate keeps every solo session
-- (group_id null) out of the index, so this cannot fail on legacy data and
-- cannot change solo-session behaviour.
create unique index if not exists sessions_group_user_idx
  on sessions (group_id, user_id) where group_id is not null;

create table if not exists session_group_invites (
  group_id uuid not null references session_groups(id) on delete cascade,
  invited_user uuid not null references auth.users(id) on delete cascade,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, invited_user)
);
create index if not exists session_group_invites_user_idx on session_group_invites (invited_user);

-- The shared list: what was on the wall that evening.
create table if not exists session_group_boulders (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references session_groups(id) on delete cascade,
  gym_problem_id uuid references gym_problems(id) on delete set null,
  grade_system text not null check (grade_system in ('v_scale', 'font', 'color')),
  grade_value text,
  grade_value_font text,
  grade_value_vscale text,
  color text,
  hold_color text,
  image_url text,
  beta_video_url text,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists session_group_boulders_group_idx on session_group_boulders (group_id, created_at);

-- One list entry per published boulder: two climbers cannot create rival rows for
-- the same gym problem. Boulders with no gym_problem_id are added deliberately from
-- the list UI, so duplicates there are a user's choice, not a failed heuristic.
create unique index if not exists session_group_boulders_gym_problem_idx
  on session_group_boulders (group_id, gym_problem_id)
  where gym_problem_id is not null;

alter table problems add column if not exists group_boulder_id uuid references session_group_boulders(id) on delete set null;
create index if not exists problems_group_boulder_idx on problems (group_boulder_id);

-- One entry per climber per shared boulder. Partial, so every pre-existing
-- problem (group_boulder_id null) stays out of the index and the constraint
-- cannot fail on legacy data or change solo-session behaviour.
create unique index if not exists problems_group_boulder_user_idx
  on problems (group_boulder_id, user_id) where group_boulder_id is not null;

alter table session_groups          enable row level security;
alter table session_group_invites   enable row level security;
alter table session_group_boulders  enable row level security;

-- ── Membership helper ────────────────────────────────────────────────────────
-- SECURITY DEFINER so a policy can ask "is the caller in this group?" without
-- needing to read other users' sessions rows directly.
--
-- Do NOT revoke execute on this from anon/authenticated: it is referenced inside
-- the RLS policy bodies below, and a policy expression is evaluated as part of the
-- querying role's own query, so the caller needs EXECUTE on it. Revoking would
-- deny every read of the three tables.
create or replace function public.is_session_group_member(p_group uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from sessions s where s.group_id = p_group and s.user_id = auth.uid()
  );
$$;

-- ── SELECT policies ──────────────────────────────────────────────────────────
drop policy if exists "session groups readable by members and invitees" on session_groups;
create policy "session groups readable by members and invitees" on session_groups for select using (
  is_session_group_member(id)
  or exists (select 1 from session_group_invites i where i.group_id = session_groups.id and i.invited_user = auth.uid())
);

drop policy if exists "group invites readable by invitee or members" on session_group_invites;
create policy "group invites readable by invitee or members" on session_group_invites for select
  using (invited_user = auth.uid() or is_session_group_member(group_id));

drop policy if exists "group boulders readable by members" on session_group_boulders;
create policy "group boulders readable by members" on session_group_boulders for select
  using (is_session_group_member(group_id));

-- No INSERT/UPDATE/DELETE policies on any of the three: every write goes through
-- the SECURITY DEFINER functions below, which is what keeps a client from writing
-- another user's rows.

-- ── Creating a group from your own session ───────────────────────────────────
-- Idempotent: a session that already belongs to a group returns that group.
create or replace function public.create_session_group(p_session uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_date date; v_gym text; v_owner uuid; v_user uuid := auth.uid();
  v_boulder_id uuid; r record;
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
  -- shows correctly against the list instead of "not logged". Outdoor problems
  -- are excluded like every other read of `problems` (crag is out of scope).
  for r in
    select id, gym_problem_id, grade_system, grade_value, grade_value_font,
           grade_value_vscale, color, hold_color, image_url, beta_video_url
      from problems
     where session_id = p_session and crag is null
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
      v_id, r.gym_problem_id, r.grade_system, r.grade_value, r.grade_value_font,
      r.grade_value_vscale, r.color, r.hold_color, r.image_url, r.beta_video_url, v_user
    )
    on conflict (group_id, gym_problem_id) where gym_problem_id is not null do nothing
    returning id into v_boulder_id;

    -- Only the conflicting (skipped) insert reaches here with a null id; the
    -- pair (group_id, gym_problem_id) is unique, so this lookup is unambiguous.
    if v_boulder_id is null then
      select id into v_boulder_id from session_group_boulders
       where group_id = v_id and gym_problem_id = r.gym_problem_id;
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
          where p2.user_id = v_owner and p2.group_boulder_id = v_boulder_id
       );
  end loop;

  return v_id;
end; $$;

-- ── Invites ──────────────────────────────────────────────────────────────────
create or replace function public.invite_to_session_group(p_group uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if not is_session_group_member(p_group) then
    raise exception 'Only people in the session can invite';
  end if;
  if exists (select 1 from sessions where group_id = p_group and user_id = p_user) then
    return;  -- already in
  end if;
  insert into session_group_invites (group_id, invited_user, invited_by)
    values (p_group, p_user, v_user)
    on conflict (group_id, invited_user) do nothing;
end; $$;

-- Accepting creates ONLY the caller's own session row. No problems are created:
-- the boulder list is shared, so there is nothing to copy.
create or replace function public.accept_session_group(p_group uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_session uuid; v_date date; v_gym text; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from session_group_invites where group_id = p_group and invited_user = v_user) then
    raise exception 'No invite to that session';
  end if;
  select date, gym into v_date, v_gym from session_groups where id = p_group;

  -- Merging with a solo session you already logged that evening at that gym is
  -- out of scope, so refuse distinguishably rather than silently creating a
  -- duplicate evening. Case-insensitive, and scoped to ungrouped sessions only
  -- (group_id is null): a session already tied to a *different* shared group at
  -- the same gym/date is a genuinely different evening and must not be blocked
  -- here. The partial unique index on sessions (group_id, user_id) already
  -- prevents a double-accept into *this* group.
  if exists (
    select 1 from sessions
     where user_id = v_user and date = v_date and lower(trim(location)) = lower(v_gym)
       and group_id is null
  ) then
    raise exception 'ALREADY_LOGGED: you already logged a session that day at that gym';
  end if;

  -- on conflict: two concurrent accepts (e.g. a double-tapped button) both
  -- pass the checks above; the unique index on (group_id, user_id) lets only
  -- one insert win, and we return the existing row's id instead of null.
  insert into sessions (user_id, date, location, group_id)
    values (v_user, v_date, v_gym, p_group)
    on conflict (group_id, user_id) where group_id is not null do nothing
    returning id into v_session;

  if v_session is null then
    select id into v_session from sessions where group_id = p_group and user_id = v_user;
  end if;

  delete from session_group_invites where group_id = p_group and invited_user = v_user;
  return v_session;
end; $$;

create or replace function public.decline_session_group(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from session_group_invites where group_id = p_group and invited_user = auth.uid();
end; $$;

-- ── The shared boulder list ──────────────────────────────────────────────────
-- Returns the list entry's id, creating it unless this gym problem is already on
-- the list. The unique index is the guard; the on-conflict path is how we return
-- the existing id rather than failing.
create or replace function public.add_group_boulder(
  p_group uuid,
  p_gym_problem_id uuid,
  p_grade_system text,
  p_grade_value text,
  p_grade_value_font text,
  p_grade_value_vscale text,
  p_color text,
  p_hold_color text,
  p_image_url text,
  p_beta_video_url text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_gym text;
begin
  if not is_session_group_member(p_group) then
    raise exception 'Only people in the session can add boulders';
  end if;

  if p_gym_problem_id is not null then
    select gym into v_gym from session_groups where id = p_group;
    if not exists (select 1 from gym_problems where id = p_gym_problem_id and lower(gym) = lower(v_gym)) then
      raise exception 'WRONG_GYM: that boulder is not from this session''s gym';
    end if;

    -- Pre-select as a fast path; the on-conflict below is what actually
    -- guarantees we never return null for a boulder that is on the list.
    select id into v_id from session_group_boulders
     where group_id = p_group and gym_problem_id = p_gym_problem_id;
    if v_id is not null then return v_id; end if;
  end if;

  -- Two members adding the same published boulder at once (the ordinary case
  -- when a crew is working the same problem) must not surface a raw
  -- duplicate-key error: the conflict path recovers the existing row's id.
  insert into session_group_boulders (
    group_id, gym_problem_id, grade_system, grade_value, grade_value_font,
    grade_value_vscale, color, hold_color, image_url, beta_video_url, added_by
  ) values (
    p_group, p_gym_problem_id, p_grade_system, p_grade_value, p_grade_value_font,
    p_grade_value_vscale, p_color, p_hold_color, p_image_url, p_beta_video_url, auth.uid()
  )
  on conflict (group_id, gym_problem_id) where gym_problem_id is not null do nothing
  returning id into v_id;

  if v_id is null and p_gym_problem_id is not null then
    select id into v_id from session_group_boulders
     where group_id = p_group and gym_problem_id = p_gym_problem_id;
  end if;
  return v_id;
end; $$;

-- ── Roster ───────────────────────────────────────────────────────────────────
-- Ids only. Deliberately NOT a read policy on `sessions`: a session row carries
-- personal `notes` and `wisdom`, and a groupmate has no business reading those.
create or replace function public.session_group_roster(p_group uuid)
returns table (user_id uuid, session_id uuid)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_session_group_member(p_group) then raise exception 'Not your session'; end if;
  return query
    select s.user_id, s.id from sessions s where s.group_id = p_group order by s.created_at;
end; $$;
