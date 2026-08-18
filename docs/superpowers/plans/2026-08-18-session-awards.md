# Session Awards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a crew climbs together, let them vote a GOAT and a donkey for that session, tag and comment on each other's performance, and talk about the session as a whole.

**Architecture:** A "round" is derived, not logged — keyed `(crew_id, round_date, gym)` and populated from crew members who already logged a `sessions` row at that gym that day, so nobody gains a new logging step. All reads of votes/tags/notes go through one `SECURITY DEFINER` RPC that refuses to return results until every participant has voted or 24h has passed; those three tables have RLS on and **no SELECT policy**, which is what makes the gate real rather than cosmetic. Tallying, unlocking and streak logic live in one pure util so they can be TDD'd.

**Tech Stack:** React 19 + TypeScript, Vite, React Query (array query keys), Supabase (Postgres + RLS + `SECURITY DEFINER` RPCs), Tailwind (`sage`/`khaki`), `lucide-react`, `react-hot-toast`, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-18-session-awards-design.md`
**Visual reference (authoritative for layout, copy and colour):** https://claude.ai/code/artifact/755bc208-794e-4174-afc7-765b216621d3

## Global Constraints

- **Branch:** `feature/session-awards`. Do not push to `main`.
- **Release gate:** migration `079_session_awards.sql` is applied **by hand in the Supabase dashboard** and must be applied **before** the client that reads it is deployed. Pushing `main` is a release.
- **No `beta_points`.** Nothing in this feature inserts into `beta_points`. This is a deliberate design decision, not an oversight.
- **Lint baseline is 16 problems (15 errors, 1 warning)** as measured on 2026-08-18 with `npm run lint`. New work must add **zero**. Re-measure before starting; the number drifts.
- **Build:** `npm run build` (= `tsc -b && vite build`). `noUnusedLocals`/`noUnusedParameters` are ON — an unused local is a build-failing error.
- **Tests:** only pure functions in `src/utils/` are tested. Do not add `@testing-library/react`. Hooks, components and pages are verified by `npm run build` plus the manual pass in Task 7.
- **Patterns:** array query keys; hooks named `useX`; **no FK embed between a table and `profiles`** — fetch profiles in a second `.in('id', ids)` query; `BottomSheet` for modals; `react-hot-toast` for feedback.
- **A `BottomSheet` must be a sibling of a heading, never a child** — it inherits font weight and is invalid markup.
- **Vocabulary:** "Sendtrain" is the user-facing name for a per-boulder crew; this feature is on a **Crew** (the persistent group at `/crews/:crewId`). Never call a round a "session" in DB names — `sessions` already means the per-user row.

---

## File Structure

| File | Responsibility |
|---|---|
| Create `supabase/migrations/079_session_awards.sql` | Six tables, RLS, and six RPCs. The whole server contract. |
| Modify `src/types/index.ts` | `AwardTag` union + `AWARD_TAGS` display metadata (next to the existing `BADGES`). |
| Create `src/utils/sessionAwards.ts` | Pure logic: `awardTally`, `awardsUnlocked`, `tagTally`, `donkeyStreak`. |
| Create `src/utils/__tests__/sessionAwards.test.ts` | Tests for the above. |
| Create `src/hooks/useSessionAwards.ts` | Every query and mutation for the feature. |
| Create `src/components/RateSessionSheet.tsx` | The voting `BottomSheet` (GOAT, donkey, props, comments). |
| Create `src/components/SessionAwardsCard.tsx` | The crew-page entry card ("Awards are open"). |
| Create `src/pages/SessionAwardsPage.tsx` | The verdict recap at `/crews/:crewId/awards/:roundId`. |
| Modify `src/pages/CrewGroupPage.tsx` | Mount `SessionAwardsCard` under the crew header. |
| Modify `src/App.tsx` | Add the recap route. |

---

## Task 1: Migration 079 — tables, RLS and RPCs

> **AMENDED AFTER REVIEW — do not re-execute this task from the SQL below.**
> `supabase/migrations/079_session_awards.sql` as committed (767f54d + 0800f28)
> is the source of truth. Review found the SQL here trims the gym on one side of
> a comparison only, while `sessions.location` is untrimmed free text — which
> makes a whitespace-padded gym produce a permanently unopenable round. It also
> triplicated the three-guard preamble and defined the unlock predicate twice.
> The committed file canonicalises the gym on `trim()` everywhere and extracts
> `assert_award_voter()` and `award_round_unlocked()` as the single definitions.
> If you need to re-derive this migration, read the committed file, not this.


**Files:**
- Create: `supabase/migrations/079_session_awards.sql`

**Interfaces:**
- Consumes: `crews`, `crew_members`, `is_crew_member(uuid)` (migration 062), `sessions` (migration 001).
- Produces: RPCs `crew_award_candidates(uuid)`, `open_award_round(uuid, date, text)`, `cast_award_vote(uuid, text, uuid)`, `toggle_award_tag(uuid, uuid, text)`, `set_award_note(uuid, uuid, text)`, `get_award_round(uuid)`, `crew_award_history(uuid, int)`; tables `crew_award_rounds`, `crew_award_participants`, `crew_award_votes`, `crew_award_tags`, `crew_award_notes`, `crew_award_messages`.

- [ ] **Step 1: Write the migration file**

```sql
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
```

- [ ] **Step 2: Read the file back and check the three guard classes are constraints, not code**

Run: `grep -n "primary key\|check (\|constraint" supabase/migrations/079_session_awards.sql`
Expected: one vote each way is `primary key (round_id, voter_id, kind)`; no-self-GOAT is `crew_award_votes_no_self_goat`; one tag each is `primary key (round_id, voter_id, subject_id, tag)`; one note each is `primary key (round_id, voter_id, subject_id)`; the tag vocabulary is a `check (tag in (...))`. If any of these is enforced by a `select` then `insert` in plpgsql instead, fix it — check-then-write is explicitly rejected in this codebase.

- [ ] **Step 3: Confirm no policy was written for the three gated tables**

Run: `grep -n "on crew_award_votes\|on crew_award_tags\|on crew_award_notes" supabase/migrations/079_session_awards.sql`
Expected: only the three `alter table ... enable row level security` lines match. **Zero `create policy` lines.** If a policy exists on any of them, the unlock gate is bypassable — delete it.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/079_session_awards.sql
git commit -m "Add session awards tables, RLS and RPCs (migration 079)"
```

- [ ] **Step 5: Apply the migration by hand**

Paste the file into the Supabase dashboard SQL editor and run it. **This is the release gate** — do not deploy any later task's client code before this succeeds. Then sanity-check the gate from the dashboard as a non-service role:

```sql
select * from crew_award_votes limit 1;
```
Expected: zero rows even when rows exist, because there is no SELECT policy.

---

## Task 2: Tag vocabulary and pure logic (TDD)

**Files:**
- Modify: `src/types/index.ts` (append near the existing `BADGES` export)
- Create: `src/utils/sessionAwards.ts`
- Test: `src/utils/__tests__/sessionAwards.test.ts`

**Interfaces:**
- Consumes: `weeklyStreak(dates: string[], now: Date): number` from `src/utils/crewStreak.ts`.
- Produces:
  - `type AwardTag = 'best_beta' | 'effort' | 'powerscream' | 'flash' | 'beta_vulture' | 'worst_excuse' | 'silky_feet' | 'grinder'`
  - `AWARD_TAGS: { key: AwardTag; emoji: string; label: string }[]`
  - `interface AwardVoteRow { kind: 'goat' | 'donkey'; voter_id: string; subject_id: string }`
  - `interface AwardTagRow { subject_id: string; tag: AwardTag }`
  - `interface AwardHistoryRow { round_id: string; round_date: string; kind: 'goat' | 'donkey'; subject_id: string; votes: number }`
  - `awardTally(votes: AwardVoteRow[], kind: 'goat' | 'donkey'): { winners: string[]; counts: Record<string, number>; topCount: number }`
  - `awardsUnlocked(input: { participants: number; voted: number; closesAt: string; now: Date }): boolean`
  - `tagTally(rows: AwardTagRow[]): Record<string, { tag: AwardTag; count: number }[]>`
  - `donkeyStreak(rows: AwardHistoryRow[], userId: string, now: Date): number`

- [ ] **Step 1: Add the tag vocabulary to `src/types/index.ts`**

Append this at the end of the file. The `key` values must match the `check (tag in (...))` list in migration 079 exactly.

```ts
/**
 * The props a climber can be tagged with for one session. Keys are stored in
 * crew_award_tags.tag and constrained there; the emoji + label pairing follows
 * the existing crew badge vocabulary.
 */
export type AwardTag =
  | 'best_beta' | 'effort' | 'powerscream' | 'flash'
  | 'beta_vulture' | 'worst_excuse' | 'silky_feet' | 'grinder'

export const AWARD_TAGS: { key: AwardTag; emoji: string; label: string }[] = [
  { key: 'best_beta',    emoji: '🧠', label: 'Best beta' },
  { key: 'effort',       emoji: '💪', label: 'Effort' },
  { key: 'powerscream',  emoji: '📣', label: 'Powerscream' },
  { key: 'flash',        emoji: '⚡', label: 'Flash' },
  { key: 'beta_vulture', emoji: '🎥', label: 'Beta vulture' },
  { key: 'worst_excuse', emoji: '🩹', label: 'Worst excuse' },
  { key: 'silky_feet',   emoji: '🧗', label: 'Silky feet' },
  { key: 'grinder',      emoji: '🪨', label: 'Grinder' },
]
```

- [ ] **Step 2: Write the failing tests**

Create `src/utils/__tests__/sessionAwards.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { awardTally, awardsUnlocked, tagTally, donkeyStreak } from '../sessionAwards'
import type { AwardVoteRow, AwardHistoryRow } from '../sessionAwards'

const vote = (kind: 'goat' | 'donkey', voter: string, subject: string): AwardVoteRow =>
  ({ kind, voter_id: voter, subject_id: subject })

describe('awardTally', () => {
  it('has no winner with no votes', () => {
    expect(awardTally([], 'goat')).toEqual({ winners: [], counts: {}, topCount: 0 })
  })

  it('counts only the requested award', () => {
    const votes = [vote('goat', 'a', 'ida'), vote('donkey', 'a', 'nils')]
    expect(awardTally(votes, 'goat')).toEqual({ winners: ['ida'], counts: { ida: 1 }, topCount: 1 })
  })

  it('picks the climber with the most votes', () => {
    const votes = [vote('goat', 'a', 'ida'), vote('goat', 'b', 'ida'), vote('goat', 'c', 'thea')]
    const r = awardTally(votes, 'goat')
    expect(r.winners).toEqual(['ida'])
    expect(r.topCount).toBe(2)
    expect(r.counts).toEqual({ ida: 2, thea: 1 })
  })

  it('awards everyone tied — a split verdict, never an arbitrary pick', () => {
    const votes = [vote('goat', 'a', 'ida'), vote('goat', 'b', 'thea')]
    expect(awardTally(votes, 'goat').winners.slice().sort()).toEqual(['ida', 'thea'])
  })

  it('orders tied winners by who was voted for first, which is the order they display in', () => {
    const votes = [vote('goat', 'a', 'thea'), vote('goat', 'b', 'ida')]
    expect(awardTally(votes, 'goat').winners).toEqual(['thea', 'ida'])
  })
})

describe('awardsUnlocked', () => {
  const now = new Date('2026-08-18T12:00:00Z')
  const later = '2026-08-19T06:00:00Z'
  const past = '2026-08-18T06:00:00Z'

  it('is locked while someone has not voted', () => {
    expect(awardsUnlocked({ participants: 5, voted: 4, closesAt: later, now })).toBe(false)
  })

  it('unlocks when every participant has voted', () => {
    expect(awardsUnlocked({ participants: 5, voted: 5, closesAt: later, now })).toBe(true)
  })

  it('unlocks on time even with votes missing', () => {
    expect(awardsUnlocked({ participants: 5, voted: 1, closesAt: past, now })).toBe(true)
  })

  it('stays locked with no participants, so an empty round never shows a verdict', () => {
    expect(awardsUnlocked({ participants: 0, voted: 0, closesAt: later, now })).toBe(false)
  })
})

describe('tagTally', () => {
  it('is empty for no rows', () => {
    expect(tagTally([])).toEqual({})
  })

  it('counts per climber and sorts by count descending', () => {
    const result = tagTally([
      { subject_id: 'ida', tag: 'flash' },
      { subject_id: 'ida', tag: 'best_beta' },
      { subject_id: 'ida', tag: 'best_beta' },
      { subject_id: 'nils', tag: 'grinder' },
    ])
    expect(result.ida).toEqual([
      { tag: 'best_beta', count: 2 },
      { tag: 'flash', count: 1 },
    ])
    expect(result.nils).toEqual([{ tag: 'grinder', count: 1 }])
  })

  it('breaks a count tie alphabetically by tag, so the order is stable', () => {
    const result = tagTally([
      { subject_id: 'ida', tag: 'silky_feet' },
      { subject_id: 'ida', tag: 'effort' },
    ])
    expect(result.ida.map(t => t.tag)).toEqual(['effort', 'silky_feet'])
  })
})

describe('donkeyStreak', () => {
  // A fixed "now" (a Tuesday) so week math is deterministic.
  const now = new Date('2026-08-18T12:00:00Z')
  const donkey = (round: string, date: string, subject: string, votes = 2): AwardHistoryRow =>
    ({ round_id: round, round_date: date, kind: 'donkey', subject_id: subject, votes })

  it('is 0 with no history', () => {
    expect(donkeyStreak([], 'nils', now)).toBe(0)
  })

  it('counts this week when the user is this week’s donkey', () => {
    expect(donkeyStreak([donkey('r1', '2026-08-17', 'nils')], 'nils', now)).toBe(1)
  })

  it('counts consecutive weeks', () => {
    const rows = [
      donkey('r1', '2026-08-17', 'nils'),
      donkey('r2', '2026-08-10', 'nils'),
      donkey('r3', '2026-08-03', 'nils'),
    ]
    expect(donkeyStreak(rows, 'nils', now)).toBe(3)
  })

  it('breaks the streak on a week someone else was donkey', () => {
    const rows = [
      donkey('r1', '2026-08-17', 'nils'),
      donkey('r2', '2026-08-10', 'ida'),
      donkey('r3', '2026-08-03', 'nils'),
    ]
    expect(donkeyStreak(rows, 'nils', now)).toBe(1)
  })

  it('ignores GOAT rows entirely', () => {
    const rows: AwardHistoryRow[] = [
      { round_id: 'r1', round_date: '2026-08-17', kind: 'goat', subject_id: 'nils', votes: 3 },
    ]
    expect(donkeyStreak(rows, 'nils', now)).toBe(0)
  })

  it('counts a tied donkey week for everyone tied', () => {
    const rows = [donkey('r1', '2026-08-17', 'nils', 1), donkey('r1', '2026-08-17', 'ida', 1)]
    expect(donkeyStreak(rows, 'nils', now)).toBe(1)
    expect(donkeyStreak(rows, 'ida', now)).toBe(1)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/sessionAwards.test.ts`
Expected: FAIL — `Failed to resolve import "../sessionAwards"`.

- [ ] **Step 4: Write the implementation**

Create `src/utils/sessionAwards.ts`:

```ts
import type { AwardTag } from '../types'
import { weeklyStreak } from './crewStreak'

export interface AwardVoteRow {
  kind: 'goat' | 'donkey'
  voter_id: string
  subject_id: string
}

export interface AwardTagRow {
  subject_id: string
  tag: AwardTag
}

export interface AwardHistoryRow {
  round_id: string
  round_date: string
  kind: 'goat' | 'donkey'
  subject_id: string
  votes: number
}

export interface AwardResult {
  winners: string[]
  counts: Record<string, number>
  topCount: number
}

/**
 * Tally one award for one round. A tie awards everyone tied — a split verdict —
 * rather than breaking it by timestamp, which would hand a real award to an
 * accident of ordering. Winners come back in first-vote-seen order so repeated
 * calls on the same input render identically.
 */
export function awardTally(votes: AwardVoteRow[], kind: 'goat' | 'donkey'): AwardResult {
  const counts: Record<string, number> = {}
  const order: string[] = []
  for (const v of votes) {
    if (v.kind !== kind) continue
    if (counts[v.subject_id] === undefined) { counts[v.subject_id] = 0; order.push(v.subject_id) }
    counts[v.subject_id] += 1
  }
  const topCount = order.reduce((m, id) => Math.max(m, counts[id]), 0)
  return { winners: order.filter(id => counts[id] === topCount), counts, topCount }
}

/**
 * Whether a round's results may be shown. Mirrors get_award_round's gate so the
 * client can pick the right card without a round-trip; the RPC stays the
 * authority — it is what actually withholds the rows.
 *
 * `voted` counts participants with a GOAT vote in. A round with no participants
 * never unlocks, so a stale or empty round cannot render a verdict.
 */
export function awardsUnlocked(input: {
  participants: number
  voted: number
  closesAt: string
  now: Date
}): boolean {
  if (input.participants <= 0) return false
  if (input.voted >= input.participants) return true
  return input.now.getTime() > new Date(input.closesAt).getTime()
}

/** Props per climber, most-tagged first, ties broken alphabetically by tag. */
export function tagTally(rows: AwardTagRow[]): Record<string, { tag: AwardTag; count: number }[]> {
  const bySubject: Record<string, Record<string, number>> = {}
  for (const r of rows) {
    const tags = (bySubject[r.subject_id] ??= {})
    tags[r.tag] = (tags[r.tag] ?? 0) + 1
  }
  const out: Record<string, { tag: AwardTag; count: number }[]> = {}
  for (const [subject, tags] of Object.entries(bySubject)) {
    out[subject] = Object.entries(tags)
      .map(([tag, count]) => ({ tag: tag as AwardTag, count }))
      .sort((a, b) => (b.count - a.count) || a.tag.localeCompare(b.tag))
  }
  return out
}

/**
 * How many weeks in a row a climber has been the crew's donkey. Counted in
 * weeks of rounds, not weeks of attendance — a quiet week does not extend it.
 * A tied round counts for everyone tied, matching awardTally.
 */
export function donkeyStreak(rows: AwardHistoryRow[], userId: string, now: Date): number {
  const byRound = new Map<string, { date: string; votes: AwardVoteRow[] }>()
  for (const r of rows) {
    if (r.kind !== 'donkey') continue
    const entry = byRound.get(r.round_id) ?? { date: r.round_date, votes: [] }
    // awardTally counts rows, so expand the aggregated count back into rows.
    for (let i = 0; i < r.votes; i++) {
      entry.votes.push({ kind: 'donkey', voter_id: `${r.round_id}:${i}`, subject_id: r.subject_id })
    }
    byRound.set(r.round_id, entry)
  }
  const dates: string[] = []
  for (const { date, votes } of byRound.values()) {
    if (awardTally(votes, 'donkey').winners.includes(userId)) dates.push(date)
  }
  return weeklyStreak(dates, now)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/sessionAwards.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 6: Run the whole suite and the build**

Run: `npx vitest run && npm run build`
Expected: all tests pass (180 existing + 18 new = 198), build succeeds with no `noUnusedLocals` errors.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/utils/sessionAwards.ts src/utils/__tests__/sessionAwards.test.ts
git commit -m "Add session award tag vocabulary and pure tally/unlock/streak logic"
```

---

## Task 3: Hooks

**Files:**
- Create: `src/hooks/useSessionAwards.ts`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts`; `useAuth()` from `src/providers/AuthProvider.tsx`; the RPCs from Task 1; `AwardTag` from `src/types`; `AwardVoteRow`, `AwardTagRow`, `AwardHistoryRow` from `src/utils/sessionAwards.ts`.
- Produces: `AwardCandidate`, `AwardRoundState`, `AwardParticipant`, `AwardMessage` types; hooks `useAwardCandidates`, `useOpenAwardRound`, `useAwardRound`, `useAwardParticipants`, `useCastAwardVote`, `useToggleAwardTag`, `useSetAwardNote`, `useAwardMessages`, `usePostAwardMessage`, `useCrewAwardHistory`.

- [ ] **Step 1: Write the hooks file**

Create `src/hooks/useSessionAwards.ts`. Note the two house rules in play: array query keys, and **no FK embed to `profiles`** — participants are enriched with a second `.in('id', ids)` query.

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import type { AwardTag } from '../types'
import type { AwardVoteRow, AwardTagRow, AwardHistoryRow } from '../utils/sessionAwards'

/** A recent day where two or more crew members logged a session at one gym. */
export interface AwardCandidate {
  round_date: string
  gym: string
  climbers: number
  round_id: string | null
}

export interface AwardRoundState {
  round_id: string
  participants: number
  voted: number
  closes_at: string
  unlocked: boolean
  voters: string[]
  /** Always present: what you personally submitted, so you can change it. */
  mine: {
    votes: { kind: 'goat' | 'donkey'; subject_id: string }[]
    tags: AwardTagRow[]
    notes: { subject_id: string; body: string }[]
  }
  /** Present only once `unlocked` — the RPC withholds these until then. */
  votes?: AwardVoteRow[]
  tags?: { voter_id: string; subject_id: string; tag: AwardTag }[]
  notes?: { voter_id: string; subject_id: string; body: string }[]
}

export interface AwardParticipant {
  user_id: string
  username: string | null
  avatar_url: string | null
}

export interface AwardMessage {
  id: string
  user_id: string
  body: string
  created_at: string
  username: string | null
  avatar_url: string | null
}

async function profilesByIds(ids: string[]) {
  const map = new Map<string, { username: string | null; avatar_url: string | null }>()
  if (ids.length === 0) return map
  const { data } = await supabase.from('profiles').select('id, username, avatar_url').in('id', ids)
  for (const p of data ?? []) {
    map.set(p.id as string, {
      username: p.username as string | null,
      avatar_url: p.avatar_url as string | null,
    })
  }
  return map
}

/** Sessions from the last 7 days that two or more of this crew were at. */
export function useAwardCandidates(crewId: string) {
  return useQuery({
    queryKey: ['award_candidates', crewId],
    enabled: !!crewId,
    queryFn: async (): Promise<AwardCandidate[]> => {
      const { data, error } = await supabase.rpc('crew_award_candidates', { p_crew: crewId })
      if (error) throw error
      return (data ?? []) as AwardCandidate[]
    },
  })
}

/** Opens (or re-snapshots) a round and returns its id. Idempotent. */
export function useOpenAwardRound() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { crewId: string; date: string; gym: string }): Promise<string> => {
      const { data, error } = await supabase.rpc('open_award_round', {
        p_crew: v.crewId, p_date: v.date, p_gym: v.gym,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['award_candidates', v.crewId] }),
  })
}

/** One round's progress, your own picks, and — once unlocked — everyone's. */
export function useAwardRound(roundId: string | null) {
  return useQuery({
    queryKey: ['award_round', roundId],
    enabled: !!roundId,
    queryFn: async (): Promise<AwardRoundState> => {
      const { data, error } = await supabase.rpc('get_award_round', { p_round: roundId })
      if (error) throw error
      return data as AwardRoundState
    },
  })
}

export function useAwardParticipants(roundId: string | null) {
  return useQuery({
    queryKey: ['award_participants', roundId],
    enabled: !!roundId,
    queryFn: async (): Promise<AwardParticipant[]> => {
      const { data, error } = await supabase
        .from('crew_award_participants')
        .select('user_id')
        .eq('round_id', roundId)
      if (error) throw error
      const ids = (data ?? []).map(r => r.user_id as string)
      const byId = await profilesByIds(ids)
      return ids.map(id => ({
        user_id: id,
        username: byId.get(id)?.username ?? null,
        avatar_url: byId.get(id)?.avatar_url ?? null,
      }))
    },
  })
}

export function useCastAwardVote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { roundId: string; kind: 'goat' | 'donkey'; subjectId: string }) => {
      const { error } = await supabase.rpc('cast_award_vote', {
        p_round: v.roundId, p_kind: v.kind, p_subject: v.subjectId,
      })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['award_round', v.roundId] }),
  })
}

export function useToggleAwardTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { roundId: string; subjectId: string; tag: AwardTag }): Promise<boolean> => {
      const { data, error } = await supabase.rpc('toggle_award_tag', {
        p_round: v.roundId, p_subject: v.subjectId, p_tag: v.tag,
      })
      if (error) throw error
      return data as boolean
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['award_round', v.roundId] }),
  })
}

export function useSetAwardNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { roundId: string; subjectId: string; body: string }) => {
      const { error } = await supabase.rpc('set_award_note', {
        p_round: v.roundId, p_subject: v.subjectId, p_body: v.body,
      })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['award_round', v.roundId] }),
  })
}

export function useAwardMessages(roundId: string | null) {
  return useQuery({
    queryKey: ['award_messages', roundId],
    enabled: !!roundId,
    queryFn: async (): Promise<AwardMessage[]> => {
      const { data, error } = await supabase
        .from('crew_award_messages')
        .select('id, user_id, body, created_at')
        .eq('round_id', roundId)
        .order('created_at', { ascending: true })
      if (error) throw error
      const rows = (data ?? []) as Omit<AwardMessage, 'username' | 'avatar_url'>[]
      const byId = await profilesByIds(Array.from(new Set(rows.map(r => r.user_id))))
      return rows.map(r => ({
        ...r,
        username: byId.get(r.user_id)?.username ?? null,
        avatar_url: byId.get(r.user_id)?.avatar_url ?? null,
      }))
    },
  })
}

export function usePostAwardMessage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (v: { roundId: string; body: string }) => {
      const { error } = await supabase
        .from('crew_award_messages')
        .insert({ round_id: v.roundId, user_id: user!.id, body: v.body })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['award_messages', v.roundId] }),
  })
}

/** Unlocked rounds' raw vote counts, for the repeat-donkey streak. */
export function useCrewAwardHistory(crewId: string) {
  return useQuery({
    queryKey: ['award_history', crewId],
    enabled: !!crewId,
    queryFn: async (): Promise<AwardHistoryRow[]> => {
      const { data, error } = await supabase.rpc('crew_award_history', { p_crew: crewId, p_limit: 12 })
      if (error) throw error
      return (data ?? []) as AwardHistoryRow[]
    },
  })
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds. If `tsc` complains that an import is unused, remove it — `noUnusedLocals` is on.

- [ ] **Step 3: Confirm no `profiles` FK embed slipped in**

Run: `grep -n "profiles(" src/hooks/useSessionAwards.ts`
Expected: no matches. Profiles are fetched only via `profilesByIds`.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSessionAwards.ts
git commit -m "Add session award queries and mutations"
```

---

## Task 4: The voting sheet

**Files:**
- Create: `src/components/RateSessionSheet.tsx`

**Interfaces:**
- Consumes: `BottomSheet`; `useAwardRound`, `useAwardParticipants`, `useCastAwardVote`, `useToggleAwardTag`, `useSetAwardNote` from Task 3; `AWARD_TAGS`, `AwardTag` from `src/types`.
- Produces: `RateSessionSheet({ open, onClose, roundId }: { open: boolean; onClose: () => void; roundId: string })`.

Layout, copy and colour come from artboards **2 · Vote GOAT + donkey** and **3 · Props + comments** in the mockup. GOAT is `sage-700`, donkey is `khaki-600`, selection is a `ring-2 ring-offset-2` in the award's colour with a check badge.

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react'
import type { ReactNode } from 'react'
import toast from 'react-hot-toast'
import { Check } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import { GoatIcon, DonkeyIcon } from './AwardIcons'
import { AWARD_TAGS, type AwardTag } from '../types'
import {
  useAwardRound, useAwardParticipants, useCastAwardVote,
  useToggleAwardTag, useSetAwardNote,
} from '../hooks/useSessionAwards'
import { useAuth } from '../providers/AuthProvider'

export function RateSessionSheet({
  open, onClose, roundId,
}: { open: boolean; onClose: () => void; roundId: string }) {
  const { user } = useAuth()
  const { data: round } = useAwardRound(open ? roundId : null)
  const { data: participants = [] } = useAwardParticipants(open ? roundId : null)
  const castVote = useCastAwardVote()
  const toggleTag = useToggleAwardTag()
  const setNote = useSetAwardNote()

  const myGoat = round?.mine.votes.find(v => v.kind === 'goat')?.subject_id ?? null
  const myDonkey = round?.mine.votes.find(v => v.kind === 'donkey')?.subject_id ?? null
  const myTags = new Set((round?.mine.tags ?? []).map(t => `${t.subject_id}:${t.tag}`))
  const others = participants.filter(p => p.user_id !== user?.id)

  const vote = (kind: 'goat' | 'donkey', subjectId: string) => {
    castVote.mutate({ roundId, kind, subjectId }, {
      onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not vote'),
    })
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Rate the session">
      <div className="space-y-5">
        <AwardPicker
          label="GOAT of the session"
          hint="Who taught you the most. One vote."
          icon={<GoatIcon size={17} />}
          accent="sage"
          people={others}
          picked={myGoat}
          onPick={id => vote('goat', id)}
        />

        <AwardPicker
          label="Donkey of the session"
          hint="Worst excuse, worst beta, worst timing. Be fair."
          icon={<DonkeyIcon size={17} />}
          accent="khaki"
          people={participants}
          picked={myDonkey}
          onPick={id => vote('donkey', id)}
        />

        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
            Props · tag what they did
          </h3>
          <div className="space-y-3">
            {others.map(p => (
              <div key={p.user_id} className="bg-gray-50 rounded-2xl p-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-full bg-sage-100 grid place-items-center text-[13px] font-semibold text-sage-700 overflow-hidden flex-shrink-0">
                    {p.avatar_url
                      ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                      : (p.username ?? '?').slice(0, 1).toUpperCase()}
                  </span>
                  <span className="flex-1 text-sm font-semibold text-gray-800 truncate">
                    {p.username ?? 'Someone'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 mt-2.5">
                  {AWARD_TAGS.map(t => {
                    const on = myTags.has(`${p.user_id}:${t.key}`)
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => toggleTag.mutate(
                          { roundId, subjectId: p.user_id, tag: t.key },
                          { onError: () => toast.error('Could not tag') },
                        )}
                        className={`min-h-9 inline-flex items-center px-3 rounded-full text-[13px] font-semibold border ${
                          on
                            ? 'bg-sage-50 border-sage-300 text-sage-800'
                            : 'bg-white border-gray-200 text-gray-500'
                        }`}
                      >
                        {t.emoji} {t.label}
                      </button>
                    )
                  })}
                </div>

                <NoteField
                  initial={round?.mine.notes.find(n => n.subject_id === p.user_id)?.body ?? ''}
                  onSave={body => setNote.mutate(
                    { roundId, subjectId: p.user_id, body },
                    { onError: () => toast.error('Could not save') },
                  )}
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => { toast.success('Verdict posted'); onClose() }}
            disabled={!myGoat}
            className="w-full bg-sage-700 text-white py-3 rounded-xl font-semibold disabled:opacity-50"
          >
            Post my verdict
          </button>
          <p className="text-[11px] text-gray-400 text-center mt-2">
            Hidden until everyone has voted or the session is 24h old.
          </p>
        </div>
      </div>
    </BottomSheet>
  )
}

function AwardPicker({
  label, hint, icon, accent, people, picked, onPick,
}: {
  label: string
  hint: string
  icon: ReactNode
  accent: 'sage' | 'khaki'
  people: { user_id: string; username: string | null; avatar_url: string | null }[]
  picked: string | null
  onPick: (id: string) => void
}) {
  const badge = accent === 'sage' ? 'bg-sage-700' : 'bg-khaki-600'
  const ring = accent === 'sage' ? 'ring-sage-700' : 'ring-khaki-600'
  const avatar = accent === 'sage' ? 'bg-sage-100 text-sage-700' : 'bg-khaki-100 text-khaki-700'
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className={`w-[26px] h-[26px] rounded-full ${badge} text-white grid place-items-center flex-shrink-0`}>
          {icon}
        </span>
        <h3 className="text-sm font-bold">{label}</h3>
      </div>
      <p className="text-xs text-gray-400 ml-[34px] mb-3">{hint}</p>
      <div className="flex gap-2.5">
        {people.map(p => (
          <button
            key={p.user_id}
            type="button"
            onClick={() => onPick(p.user_id)}
            className="flex-1 flex flex-col items-center gap-1.5"
          >
            <span className={`relative w-[52px] h-[52px] rounded-full ${avatar} grid place-items-center text-lg font-semibold overflow-hidden ${
              picked === p.user_id ? `ring-2 ring-offset-2 ${ring}` : ''
            }`}>
              {p.avatar_url
                ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                : (p.username ?? '?').slice(0, 1).toUpperCase()}
              {picked === p.user_id && (
                <span className={`absolute -right-0.5 -bottom-0.5 w-5 h-5 rounded-full ${badge} border-2 border-white text-white grid place-items-center`}>
                  <Check size={11} strokeWidth={3.5} />
                </span>
              )}
            </span>
            <span className={`text-[11px] font-semibold truncate max-w-full ${
              picked === p.user_id ? 'text-gray-800' : 'text-gray-400'
            }`}>
              {p.username ?? 'Someone'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** A comment on one climber, saved on blur. Signed — the crew sees who wrote it. */
function NoteField({ initial, onSave }: { initial: string; onSave: (body: string) => void }) {
  const [text, setText] = useState(initial)
  return (
    <div className="mt-2.5">
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={() => { if (text.trim() !== initial.trim()) onSave(text.trim()) }}
        rows={2}
        placeholder="Say something…"
        className="w-full text-sm border rounded-lg px-3 py-2.5 resize-none"
      />
      <p className="text-[11px] text-gray-400 mt-1">
        Posted with your name — the crew sees who said it.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Create the two drawn icons**

`lucide-react` has no goat and no donkey. Create `src/components/AwardIcons.tsx` with stroke marks on lucide's 24px grid, so they recolour with `currentColor` like every other icon in the app:

```tsx
/**
 * A goat and a donkey on lucide's 24px grid. Drawn rather than 🐐/🫏 so they
 * inherit currentColor and scale like the app's other graphics (see the tape
 * and hold marks in Chip.tsx).
 */
export function GoatIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="goat">
      <path d="M9 6C8 4 6.5 2.8 4.5 2.5" />
      <path d="M15 6c1-2 2.5-3.2 4.5-3.5" />
      <path d="M9 6h6a2 2 0 0 1 2 2v2a5 5 0 0 1-10 0V8a2 2 0 0 1 2-2z" />
      <path d="M7 9.2 4 10.6" />
      <path d="m17 9.2 3 1.4" />
      <path d="M10.6 10h.01" />
      <path d="M13.4 10h.01" />
      <path d="M12 15v2.4c0 1.6-.8 2.7-2.2 3.1" />
    </svg>
  )
}

export function DonkeyIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="donkey">
      <path d="M9 7.5C7.8 5 7.3 3 8.4 2c1-1 2 .6 2.4 2.6" />
      <path d="M15 7.5c1.2-2.5 1.7-4.5.6-5.5-1-1-2 .6-2.4 2.6" />
      <path d="M9.2 7.5h5.6a2 2 0 0 1 2 2 4 4 0 0 1-2.1 3.5l-.3 3.6a2.4 2.4 0 0 1-4.8 0l-.3-3.6A4 4 0 0 1 7.2 9.5a2 2 0 0 1 2-2z" />
      <path d="M10.7 10.4h.01" />
      <path d="M13.3 10.4h.01" />
      <path d="M10.8 16.4h2.4" />
    </svg>
  )
}
```

- [ ] **Step 3: Verify it compiles and lint is clean**

Run: `npm run build && npm run lint 2>&1 | tail -3`
Expected: build succeeds; lint still reports **16 problems**, no more.

- [ ] **Step 4: Commit**

```bash
git add src/components/RateSessionSheet.tsx src/components/AwardIcons.tsx
git commit -m "Add the rate-the-session sheet with GOAT, donkey, props and comments"
```

---

## Task 5: The crew-page entry card

**Files:**
- Create: `src/components/SessionAwardsCard.tsx`
- Modify: `src/pages/CrewGroupPage.tsx`

**Interfaces:**
- Consumes: `useAwardCandidates`, `useOpenAwardRound`, `useAwardRound` from Task 3; `awardsUnlocked` from Task 2; `RateSessionSheet` from Task 4; `GoatIcon`/`DonkeyIcon`.
- Produces: `SessionAwardsCard({ crewId }: { crewId: string })`.

Layout and copy come from artboard **1 · Awards open (crew page)**.

- [ ] **Step 1: Write the card**

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { GoatIcon, DonkeyIcon } from './AwardIcons'
import { RateSessionSheet } from './RateSessionSheet'
import { useAwardCandidates, useOpenAwardRound, useAwardRound } from '../hooks/useSessionAwards'
import { awardsUnlocked } from '../utils/sessionAwards'

/**
 * The awards entry point on the crew page. Shows the most recent session two or
 * more of the crew were at: an open round to vote in, or a link to the verdict
 * once it has unlocked. Renders nothing when there is no such session.
 */
export function SessionAwardsCard({ crewId }: { crewId: string }) {
  const { data: candidates = [] } = useAwardCandidates(crewId)
  const openRound = useOpenAwardRound()
  const [sheetRoundId, setSheetRoundId] = useState<string | null>(null)

  const candidate = candidates[0]
  const { data: round } = useAwardRound(candidate?.round_id ?? null)

  if (!candidate) return null

  const dateLabel = (() => {
    try { return format(new Date(`${candidate.round_date}T00:00:00`), 'EEE d MMM') }
    catch { return candidate.round_date }
  })()

  const unlocked = round
    ? awardsUnlocked({
        participants: round.participants, voted: round.voted,
        closesAt: round.closes_at, now: new Date(),
      })
    : false
  const iVoted = !!round?.mine.votes.some(v => v.kind === 'goat')

  const start = () => {
    if (candidate.round_id) { setSheetRoundId(candidate.round_id); return }
    openRound.mutate(
      { crewId, date: candidate.round_date, gym: candidate.gym },
      {
        onSuccess: id => setSheetRoundId(id),
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not open awards'),
      },
    )
  }

  return (
    <div className="bg-white border border-sage-100 rounded-2xl p-3.5">
      <div className="flex items-center gap-2.5">
        <div className="flex flex-shrink-0">
          <span className="w-8 h-8 rounded-full bg-sage-700 text-white grid place-items-center">
            <GoatIcon size={19} />
          </span>
          <span className="w-8 h-8 -ml-2 rounded-full bg-khaki-600 border-2 border-white text-white grid place-items-center">
            <DonkeyIcon size={19} />
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight">
            {unlocked ? 'The verdict is in' : iVoted ? 'Verdict in. Waiting on the rest.' : 'Awards are open'}
          </p>
          <p className="text-xs text-gray-500 truncate">
            {dateLabel} · {candidate.climbers} of you climbed
          </p>
        </div>
      </div>

      {round && (
        <div className="flex items-center gap-2 mt-3">
          <span className="flex-1 text-xs text-gray-500 tabular-nums">
            {round.voted} of {round.participants} voted
          </span>
          {!unlocked && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-khaki-600">
              <Clock size={13} strokeWidth={2} /> closes {format(new Date(round.closes_at), 'EEE HH:mm')}
            </span>
          )}
        </div>
      )}

      {unlocked && candidate.round_id ? (
        <Link
          to={`/crews/${crewId}/awards/${candidate.round_id}`}
          className="mt-3 min-h-11 flex items-center justify-center bg-sage-700 text-white rounded-xl text-[15px] font-semibold"
        >
          See the verdict
        </Link>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={openRound.isPending}
          className={`mt-3 w-full min-h-11 flex items-center justify-center rounded-xl text-[15px] font-semibold disabled:opacity-50 ${
            iVoted ? 'bg-sage-50 text-sage-700' : 'bg-sage-700 text-white'
          }`}
        >
          {openRound.isPending ? 'Opening…' : iVoted ? 'Change my verdict' : 'Cast your votes'}
        </button>
      )}

      <p className="text-[11px] text-gray-400 text-center mt-2">
        {unlocked
          ? 'GOAT, donkey, and what each climber was tagged for.'
          : 'GOAT, donkey, and one line on each climber.'}
      </p>

      {sheetRoundId && (
        <RateSessionSheet
          open={!!sheetRoundId}
          onClose={() => setSheetRoundId(null)}
          roundId={sheetRoundId}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Mount it on the crew page**

In `src/pages/CrewGroupPage.tsx`, add the import next to the other component imports:

```tsx
import { SessionAwardsCard } from '../components/SessionAwardsCard'
```

Then insert the card between the badges block and the standings block — after the `{/* Badges */}` section's closing `)}` and before `{/* Standings */}`:

```tsx
      {/* Session awards */}
      {amMember && <SessionAwardsCard crewId={crewId} />}
```

- [ ] **Step 3: Verify the sheet is not nested inside a heading**

Run: `grep -n "BottomSheet\|<h1\|<h2" src/components/SessionAwardsCard.tsx src/components/RateSessionSheet.tsx`
Expected: no `BottomSheet` appears inside an `<h1>`/`<h2>`/`<h3>` element. A `BottomSheet` inside a heading inherits its font weight and is invalid markup.

- [ ] **Step 4: Verify build and lint**

Run: `npm run build && npm run lint 2>&1 | tail -3`
Expected: build succeeds; lint still reports **16 problems**.

- [ ] **Step 5: Commit**

```bash
git add src/components/SessionAwardsCard.tsx src/pages/CrewGroupPage.tsx
git commit -m "Show the session awards card on the crew page"
```

---

## Task 6: The verdict page

**Files:**
- Create: `src/pages/SessionAwardsPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useAwardRound`, `useAwardParticipants`, `useAwardMessages`, `usePostAwardMessage`, `useCrewAwardHistory` from Task 3; `awardTally`, `tagTally`, `donkeyStreak`, `awardsUnlocked` from Task 2; `AWARD_TAGS`; `GoatIcon`/`DonkeyIcon`.
- Produces: `SessionAwardsPage()` at route `/crews/:crewId/awards/:roundId`.

Layout and copy come from artboard **4 · The verdict (recap)**.

- [ ] **Step 1: Write the page**

```tsx
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { GoatIcon, DonkeyIcon } from '../components/AwardIcons'
import { AWARD_TAGS, type AwardTag } from '../types'
import {
  useAwardRound, useAwardParticipants, useAwardMessages,
  usePostAwardMessage, useCrewAwardHistory,
} from '../hooks/useSessionAwards'
import { awardTally, tagTally, donkeyStreak, awardsUnlocked } from '../utils/sessionAwards'

const tagMeta = (tag: AwardTag) => AWARD_TAGS.find(t => t.key === tag)

export function SessionAwardsPage() {
  const { crewId = '', roundId = '' } = useParams<{ crewId: string; roundId: string }>()
  const { data: round, isLoading } = useAwardRound(roundId)
  const { data: participants = [] } = useAwardParticipants(roundId)
  const { data: history = [] } = useCrewAwardHistory(crewId)

  if (isLoading) return <div className="p-5 text-sm text-gray-400">Loading the verdict…</div>
  if (!round) return <div className="p-5 text-sm text-gray-400">This round no longer exists.</div>

  const unlocked = awardsUnlocked({
    participants: round.participants, voted: round.voted,
    closesAt: round.closes_at, now: new Date(),
  })

  const nameOf = (id: string) =>
    participants.find(p => p.user_id === id)?.username ?? 'Someone'

  if (!unlocked) {
    return (
      <div className="p-4 pb-32 lg:max-w-2xl lg:mx-auto">
        <h1 className="text-lg font-bold tracking-tight">Session awards</h1>
        <p className="text-sm text-gray-500 mt-1 tabular-nums">
          {round.voted} of {round.participants} have voted. The verdict unlocks when
          everyone is in, or 24h after the session.
        </p>
      </div>
    )
  }

  const goat = awardTally(round.votes ?? [], 'goat')
  const donkey = awardTally(round.votes ?? [], 'donkey')
  const tags = tagTally((round.tags ?? []).map(t => ({ subject_id: t.subject_id, tag: t.tag })))
  const notes = round.notes ?? []

  return (
    <div className="p-4 pb-32 lg:max-w-2xl lg:mx-auto space-y-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight leading-tight">Session awards</h1>
        <span className="inline-flex items-center gap-1 rounded-full bg-sage-50 text-sage-700 text-[11px] font-semibold px-2.5 py-1 mt-2">
          <Check size={12} strokeWidth={2.25} /> Votes in · {round.voted} of {round.participants}
        </span>
      </div>

      <AwardWinner
        kind="goat"
        label="GOAT of the session"
        winners={goat.winners.map(nameOf)}
        count={goat.topCount}
        total={round.participants}
        note={notes.find(n => goat.winners.includes(n.subject_id))}
        nameOf={nameOf}
      />

      <AwardWinner
        kind="donkey"
        label="Donkey of the session"
        winners={donkey.winners.map(nameOf)}
        count={donkey.topCount}
        total={round.participants}
        note={notes.find(n => donkey.winners.includes(n.subject_id))}
        nameOf={nameOf}
        streak={donkey.winners.length === 1 ? donkeyStreak(history, donkey.winners[0], new Date()) : 0}
      />

      <div>
        <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">The verdicts</h2>
        <div className="space-y-2">
          {participants.map(p => (
            <div key={p.user_id} className="bg-gray-50 rounded-2xl p-3">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-full bg-sage-100 grid place-items-center text-[13px] font-semibold text-sage-700 overflow-hidden flex-shrink-0">
                  {p.avatar_url
                    ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                    : (p.username ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="flex-1 text-sm font-semibold text-gray-800 truncate">
                  {p.username ?? 'Someone'}
                </span>
                {goat.winners.includes(p.user_id) && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-sage-600 bg-sage-50 rounded-full px-2 py-0.5">GOAT</span>
                )}
                {donkey.winners.includes(p.user_id) && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-khaki-700 bg-khaki-100 rounded-full px-2 py-0.5">Donkey</span>
                )}
              </div>

              {(tags[p.user_id] ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {(tags[p.user_id] ?? []).map(t => (
                    <span key={t.tag} className="inline-flex items-center gap-1 rounded-full bg-sage-50 text-sage-700 text-[11px] font-semibold px-2.5 py-1">
                      {tagMeta(t.tag)?.emoji} {tagMeta(t.tag)?.label}
                      <span className="text-gray-400 tabular-nums">{t.count}</span>
                    </span>
                  ))}
                </div>
              )}

              {notes.filter(n => n.subject_id === p.user_id).map(n => (
                <p key={`${n.voter_id}:${n.subject_id}`} className="text-xs text-gray-600 mt-2.5 break-words">
                  {n.body} <span className="text-gray-400">— {nameOf(n.voter_id)}</span>
                </p>
              ))}
            </div>
          ))}
        </div>
      </div>

      <SessionThread roundId={roundId} />
    </div>
  )
}

function AwardWinner({
  kind, label, winners, count, total, note, nameOf, streak = 0,
}: {
  kind: 'goat' | 'donkey'
  label: string
  winners: string[]
  count: number
  total: number
  note?: { voter_id: string; body: string }
  nameOf: (id: string) => string
  streak?: number
}) {
  if (winners.length === 0) return null
  const goat = kind === 'goat'
  return (
    <div className={goat
      ? 'bg-sage-50 border border-sage-100 rounded-2xl p-3.5'
      : 'bg-khaki-100 border border-khaki-200 rounded-2xl p-3.5'}>
      <div className="flex items-center gap-3">
        <span className={`w-11 h-11 rounded-full grid place-items-center text-white flex-shrink-0 ${goat ? 'bg-sage-700' : 'bg-khaki-600'}`}>
          {goat ? <GoatIcon size={26} /> : <DonkeyIcon size={26} />}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-[10px] font-bold uppercase tracking-wider ${goat ? 'text-sage-600' : 'text-khaki-700'}`}>
            {label}
          </p>
          <p className="text-[17px] font-extrabold tracking-tight leading-snug truncate">
            {winners.join(' & ')}
          </p>
          {winners.length > 1 && <p className="text-[11px] text-gray-500">Split verdict</p>}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`text-[15px] font-extrabold tabular-nums ${goat ? 'text-sage-700' : 'text-khaki-700'}`}>
            {count}<span className="text-[11px] font-semibold text-gray-400">/{total}</span>
          </span>
          {streak > 1 && <span className="text-[10px] font-semibold text-khaki-600">{streak} weeks running 🏅</span>}
        </div>
      </div>
      {note && (
        <div className={`mt-3 border-l-2 pl-2.5 ${goat ? 'border-sage-200' : 'border-khaki-300'}`}>
          <p className="text-[13px] leading-snug text-gray-700">{note.body}</p>
          <p className="text-[11px] text-gray-400 mt-1">— {nameOf(note.voter_id)}</p>
        </div>
      )}
    </div>
  )
}

function SessionThread({ roundId }: { roundId: string }) {
  const { data: messages = [] } = useAwardMessages(roundId)
  const post = usePostAwardMessage()
  const [text, setText] = useState('')

  const send = () => {
    const body = text.trim()
    if (!body) return
    post.mutate({ roundId, body }, {
      onSuccess: () => setText(''),
      onError: () => toast.error('Failed to send'),
    })
  }

  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">On the session</h2>
      <div className="bg-gray-50 rounded-2xl p-3 space-y-2.5">
        {messages.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-2">Nobody has said anything yet. 🔥</p>
        ) : messages.map(m => (
          <div key={m.id} className="flex items-start gap-2">
            <span className="w-6 h-6 rounded-full bg-sage-100 grid place-items-center text-[10px] font-semibold text-sage-700 overflow-hidden flex-shrink-0 mt-0.5">
              {m.avatar_url
                ? <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                : (m.username ?? '?').slice(0, 1).toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">{m.username ?? 'Someone'}</p>
              <p className="text-sm text-gray-700 break-words">{m.body}</p>
            </div>
          </div>
        ))}
        <div className="flex gap-1.5 pt-1">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Say something…"
            className="flex-1 text-sm border rounded-lg px-2.5 py-1.5"
          />
          <button
            onClick={send}
            disabled={!text.trim() || post.isPending}
            className="text-sm px-3 py-1.5 bg-sage-700 text-white rounded-lg font-medium disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add the route**

In `src/App.tsx`, add the import alongside the other page imports:

```tsx
import { SessionAwardsPage } from './pages/SessionAwardsPage'
```

Then add the route directly after the existing `/crews/:crewId` line (currently line 41), inside the `OnboardingGate` block:

```tsx
                <Route path="/crews/:crewId/awards/:roundId" element={<SessionAwardsPage />} />
```

- [ ] **Step 3: Confirm the page is reachable on a phone**

Run: `grep -n "awards" src/App.tsx src/components/SessionAwardsCard.tsx`
Expected: the route exists in `App.tsx`, and `SessionAwardsCard` links to it. The card is mounted on `/crews/:crewId`, which has a `BottomNav` entry — so the page is reachable with a thumb, not only on desktop.

- [ ] **Step 4: Verify build, lint and tests**

Run: `npm run build && npx vitest run && npm run lint 2>&1 | tail -3`
Expected: build succeeds; 198 tests pass; lint reports **16 problems**.

- [ ] **Step 5: Commit**

```bash
git add src/pages/SessionAwardsPage.tsx src/App.tsx
git commit -m "Add the session awards verdict page"
```

---

## Task 7: Verification pass

**Files:** none changed unless a defect is found.

- [ ] **Step 1: Confirm the migration is applied**

In the Supabase dashboard:

```sql
select count(*) from crew_award_rounds;
```
Expected: succeeds (0 rows is fine). If it errors, migration 079 was never applied and nothing below will work.

- [ ] **Step 2: Full automated check**

Run: `npm run build && npx vitest run && npm run lint 2>&1 | tail -3`
Expected: build clean, 198 tests pass, lint **16 problems** — the same number measured before this branch started. Any increase is yours to fix.

- [ ] **Step 3: Manual pass on a phone-width viewport (375px)**

Run: `npm run dev`, then walk this list. Hooks, components and pages have no automated coverage in this project, so this pass *is* the test:

- [ ] Two crew members log a session on the same date at the same gym. Open `/crews/:crewId` — the awards card appears under the badges with `Awards are open`.
- [ ] Tap `Cast your votes` — the sheet opens; the round is created on first tap and reused after.
- [ ] The GOAT row does **not** include yourself. The donkey row does.
- [ ] Pick a GOAT, then pick a different one — the ring moves and no duplicate vote appears.
- [ ] Toggle a prop chip on and off — it survives a sheet close and reopen.
- [ ] Type a comment on a climber and blur — reopen the sheet and the text is still there.
- [ ] With only some participants voted, `/crews/:crewId/awards/:roundId` shows the progress state, **not** the winners.
- [ ] Vote as every participant — the card flips to `See the verdict` and the page shows GOAT, donkey, tag tallies and attributed comments.
- [ ] Post in the session thread — it appears immediately and survives a reload.
- [ ] Nothing on any of these screens shows a grade or an attempt count.

- [ ] **Step 4: Confirm no points were minted**

Run: `grep -rn "beta_points" src/hooks/useSessionAwards.ts src/components/SessionAwardsCard.tsx src/components/RateSessionSheet.tsx src/pages/SessionAwardsPage.tsx supabase/migrations/079_session_awards.sql`
Expected: no matches. This feature pays nothing, by design.

- [ ] **Step 5: Commit any fixes and finish the branch**

```bash
git add -A
git commit -m "Fix defects found in the session awards manual pass"
```

Then use the `superpowers:finishing-a-development-branch` skill. **Do not push before migration 079 is applied in Supabase** — a push to `main` is a release.

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Derived round keyed `(crew_id, round_date, gym)` | 1 (`open_award_round`, unique key) |
| Participants snapshotted, re-snapshot until first vote | 1 (`open_award_round`) |
| Minimum two participants | 1 (raise in `open_award_round`) |
| One vote each way, no self-GOAT, self-donkey allowed | 1 (PK + check constraint) |
| One tag of each kind, one note per climber | 1 (PKs) |
| Tag vocabulary constrained | 1 (`check (tag in ...)`) + 2 (`AWARD_TAGS`) |
| Votes/tags/notes unreadable by clients | 1 (RLS on, no SELECT policy) + Step 3 grep |
| Unlock gate: all voted or 24h | 1 (`get_award_round`) + 2 (`awardsUnlocked`) |
| GOAT vote counts as voted; donkey optional | 1 (`kind = 'goat'` in the count) + 2 (tests) |
| Thread open to whole crew, not just participants | 1 (`is_award_round_member` policies) |
| Screen 1 — awards-open card on the crew page | 5 |
| Screen 2 + 3 — vote sheet with props and comments | 4 |
| Screen 4 — verdict recap at `/crews/:crewId/awards/:roundId` | 6 |
| Signed, not anonymous | 4 (`NoteField` microcopy) + 6 (attribution) |
| Repeat-donkey streak in weeks of rounds | 1 (`crew_award_history`) + 2 (`donkeyStreak`) |
| Ties award everyone tied | 2 (`awardTally`) + 6 ("Split verdict") |
| No `beta_points` | 7 Step 4 grep |
| Release gate on migration 079 | 1 Step 5, 7 Step 1, 7 Step 5 |
| No grades or attempt counts on these screens | 7 Step 3 |

No gaps.

**Placeholder scan:** every code step carries complete code; no TBD, no "similar to Task N", no "add error handling" — each mutation names its own `onError` toast.

**Type consistency:** `AwardTag` is declared once in `src/types/index.ts` and imported by `sessionAwards.ts`, `useSessionAwards.ts`, `RateSessionSheet.tsx` and `SessionAwardsPage.tsx`. `AwardVoteRow`/`AwardTagRow`/`AwardHistoryRow` are declared once in `src/utils/sessionAwards.ts` and re-used by the hooks. The RPC names in Task 3 (`crew_award_candidates`, `open_award_round`, `cast_award_vote`, `toggle_award_tag`, `set_award_note`, `get_award_round`, `crew_award_history`) match Task 1's definitions exactly, as do their parameter names (`p_crew`, `p_date`, `p_gym`, `p_round`, `p_kind`, `p_subject`, `p_tag`, `p_body`, `p_limit`). `AwardRoundState.mine` matches the `jsonb_build_object` shape in `get_award_round`.
