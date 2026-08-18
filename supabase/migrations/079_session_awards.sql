-- Session awards: a GOAT and a donkey vote per session, per-climber props and
-- notes, and a thread on the session as a whole.
--
-- A "round" is DERIVED, not logged. Sessions are per-user (migration 001) and
-- there is no crew-session row, so a round is keyed by (crew_id, round_date,
-- gym) and its participants are snapshotted from crew members who already
-- logged a session at that gym on that date.
--
-- Nothing here awards beta_points, by design: a two-person crew trading GOAT
-- votes is unguardable in principle, so the award pays nothing and stays a joke
-- rather than becoming a farmable metric.
--
-- Read access splits in two. Rounds, participants and the thread are readable
-- by crew members. Votes, tags and notes have RLS on and NO SELECT POLICY AT
-- ALL — they are only ever readable through get_award_round(), which refuses to
-- return them until everyone has voted or the round has closed. That is what
-- makes the unlock gate real instead of cosmetic.

-- ── Tables ───────────────────────────────────────────────────────────────────
create table if not exists crew_award_rounds (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references crews(id) on delete cascade,
  round_date date not null,
  gym text not null,
  opened_by uuid references auth.users(id) on delete set null,
  opened_at timestamptz not null default now(),
  closes_at timestamptz not null,
  first_vote_at timestamptz,
  unique (crew_id, round_date, gym)
);
create index if not exists crew_award_rounds_crew_idx on crew_award_rounds (crew_id, round_date desc);

create table if not exists crew_award_participants (
  round_id uuid not null references crew_award_rounds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (round_id, user_id)
);

-- One vote each way per voter (the primary key), and no voting yourself GOAT
-- (the check). Self-donkey is deliberately allowed.
create table if not exists crew_award_votes (
  round_id uuid not null references crew_award_rounds(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('goat', 'donkey')),
  subject_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (round_id, voter_id, kind),
  constraint crew_award_votes_no_self_goat check (kind = 'donkey' or voter_id <> subject_id)
);
create index if not exists crew_award_votes_round_idx on crew_award_votes (round_id);

create table if not exists crew_award_tags (
  round_id uuid not null references crew_award_rounds(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references auth.users(id) on delete cascade,
  tag text not null check (tag in (
    'best_beta', 'effort', 'powerscream', 'flash',
    'beta_vulture', 'worst_excuse', 'silky_feet', 'grinder'
  )),
  created_at timestamptz not null default now(),
  primary key (round_id, voter_id, subject_id, tag),
  constraint crew_award_tags_not_self check (voter_id <> subject_id)
);
create index if not exists crew_award_tags_round_idx on crew_award_tags (round_id);

create table if not exists crew_award_notes (
  round_id uuid not null references crew_award_rounds(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  primary key (round_id, voter_id, subject_id),
  constraint crew_award_notes_not_self check (voter_id <> subject_id)
);
create index if not exists crew_award_notes_round_idx on crew_award_notes (round_id);

-- The thread is open to the whole crew, not just the climbers who were there:
-- someone who missed the session should still get to rib the people who went.
create table if not exists crew_award_messages (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references crew_award_rounds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists crew_award_messages_round_idx on crew_award_messages (round_id, created_at);

alter table crew_award_rounds       enable row level security;
alter table crew_award_participants enable row level security;
alter table crew_award_votes        enable row level security;
alter table crew_award_tags         enable row level security;
alter table crew_award_notes        enable row level security;
alter table crew_award_messages     enable row level security;

-- ── Membership helper ────────────────────────────────────────────────────────
-- SECURITY DEFINER so policies on the child tables can reach the round's crew
-- without a recursive RLS check.
create or replace function public.is_award_round_member(p_round uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from crew_award_rounds r
     where r.id = p_round and is_crew_member(r.crew_id)
  );
$$;

-- ── SELECT policies ──────────────────────────────────────────────────────────
drop policy if exists "award rounds readable by crew" on crew_award_rounds;
create policy "award rounds readable by crew" on crew_award_rounds for select
  using (is_crew_member(crew_id));

drop policy if exists "award participants readable by crew" on crew_award_participants;
create policy "award participants readable by crew" on crew_award_participants for select
  using (is_award_round_member(round_id));

drop policy if exists "award messages readable by crew" on crew_award_messages;
create policy "award messages readable by crew" on crew_award_messages for select
  using (is_award_round_member(round_id));

drop policy if exists "award messages insert by crew" on crew_award_messages;
create policy "award messages insert by crew" on crew_award_messages for insert
  with check (user_id = auth.uid() and is_award_round_member(round_id));

drop policy if exists "award messages delete own" on crew_award_messages;
create policy "award messages delete own" on crew_award_messages for delete
  using (user_id = auth.uid());

-- crew_award_votes, crew_award_tags and crew_award_notes get NO policies on
-- purpose. RLS is on, so a client cannot read or write them at all; every path
-- goes through the SECURITY DEFINER functions below.

-- ── Discovery ────────────────────────────────────────────────────────────────
-- Recent days where two or more crew members logged a session at the same gym,
-- with the round id if one has already been opened. SECURITY DEFINER because a
-- climber cannot read another climber's `sessions` rows directly.
create or replace function public.crew_award_candidates(p_crew uuid)
returns table (round_date date, gym text, climbers integer, round_id uuid)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_crew_member(p_crew) then raise exception 'Not your crew'; end if;
  return query
    select s.date, s.location, count(distinct s.user_id)::integer, r.id
      from sessions s
      join crew_members m on m.user_id = s.user_id and m.crew_id = p_crew
      left join crew_award_rounds r
        on r.crew_id = p_crew and r.round_date = s.date and r.gym = s.location
     where s.date >= current_date - interval '7 days'
     group by s.date, s.location, r.id
    having count(distinct s.user_id) >= 2
     order by s.date desc
     limit 5;
end; $$;

-- ── Opening a round ──────────────────────────────────────────────────────────
-- Idempotent on (crew_id, round_date, gym). Re-snapshots participants on every
-- call UNTIL the first vote is cast, so a climber who logs late still gets
-- counted but the denominator cannot shift mid-vote.
create or replace function public.open_award_round(p_crew uuid, p_date date, p_gym text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_gym text; v_count integer;
begin
  if not exists (select 1 from crew_members where crew_id = p_crew and user_id = auth.uid()) then
    raise exception 'Only crew members can open awards';
  end if;
  v_gym := nullif(trim(coalesce(p_gym, '')), '');
  if v_gym is null then raise exception 'A round needs a gym'; end if;

  insert into crew_award_rounds (crew_id, round_date, gym, opened_by, closes_at)
    values (p_crew, p_date, v_gym, auth.uid(), now() + interval '24 hours')
    on conflict (crew_id, round_date, gym) do update set gym = excluded.gym
    returning id into v_id;

  if (select first_vote_at from crew_award_rounds where id = v_id) is null then
    insert into crew_award_participants (round_id, user_id)
      select v_id, m.user_id
        from crew_members m
       where m.crew_id = p_crew
         and exists (
           select 1 from sessions s
            where s.user_id = m.user_id and s.date = p_date and s.location = v_gym
         )
      on conflict do nothing;
  end if;

  select count(*) into v_count from crew_award_participants where round_id = v_id;
  if v_count < 2 then
    -- Raising rolls the whole function back, so no orphan round is left behind.
    raise exception 'Awards need at least two climbers from the crew in that session';
  end if;
  return v_id;
end; $$;

-- ── Voting ───────────────────────────────────────────────────────────────────
create or replace function public.cast_award_vote(p_round uuid, p_kind text, p_subject uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('goat', 'donkey') then raise exception 'Unknown award'; end if;
  if not exists (select 1 from crew_award_participants where round_id = p_round and user_id = auth.uid()) then
    raise exception 'Only climbers from that session can vote';
  end if;
  if not exists (select 1 from crew_award_participants where round_id = p_round and user_id = p_subject) then
    raise exception 'That climber was not in the session';
  end if;
  if exists (select 1 from crew_award_rounds where id = p_round and now() > closes_at) then
    raise exception 'Voting has closed';
  end if;

  -- crew_award_votes_no_self_goat rejects a self-GOAT here, at the database.
  insert into crew_award_votes (round_id, voter_id, kind, subject_id)
    values (p_round, auth.uid(), p_kind, p_subject)
    on conflict (round_id, voter_id, kind)
      do update set subject_id = excluded.subject_id, created_at = now();

  update crew_award_rounds set first_vote_at = coalesce(first_vote_at, now()) where id = p_round;
end; $$;

-- ── Props and notes ──────────────────────────────────────────────────────────
-- Returns true when the tag ended up ON, false when it was removed.
create or replace function public.toggle_award_tag(p_round uuid, p_subject uuid, p_tag text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_deleted integer;
begin
  if not exists (select 1 from crew_award_participants where round_id = p_round and user_id = auth.uid()) then
    raise exception 'Only climbers from that session can give props';
  end if;
  if not exists (select 1 from crew_award_participants where round_id = p_round and user_id = p_subject) then
    raise exception 'That climber was not in the session';
  end if;
  if exists (select 1 from crew_award_rounds where id = p_round and now() > closes_at) then
    raise exception 'Voting has closed';
  end if;

  delete from crew_award_tags
   where round_id = p_round and voter_id = auth.uid() and subject_id = p_subject and tag = p_tag;
  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then return false; end if;

  insert into crew_award_tags (round_id, voter_id, subject_id, tag)
    values (p_round, auth.uid(), p_subject, p_tag);
  return true;
end; $$;

-- An empty body clears the note.
create or replace function public.set_award_note(p_round uuid, p_subject uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare v_body text;
begin
  if not exists (select 1 from crew_award_participants where round_id = p_round and user_id = auth.uid()) then
    raise exception 'Only climbers from that session can comment';
  end if;
  if not exists (select 1 from crew_award_participants where round_id = p_round and user_id = p_subject) then
    raise exception 'That climber was not in the session';
  end if;
  if exists (select 1 from crew_award_rounds where id = p_round and now() > closes_at) then
    raise exception 'Voting has closed';
  end if;

  v_body := nullif(trim(coalesce(p_body, '')), '');
  if v_body is null then
    delete from crew_award_notes
     where round_id = p_round and voter_id = auth.uid() and subject_id = p_subject;
    return;
  end if;

  insert into crew_award_notes (round_id, voter_id, subject_id, body)
    values (p_round, auth.uid(), p_subject, v_body)
    on conflict (round_id, voter_id, subject_id)
      do update set body = excluded.body, created_at = now();
end; $$;

-- ── The unlock gate ──────────────────────────────────────────────────────────
-- Progress and your own picks are always returned. Everyone else's votes, tags
-- and notes are returned ONLY once every participant has a GOAT vote in, or the
-- round has closed. A participant counts as having voted on their GOAT vote;
-- the donkey vote is optional, so an abstainer cannot hold the round hostage.
create or replace function public.get_award_round(p_round uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  v_crew uuid; v_closes timestamptz; v_participants integer; v_voted integer;
  v_unlocked boolean; v_out jsonb; v_me uuid := auth.uid();
begin
  select crew_id, closes_at into v_crew, v_closes from crew_award_rounds where id = p_round;
  if v_crew is null then raise exception 'No such round'; end if;
  if not is_crew_member(v_crew) then raise exception 'Not your crew'; end if;

  select count(*) into v_participants from crew_award_participants where round_id = p_round;
  select count(distinct voter_id) into v_voted
    from crew_award_votes where round_id = p_round and kind = 'goat';
  v_unlocked := (v_participants > 0 and v_voted >= v_participants) or now() > v_closes;

  v_out := jsonb_build_object(
    'round_id', p_round,
    'participants', v_participants,
    'voted', v_voted,
    'closes_at', v_closes,
    'unlocked', v_unlocked,
    'voters', (select coalesce(jsonb_agg(distinct voter_id), '[]'::jsonb)
                 from crew_award_votes where round_id = p_round and kind = 'goat'),
    'mine', jsonb_build_object(
      'votes', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'subject_id', subject_id)), '[]'::jsonb)
                  from crew_award_votes where round_id = p_round and voter_id = v_me),
      'tags',  (select coalesce(jsonb_agg(jsonb_build_object('subject_id', subject_id, 'tag', tag)), '[]'::jsonb)
                  from crew_award_tags where round_id = p_round and voter_id = v_me),
      'notes', (select coalesce(jsonb_agg(jsonb_build_object('subject_id', subject_id, 'body', body)), '[]'::jsonb)
                  from crew_award_notes where round_id = p_round and voter_id = v_me)
    )
  );

  if not v_unlocked then return v_out; end if;

  return v_out || jsonb_build_object(
    'votes', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'voter_id', voter_id, 'subject_id', subject_id)), '[]'::jsonb)
                from crew_award_votes where round_id = p_round),
    'tags',  (select coalesce(jsonb_agg(jsonb_build_object('voter_id', voter_id, 'subject_id', subject_id, 'tag', tag)), '[]'::jsonb)
                from crew_award_tags where round_id = p_round),
    'notes', (select coalesce(jsonb_agg(jsonb_build_object('voter_id', voter_id, 'subject_id', subject_id, 'body', body)), '[]'::jsonb)
                from crew_award_notes where round_id = p_round)
  );
end; $$;

-- ── History (for the repeat-donkey streak) ───────────────────────────────────
-- Raw per-round vote counts for UNLOCKED rounds only, so the client can tally
-- winners with the same pure function the recap uses.
create or replace function public.crew_award_history(p_crew uuid, p_limit int default 12)
returns table (round_id uuid, round_date date, kind text, subject_id uuid, votes integer)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_crew_member(p_crew) then raise exception 'Not your crew'; end if;
  return query
  with recent as (
    select r.id, r.round_date, r.closes_at,
           (select count(*) from crew_award_participants p where p.round_id = r.id) as participants,
           (select count(distinct v.voter_id) from crew_award_votes v
             where v.round_id = r.id and v.kind = 'goat') as voted
      from crew_award_rounds r
     where r.crew_id = p_crew
     order by r.round_date desc
     limit least(coalesce(p_limit, 12), 52)
  )
  select ro.id, ro.round_date, v.kind, v.subject_id, count(*)::integer
    from recent ro
    join crew_award_votes v on v.round_id = ro.id
   where (ro.participants > 0 and ro.voted >= ro.participants) or now() > ro.closes_at
   group by ro.id, ro.round_date, v.kind, v.subject_id;
end; $$;
