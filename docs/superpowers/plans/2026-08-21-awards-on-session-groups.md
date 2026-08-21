# Awards on Session Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the session awards off the crew page and onto the session itself, so anyone added to a session can vote on the people in it — crew membership irrelevant.

**Architecture:** `crew_award_rounds` gains `group_id` and stops keying on `(crew_id, round_date, gym)`. Participation becomes live group membership — anyone with a `sessions` row carrying that `group_id` — which means every read gate and every write guard stops asking `is_crew_member` and starts asking `is_session_group_member`. A new `unlocked_at` latch makes unlocking one-way, so a climber who joins after the last vote can still vote but cannot un-reveal a verdict people have read. The crew survives only as the scope for the repeat-donkey streak.

**Tech Stack:** React 19 + TypeScript, Vite, React Query (array query keys), Supabase (Postgres + RLS + `SECURITY DEFINER` RPCs), Tailwind (`sage`/`khaki`), `lucide-react`, `react-hot-toast`, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-shared-sessions-design.md`, section "Re-anchoring the awards" — this is its step 2.

## Global Constraints

- **Branch:** work on a feature branch, never `main`. A push to `main` is a release.
- **Release gate:** migration `083_awards_on_groups.sql` is applied **by hand in the Supabase dashboard** and must be applied **before** the client that reads it is deployed. Migrations **079 and 080 are applied**; **081 and 082 may still be unapplied** — check with the owner before assuming, and never edit an applied migration.
- **Voting is open to anyone in the session, crew or no crew.** Crew membership must not gate reading a round, voting, tagging, commenting or reacting. The only thing crew still scopes is the repeat-donkey streak.
- **Unlocking is one-way.** Once a verdict is out it stays out; a late joiner may vote but must not re-lock it.
- **The results embargo is unchanged:** `crew_award_votes`, `crew_award_tags` and `crew_award_notes` keep RLS with **no SELECT policy**, and `get_award_round` stays the only read path. Adding a policy to any of those three is a defect.
- **Never write another user's `sessions` or `problems` rows.** Nothing in this plan needs to.
- **Existing rounds are not destroyed.** Rows predating this migration keep `group_id = null` and simply become unreachable from the new surfaces. Do not delete them, and do not try to match them to groups by date and gym — that is the guessing this whole refactor removes.
- **A database constraint beats a check-then-write.**
- **No `beta_points`.** This feature awards none.
- **`auth.uid()` comparisons must be null-safe.** A NULL `IF` condition is false in plpgsql and `CREATE FUNCTION` grants EXECUTE to `PUBLIC`, so every writing function captures `auth.uid()` into a local, raises `'Not authenticated'` explicitly, and compares with `is distinct from`. Migrations 080 and 082 both had to learn this.
- **`is_session_group_member` (080) must never be revoked** — it is referenced inside RLS policy bodies, which evaluate as the querying role.
- **Build:** `npm run build` = `tsc -b && vite build`, `noUnusedLocals`/`noUnusedParameters` ON — an unused local is a build-failing error.
- **Lint baseline is 16 problems (15 errors, 1 warning).** New work must add zero. Re-measure before starting.
- **Tests:** only pure functions in `src/utils/` are unit-tested. There is no `@testing-library/react`. The suite is **252 passing across 25 files** at the time of writing — re-measure.
- **Patterns:** array query keys; hooks named `useX`; **no FK embed to `profiles`** — use `profilesByIds` from `src/lib/profiles.ts`; `react-hot-toast` for feedback; a `BottomSheet` is never nested inside a heading.
- **Hit targets** in new mobile UI: at least 44px.

---

## File Structure

| File | Responsibility |
|---|---|
| Create `supabase/migrations/083_awards_on_groups.sql` | Re-anchor the round, rewrite every crew gate as a group gate, add the `unlocked_at` latch, derive the streak's crew. |
| Modify `src/hooks/useSessionAwards.ts` | A group-based round hook; retire the candidate hooks. |
| Create `src/components/SessionAwardsSection.tsx` | The awards, rendered inline on the session page — verdict when unlocked, pickers when open. |
| Modify `src/pages/SessionDetailPage.tsx` | Mount the section. |
| Delete `src/components/SessionAwardsCard.tsx` and its mount in `src/pages/CrewGroupPage.tsx` | The crew-page entry point goes away. |
| Delete `src/pages/SessionAwardsPage.tsx`, `src/components/RateSessionSheet.tsx`, and the route in `src/App.tsx` | The standalone verdict page and the voting sheet are replaced by the inline section. |

---

## Task 1: Migration 083 — re-anchor the round on the group

**Files:**
- Create: `supabase/migrations/083_awards_on_groups.sql`

**Interfaces:**
- Consumes: `crew_award_rounds`, `crew_award_votes`, `crew_award_tags`, `crew_award_notes`, `crew_award_messages`, `crew_award_reactions`, `crew_award_participants`, and the RPCs from 079 (applied); `session_groups`, `sessions.group_id`, `is_session_group_member` from 080 (applied); `crew_members`, `is_crew_member` from 062.
- Produces: `crew_award_rounds.group_id`, `crew_award_rounds.unlocked_at`, nullable `crew_award_rounds.crew_id`; helper `award_round_group(uuid)`; RPCs `open_award_round(uuid)`, `award_round_status(uuid)`, `get_award_round(uuid)`, `crew_award_history(uuid, int)`, and redefined `is_award_round_member`, `assert_award_voter`, `cast_award_vote`, `toggle_award_tag`, `set_award_note`.

- [ ] **Step 1: Write the schema changes**

```sql
-- The awards belong to a session, not a crew.
--
-- 079 keyed a round on (crew_id, round_date, gym) and snapshotted participants by
-- matching sessions on a trimmed gym string. That inference is why the feature
-- showed nothing on its first day in production. A round now points at a
-- session_groups row, and participation is live group membership: anyone with a
-- sessions row carrying that group_id, crew member or not.
--
-- 079 and 080 are already applied, so every function and policy this replaces is
-- re-created here with `create or replace` / `drop policy` + `create policy`.
--
-- Rows predating this migration keep group_id = null. They are not deleted and not
-- matched to groups by date and gym -- that is the guessing being removed. They
-- simply stop being reachable, because the surfaces that linked to them are gone.
--
-- Nothing here awards beta_points.

alter table crew_award_rounds add column if not exists group_id uuid references session_groups(id) on delete cascade;
alter table crew_award_rounds add column if not exists unlocked_at timestamptz;

-- One round per group. Partial, so the pre-existing rows (group_id null) stay out
-- of the index and it cannot fail on legacy data.
create unique index if not exists crew_award_rounds_group_idx
  on crew_award_rounds (group_id) where group_id is not null;

-- A group of friends need not be a crew, so a round may have no crew at all. The
-- old composite key is meaningless now that the group identifies the round.
alter table crew_award_rounds alter column crew_id drop not null;
alter table crew_award_rounds drop constraint if exists crew_award_rounds_crew_id_round_date_gym_key;
```

- [ ] **Step 2: Rewrite the read gate — this is the part that would otherwise ship invisible**

```sql
-- The round's group, or null for a legacy row.
create or replace function public.award_round_group(p_round uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select group_id from crew_award_rounds where id = p_round;
$$;

-- 079 gated every read on is_crew_member(r.crew_id). With crew_id now nullable,
-- that returns false for a crewless group -- nobody could read the round, the
-- roster, the thread or the reactions. Group membership is the gate now; a legacy
-- row (group_id null) falls back to its crew so old data stays readable to the
-- crew it belonged to.
create or replace function public.is_award_round_member(p_round uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from crew_award_rounds r
     where r.id = p_round
       and (
         (r.group_id is not null and is_session_group_member(r.group_id))
         or (r.group_id is null and r.crew_id is not null and is_crew_member(r.crew_id))
       )
  );
$$;

drop policy if exists "award rounds readable by crew" on crew_award_rounds;
create policy "award rounds readable by the session or crew" on crew_award_rounds for select using (
  (group_id is not null and is_session_group_member(group_id))
  or (group_id is null and crew_id is not null and is_crew_member(crew_id))
);
```

- [ ] **Step 3: Write the participation helper and the status function**

```sql
-- Live participation: everyone with a session in the round's group. Replaces the
-- crew_award_participants snapshot, which is retained but no longer read (this
-- project keeps data when removing a code path).
create or replace function public.award_round_participants(p_round uuid)
returns setof uuid language sql security definer stable set search_path = public as $$
  select s.user_id
    from sessions s
    join crew_award_rounds r on r.id = p_round
   where r.group_id is not null and s.group_id = r.group_id;
$$;

-- One definition of progress and of "unlocked". A participant counts as having
-- voted on their GOAT vote; the donkey vote is optional, so an abstainer cannot
-- hold a round hostage. unlocked_at makes unlocking ONE-WAY: with live membership
-- a climber joining after the last vote would otherwise push participants above
-- voted and re-lock a verdict people have already read.
create or replace function public.award_round_status(p_round uuid)
returns table (participants integer, voted integer, unlocked boolean)
language sql security definer stable set search_path = public as $$
  select p.cnt, v.cnt,
         coalesce(
           r.unlocked_at is not null
           or (p.cnt > 0 and v.cnt >= p.cnt)
           or now() > r.closes_at,
           false)
    from crew_award_rounds r
    cross join lateral (select count(*)::integer as cnt from award_round_participants(p_round)) p
    cross join lateral (select count(distinct voter_id)::integer as cnt
                          from crew_award_votes where round_id = p_round and kind = 'goat') v
   where r.id = p_round;
$$;
```

- [ ] **Step 4: Rewrite the write guards onto group membership**

```sql
-- 079 asked crew_award_participants; participation is live group membership now.
create or replace function public.assert_award_voter(p_round uuid, p_subject uuid, p_what text)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_closes timestamptz;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from award_round_participants(p_round) u where u = v_user) then
    raise exception 'Only climbers from that session can %', p_what;
  end if;
  if not exists (select 1 from award_round_participants(p_round) u where u = p_subject) then
    raise exception 'That climber was not in the session';
  end if;
  select closes_at into v_closes from crew_award_rounds where id = p_round;
  if v_closes is null then raise exception 'No such round'; end if;
  if now() > v_closes then raise exception 'Voting has closed'; end if;
end; $$;

-- Same body as 079's apart from the guard call and the unlocked_at latch.
create or replace function public.cast_award_vote(p_round uuid, p_kind text, p_subject uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_p integer; v_v integer;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if p_kind not in ('goat', 'donkey') then raise exception 'Unknown award'; end if;
  perform assert_award_voter(p_round, p_subject, 'vote');

  insert into crew_award_votes (round_id, voter_id, kind, subject_id)
    values (p_round, v_user, p_kind, p_subject)
    on conflict (round_id, voter_id, kind)
      do update set subject_id = excluded.subject_id, created_at = now();

  -- Latch the reveal the moment the last participant's GOAT vote lands, so a
  -- later joiner cannot un-reveal it. get_award_round is stable and cannot write,
  -- which is why the latch is stamped here.
  select participants, voted into v_p, v_v from award_round_status(p_round);
  if v_p > 0 and v_v >= v_p then
    update crew_award_rounds set unlocked_at = coalesce(unlocked_at, now())
     where id = p_round and unlocked_at is null;
  end if;
end; $$;
```

- [ ] **Step 5: Redefine the two remaining write RPCs to use the new guard**

`toggle_award_tag` and `set_award_note` in 079 each open with their own participation checks against `crew_award_participants`. Re-create both here, **reproducing 079's bodies faithfully** and changing only the guard: replace those inline checks with `perform assert_award_voter(p_round, p_subject, 'give props')` and `perform assert_award_voter(p_round, p_subject, 'comment')` respectively, and add the `v_user uuid := auth.uid()` capture plus the explicit `'Not authenticated'` raise. Read 079 and copy the rest — the tag vocabulary check, the toggle's delete-then-insert with its `get diagnostics`, and the note's blank-body delete must all survive unchanged.

- [ ] **Step 6: Replace round creation, and derive the streak's crew**

```sql
-- Rounds are opened for a GROUP now, lazily, by anyone in the session. The old
-- three-argument version discovered a round from (crew, date, gym); that whole
-- discovery path is gone.
drop function if exists public.open_award_round(uuid, date, text);
drop function if exists public.crew_award_candidates(uuid);

create or replace function public.open_award_round(p_group uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_id uuid; v_date date; v_gym text; v_crew uuid; v_members integer;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not is_session_group_member(p_group) then
    raise exception 'Only climbers from that session can open its awards';
  end if;

  select id into v_id from crew_award_rounds where group_id = p_group;
  if v_id is not null then return v_id; end if;

  select date, gym into v_date, v_gym from session_groups where id = p_group;
  select count(*) into v_members from sessions where group_id = p_group;
  if v_members < 2 then
    raise exception 'Awards need at least two climbers in the session';
  end if;

  -- The streak's scope. session_groups.crew_id is never written by 080, so the
  -- crew is derived here: exactly one crew that EVERY current member belongs to,
  -- otherwise none. A crew climbing together gets a streak; a mixed group does
  -- not, which is what "crew-scoped where a crew exists" means.
  select case when count(*) = 1 then min(c.crew_id) end into v_crew
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
```

- [ ] **Step 7: Redefine the payload and the history**

`get_award_round(p_round)` in 079 gates on `is_crew_member(v_crew)` and counts participants from `crew_award_participants`. Re-create it here, reproducing 079's `jsonb_build_object` payload faithfully — including `mine`, the `voters` list, and the withheld `votes`/`tags`/`notes` behind the unlock check — and change exactly three things:

1. the gate becomes `if not is_award_round_member(p_round) then raise exception 'Not your session'; end if;`
2. `participants`, `voted` and `unlocked` come from `award_round_status(p_round)` rather than being recomputed;
3. add `'am_participant', exists (select 1 from award_round_participants(p_round) u where u = auth.uid())` alongside `mine`, and add `'roster', (select coalesce(jsonb_agg(u), '[]'::jsonb) from award_round_participants(p_round) u)` so the client no longer needs a separate participants query.

`crew_award_history(p_crew, p_limit)` stays crew-scoped and keeps its shape; re-create it with two changes: it must only consider rounds whose `crew_id` is `p_crew` **and** whose `group_id is not null`, and its unlock filter must use `award_round_status`'s `unlocked` rather than recomputing the predicate.

- [ ] **Step 8: Close the internal helpers**

```sql
-- Internal only, and each trusts its argument without an ownership check.
-- Revoking from the roles alone leaves the PUBLIC grant standing, because
-- CREATE FUNCTION grants EXECUTE to PUBLIC by default (established in 079).
--
-- award_round_group and is_award_round_member are NOT revoked:
-- is_award_round_member is referenced inside the RLS policy bodies of
-- crew_award_participants, crew_award_messages and crew_award_reactions, which
-- evaluate as the querying role, so revoking it would deny every read of those
-- tables.
revoke execute on function public.award_round_participants(uuid) from anon, authenticated;
revoke execute on function public.award_round_participants(uuid) from public;
revoke execute on function public.award_round_status(uuid) from anon, authenticated;
revoke execute on function public.award_round_status(uuid) from public;
revoke execute on function public.assert_award_voter(uuid, uuid, text) from anon, authenticated;
revoke execute on function public.assert_award_voter(uuid, uuid, text) from public;
```

- [ ] **Step 9: Verify by reading, then commit**

Run each and paste the output:

- `grep -c "create policy" supabase/migrations/083_awards_on_groups.sql` — exactly 1, the replaced rounds policy.
- `grep -n "crew_award_votes\|crew_award_tags\|crew_award_notes" supabase/migrations/083_awards_on_groups.sql | grep -i policy` — must be empty. Those three keep RLS with **no** SELECT policy; adding one breaks the embargo.
- `grep -n "is_crew_member" supabase/migrations/083_awards_on_groups.sql` — every remaining use must be a legacy `group_id is null` fallback or the streak. Walk each in your report.
- `grep -n "beta_points" supabase/migrations/083_awards_on_groups.sql` — doc comments only.
- `grep -n "auth.uid()" supabase/migrations/083_awards_on_groups.sql` — walk each and say why it is safe.

There is no local Postgres and no migration runner, so reading is the only check — do not try to execute the SQL, and do not run `npm run build`/`vitest`/`lint` for this task.

```bash
git add supabase/migrations/083_awards_on_groups.sql
git commit -m "Re-anchor the session awards on the session group (migration 083)"
```

- [ ] **Step 10: Apply it by hand**

Paste into the Supabase dashboard. **This is the release gate.** Then confirm:

```sql
select count(*) from crew_award_rounds where group_id is null;   -- legacy rows, untouched
select proname from pg_proc where proname = 'crew_award_candidates';  -- expect zero rows
```

---

## Task 2: Hooks

**Files:**
- Modify: `src/hooks/useSessionAwards.ts`

**Interfaces:**
- Consumes: the RPCs from Task 1.
- Produces: `useAwardRoundForGroup(groupId: string | null)`, `useOpenAwardRound()` taking `{ groupId }`; `AwardRoundState` gains `am_participant: boolean` and `roster: string[]`. `useAwardCandidates` and `useAwardParticipants` are removed.

- [ ] **Step 1: Replace the candidate hooks**

Delete `useAwardCandidates` and the `AwardCandidate` interface — the discovery path is gone. Delete `useAwardParticipants`; the roster now arrives inside `get_award_round`'s payload as `roster: string[]`, so add that plus `am_participant: boolean` to `AwardRoundState`.

Change `useOpenAwardRound`'s variables from `{ crewId, date, gym }` to `{ groupId }`, calling `open_award_round` with `{ p_group: v.groupId }`, and invalidate `['award_round_for_group', v.groupId]`.

Add:

```ts
/** The award round for a session's group, or null if nobody has opened one. */
export function useAwardRoundForGroup(groupId: string | null) {
  return useQuery({
    queryKey: ['award_round_for_group', groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<AwardRoundState | null> => {
      const { data: round, error } = await supabase
        .from('crew_award_rounds')
        .select('id')
        .eq('group_id', groupId)
        .maybeSingle()
      if (error) throw error
      if (!round) return null
      const { data, error: rErr } = await supabase.rpc('get_award_round', { p_round: round.id })
      if (rErr) throw rErr
      return data as AwardRoundState
    },
  })
}
```

Leave `useAwardReactions`, `useToggleAwardReaction`, `useCastAwardVote`, `useToggleAwardTag`, `useSetAwardNote`, `useAwardMessages`, `usePostAwardMessage` and `useCrewAwardHistory` alone apart from any invalidation key that named a removed query.

- [ ] **Step 2: Verify**

- `npm run build` — must succeed. Removing exports will break their importers; that is expected and Tasks 3–4 fix them. If the only errors are in `SessionAwardsCard.tsx`, `SessionAwardsPage.tsx` or `RateSessionSheet.tsx` — all three of which later tasks delete — record them in your report and proceed.
- `grep -n "profiles(" src/hooks/useSessionAwards.ts` — must be empty.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSessionAwards.ts
git commit -m "Point the award hooks at a session group"
```

---

## Task 3: The awards section, inline on the session

**Files:**
- Create: `src/components/SessionAwardsSection.tsx`

**Interfaces:**
- Consumes: `useAwardRoundForGroup`, `useOpenAwardRound`, `useCastAwardVote`, `useToggleAwardTag`, `useSetAwardNote`, `useAwardMessages`, `usePostAwardMessage`, `useAwardReactions`, `useToggleAwardReaction`, `useCrewAwardHistory` from Task 2; `awardTally`, `tagTally`, `donkeyStreak` from `src/utils/sessionAwards.ts`; `AWARD_TAGS` from `src/types`; `GoatIcon`/`DonkeyIcon`.
- Produces: `SessionAwardsSection({ groupId, crewId }: { groupId: string; crewId: string | null })`.

This task **moves existing, working rendering** rather than writing it fresh. `src/pages/SessionAwardsPage.tsx` already renders the unlocked verdict — the GOAT and donkey cards, the per-climber verdict rows, the dig chips and the session thread — and `src/components/RateSessionSheet.tsx` already renders the pickers and prop chips. Moving them verbatim is more reliable than re-transcribing.

- [ ] **Step 1: Move the verdict rendering**

Create `SessionAwardsSection.tsx` and move `AwardWinner`, `AwardDigChips` and `SessionThread` from `SessionAwardsPage.tsx` **verbatim**, along with the `tagMeta` helper. Then move the body of `SessionAwardsPage` in as the unlocked branch, with these changes and no others:

- it takes `groupId` and `crewId` props instead of reading `useParams`;
- the round comes from `useAwardRoundForGroup(groupId)` instead of `useAwardRound(roundId)`, and every `roundId` the moved code passes down becomes `round.round_id`;
- `nameOf` resolves against the round's `roster` (Task 2 added it) rather than `useAwardParticipants`, using `useProfile` per id or `profilesByIds` — follow whichever the file already uses for a list of ids;
- the page's `<h1>` becomes an `<h2>` matching the session page's other section headings (`text-xs font-bold uppercase tracking-wide text-gray-400`), because this is now a section inside a page, not a page;
- drop the back link — there is no separate page to come back from;
- the donkey streak keeps its current call, guarded on `crewId` being non-null. When `crewId` is null the streak is absent, which is intended: a mixed group has no crew to count within.

- [ ] **Step 2: Move the voting rendering inline**

Move `AwardPicker` and `NoteField` from `RateSessionSheet.tsx` **verbatim** into this file, and render them as the section's open-round branch — **not** inside a `BottomSheet`. Drop the sheet's chrome (its `BottomSheet` wrapper, its title, its close button and its "Post my verdict" footer button, which was a no-op: every tap already writes). Keep the pickers, the prop chips, the note fields and all their copy exactly as they are.

- [ ] **Step 3: Handle the three states the section can be in**

- **No round yet** (`useAwardRoundForGroup` returns null): show the section heading and a single control that opens one — `useOpenAwardRound().mutate({ groupId })`. Write its label in the app's voice; it is the entry point that replaced the crew-page card. Show it only when there are at least two climbers in the session, since `open_award_round` raises below that; read the count from the roster the session already has.
- **Open** (`round` exists, `unlocked` false): the pickers and props from Step 2, plus the progress line and the closes-at time the old card showed.
- **Unlocked**: the verdict from Step 1.

A non-participant (`am_participant` false) may read but not act: render the verdict or the progress, and no pickers, no prop chips and no note fields.

- [ ] **Step 4: Verify**

- `npm run build` — must succeed except for errors in the three files Task 4 deletes.
- `grep -n "BottomSheet" src/components/SessionAwardsSection.tsx` — must be empty; the voting is inline now.
- `grep -n "useParams\|<h1" src/components/SessionAwardsSection.tsx` — must be empty; this is a section, not a page.

- [ ] **Step 5: Commit**

```bash
git add src/components/SessionAwardsSection.tsx
git commit -m "Render the session awards inline on the session"
```

---

## Task 4: Mount it, and delete what it replaces

**Files:**
- Modify: `src/pages/SessionDetailPage.tsx`, `src/pages/CrewGroupPage.tsx`, `src/App.tsx`
- Delete: `src/components/SessionAwardsCard.tsx`, `src/pages/SessionAwardsPage.tsx`, `src/components/RateSessionSheet.tsx`

**Interfaces:**
- Consumes: `SessionAwardsSection` from Task 3.
- Produces: nothing new.

- [ ] **Step 1: Mount the section**

In `src/pages/SessionDetailPage.tsx`, mount it below the boulder list, guarded the same way the other shared-session sections are — on `session.group_id`, and on the viewer owning the session row (every group member views their own session, so that is per-climber, not creator-only). Pass the group's `crew_id`, which `useSessionGroupRow` already returns.

- [ ] **Step 2: Delete the crew-page entry point**

Remove the `SessionAwardsCard` import and its mount from `src/pages/CrewGroupPage.tsx`, then delete `src/components/SessionAwardsCard.tsx`.

- [ ] **Step 3: Delete the standalone page and the sheet**

Remove the `/crews/:crewId/awards/:roundId` route and the `SessionAwardsPage` import from `src/App.tsx`, then delete `src/pages/SessionAwardsPage.tsx` and `src/components/RateSessionSheet.tsx`.

- [ ] **Step 4: Verify nothing dangles**

- `grep -rn "SessionAwardsCard\|SessionAwardsPage\|RateSessionSheet\|useAwardCandidates\|useAwardParticipants" src/` — must be empty.
- `grep -rn "awards" src/App.tsx` — must be empty; the route is gone.
- `npm run build` — must now succeed with **no** errors.
- `npx vitest run` — must still be **252 passing**; you changed no pure utils.
- `npm run lint 2>&1 | tail -3` — baseline **16 problems**; must still be 16.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Move the awards onto the session and delete the crew-page entry"
```

---

## Task 5: Verification pass

**Files:** none unless a defect is found.

- [ ] **Step 1: Confirm 083 is applied**

`select count(*) from crew_award_rounds where group_id is not null;` — succeeds. If it errors, 083 was never applied and nothing below works.

- [ ] **Step 2: Automated check**

`npm run build && npx vitest run && npm run lint 2>&1 | tail -3` — build clean, 252 passing, lint 16.

- [ ] **Step 3: Confirm the embargo still holds**

As an ordinary authenticated user in the dashboard:

```sql
select * from crew_award_votes limit 1;
```
Expected: zero rows even when rows exist, because those three tables have no SELECT policy. Then check the payload: on a **locked** round, `get_award_round`'s response must not contain the `votes`, `tags` or `notes` keys at all — absent, not empty.

- [ ] **Step 4: Manual pass at 375px**

- [ ] A session with **no group** shows no awards section.
- [ ] A grouped session with two climbers shows the section with a control to open a round.
- [ ] Open it; both climbers see the pickers inline — **no sheet, no navigation**.
- [ ] **A climber who is in the session but in no shared crew can vote, tag and comment.** This is the whole point of the change.
- [ ] Vote as both; the verdict appears inline, with the GOAT and donkey cards, tag tallies and comments.
- [ ] A third climber tries to **join** after the verdict is out → refused. 082's `session_group_verdict_is_out` guard reads `unlocked_at`, which only exists once 083 is applied, so this is the **first** time that guard can fire — it must be observed, not assumed.
- [ ] A third climber **accepts an invite** after the verdict is out — `accept_session_group` has no verdict guard, so this is the path that can still add a participant. They may vote, and **the verdict must not re-lock**: that is what the `unlocked_at` latch is for.
- [ ] The dig chips still work on both award cards.
- [ ] The session thread still posts and persists.
- [ ] A group whose members all share exactly one crew shows the repeat-donkey streak; a mixed group shows none.
- [ ] The crew page has **no** awards card, and `/crews/:crewId/awards/<anything>` no longer resolves.
- [ ] Nothing anywhere shows a grade or an attempt count.

- [ ] **Step 5: Confirm no points were minted**

`grep -rn "beta_points" supabase/migrations/083_awards_on_groups.sql src/components/SessionAwardsSection.tsx src/hooks/useSessionAwards.ts` — doc comments only.

- [ ] **Step 6: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill. **Do not push before 083 is applied.**

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| `group_id` unique on the round, `unlocked_at`, `crew_id` nullable | 1 Step 1 |
| Participants = live group membership | 1 Step 3 (`award_round_participants`) |
| Guards ask group membership, not crew | 1 Steps 2, 4, 5 |
| Unlocking is one-way | 1 Steps 3–4 (`unlocked_at` latch stamped in `cast_award_vote`) |
| `crew_award_candidates` deleted | 1 Step 6 |
| `crew_award_participants` no longer read | 1 Step 3 (retained, not dropped — data-retention precedent) |
| `am_participant` and the roster in the payload | 1 Step 7, 2 Step 1 |
| Embargo unchanged | 1 Step 9 greps, 5 Step 3 |
| Awards render inline on the session | 3 |
| `SessionAwardsCard`, the route and the page deleted | 4 |
| Streak crew-scoped where a crew exists | 1 Step 6 (derivation), 3 Step 1 (guarded on `crewId`) |
| No `beta_points` | 5 Step 5 |
| Release gate on 083 | 1 Step 10, 5 Step 1, 5 Step 6 |

**Deviations from the spec, stated deliberately:**

1. The spec says drop `crew_award_participants`. This plan **retains** it unread, matching how this project has removed every other feature (columns and tables kept, code path deleted) and avoiding destroying the snapshot behind legacy rounds.
2. The spec did not say how a round gets a crew. `session_groups.crew_id` is never written by 080, so "crew-scoped where a crew exists" would have meant the streak never appearing. Task 1 Step 6 derives it: exactly one crew that every current member shares, else none.
3. The spec's "delete the trim canonicalisation" is satisfied by deletion rather than edit — `crew_award_candidates` was the only place it lived in the awards.

**Placeholder scan:** every step names exact files and either shows the SQL or names the exact source to move and the exact deltas. Steps 5 and 7 of Task 1 and Steps 1–2 of Task 3 are deliberate *move* instructions rather than transcriptions — re-typing 079's payload builder or a 338-line page by hand is where a silent omission would come from.

**Type consistency:** `AwardRoundState` gains `am_participant: boolean` and `roster: string[]` in Task 2 and both are read in Task 3. `useAwardRoundForGroup(groupId)` and `useOpenAwardRound({ groupId })` are named identically in Tasks 2 and 3. `open_award_round(p_group)` matches between Task 1 Step 6 and Task 2 Step 1. `award_round_status` returns `(participants, voted, unlocked)` in Task 1 Step 3 and is consumed with those names in Steps 4 and 7.
