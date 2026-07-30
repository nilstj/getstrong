# Boulder Variations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a challenge optionally anchor to a shared boulder, making it a *variation* — the same wall with altered rules — that lives on the boulder page, anyone can try, and that pays guarded beta points when a video-backed clear teaches someone.

**Architecture:** One nullable column (`challenges.gym_problem_id`) turns the existing `challenges` / `challenge_attempts` tables into the variation store; no new tables. Integrity lives in the database — an RLS check requires a sent go on the boulder before you may set a variation there, and a `SECURITY DEFINER` trigger on `challenge_attempts` mints both point awards, because `beta_points` has no insert policy. The UI is a self-contained component at the top of the boulder page's Beta tab plus a text marker in the home strip.

**Tech Stack:** React 18 + TypeScript, Vite, React Query (array query keys), Supabase (Postgres + RLS), Tailwind (`sage`/`khaki` palettes), `lucide-react`, `react-hot-toast`, `BottomSheet` for modals, Vitest for pure utils.

**Spec:** [docs/superpowers/specs/2026-07-29-boulder-variations-design.md](../specs/2026-07-29-boulder-variations-design.md)

## Global Constraints

- **Vocabulary:** user-facing copy says **"variation"**, never "challenge", on the boulder page and in the strip. A *challenge* is the portable dare at `/challenges`; a *variation* is a constraint on one specific shared boulder. The schema keeps saying `challenges`.
- **Build:** `npm run build` is `tsc -b && vite build`. `noUnusedLocals` and `noUnusedParameters` are ON — an unused local is a build-failing error. `api/` is checked separately by Vercel, so a green local build does not guarantee a green deploy. This plan touches no `api/` files.
- **Lint:** `npm run lint` has a baseline of pre-existing problems. Measure it yourself before starting (`npm run lint 2>&1 | tail -3`) and add **zero** new ones. Do not trust a number quoted anywhere else.
- **Tests:** Vitest, and **only pure functions in `src/utils/`** are tested. There is no `@testing-library/react`. Hooks, components and pages are verified by `npm run build` plus a manual pass. Do not add component tests.
- **Migrations are applied by hand in the Supabase dashboard**, never by tooling from this repo. Writing the `.sql` file is the deliverable; applying it is the release gate.
- **Points must never be mintable by a client.** `beta_points` has no insert policy; every award is a `SECURITY DEFINER` trigger or RPC. Prefer a database constraint over a check-then-write.
- **No FK embed between `problems`/`challenges` and `profiles`.** Fetch profiles in a second `.in('id', ids)` query.
- **`BottomSheet` must be a sibling of a heading, never rendered inside one** — it inherits the font weight and is invalid markup.
- **Commit after every task.** Do not squash tasks together.

---

### Task 1: `boulderStripLabel` pure util

The one piece of logic here worth testing. It composes the caption under a boulder's ring in the Latest Gym Problems strip.

**Files:**
- Create: `src/utils/boulderStripLabel.ts`
- Test: `src/utils/boulderStripLabel.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `boulderStripLabel(grade: string | null | undefined, hasVariation: boolean): string` — used by Task 3.

- [ ] **Step 1: Write the failing test**

Create `src/utils/boulderStripLabel.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { boulderStripLabel } from './boulderStripLabel'

describe('boulderStripLabel', () => {
  it('is the grade alone when there is no variation', () => {
    expect(boulderStripLabel('6A', false)).toBe('6A')
  })

  it('marks a variation after the grade', () => {
    expect(boulderStripLabel('6A', true)).toBe('6A · Variation')
  })

  it('is the marker alone when the boulder has no grade yet', () => {
    expect(boulderStripLabel(null, true)).toBe('Variation')
    expect(boulderStripLabel(undefined, true)).toBe('Variation')
    expect(boulderStripLabel('', true)).toBe('Variation')
  })

  it('is empty when there is neither a grade nor a variation', () => {
    expect(boulderStripLabel(null, false)).toBe('')
    expect(boulderStripLabel('', false)).toBe('')
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/utils/boulderStripLabel.test.ts`
Expected: FAIL — `Failed to resolve import "./boulderStripLabel"`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/utils/boulderStripLabel.ts`:

```ts
/**
 * Caption under a boulder's ring in the Latest Gym Problems strip: the proposed
 * grade, with a "Variation" marker after it when the boulder has one.
 *
 * The marker is text rather than another badge on the circle deliberately — the
 * ring already carries help-wanted, video and hold colour, and StoryRing records
 * that it got too busy once already. The caption is `line-clamp-2`, so the longer
 * string wraps to a second line instead of needing new layout.
 */
export function boulderStripLabel(
  grade: string | null | undefined,
  hasVariation: boolean,
): string {
  if (hasVariation) return grade ? `${grade} · Variation` : 'Variation'
  return grade ?? ''
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run src/utils/boulderStripLabel.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/boulderStripLabel.ts src/utils/boulderStripLabel.test.ts
git commit -m "Add boulderStripLabel util for the variation marker"
```

---

### Task 2: Migration 076

The whole database change in one file: the anchor column, the sent-it guard, the missing UPDATE policy, the two new ledger reasons with their uniqueness guards, and the award trigger. It is one file because it is applied atomically by hand.

`challenges` turns out to have the same missing-UPDATE-policy gap as `challenge_attempts`, and it matters here: with the delete button gone for variations (their attempts cascade), editing is the only remedy for a mis-set one, so this migration adds that policy too, with a `with check` that repeats the sent-guard so an update can't repoint a variation onto a boulder the user hasn't sent.

**Files:**
- Create: `supabase/migrations/076_boulder_variations.sql`

**Interfaces:**
- Consumes: `gym_problems`, `problems`, `challenges`, `challenge_attempts`, `beta_points`, and `create_notification(p_recipient, p_actor, p_type, p_entity, p_data)` from migration 037.
- Produces: `challenges.gym_problem_id`; `beta_points.challenge_id`; ledger reasons `variation_taught` (5) and `variation_cleared` (1); notification type `variation_cleared` with `entity_id` = the gym problem id and `data` = `{challenge_id, challenge_title, video_url}`.

- [ ] **Step 1: Verify the UPDATE-policy gap before writing the fix**

The migration files give `challenge_attempts` only `select`, `insert` and `delete` policies (migration 003) — no `update`. Confirm:

```bash
grep -n -A3 "on challenge_attempts for" supabase/migrations/*.sql
```

Expected: matches for `insert` and `delete` only. Migrations are applied by hand, so the **live** database may already have an update policy that no file records — the migration below uses `drop policy if exists` first so it is safe either way.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/076_boulder_variations.sql`:

```sql
-- Boulder variations: a challenge can optionally anchor to a shared boulder.
-- An anchored challenge is a "variation" — the same wall with altered rules
-- (no heel hook, eliminate the crimp, static only, link into the red). It shows
-- on the boulder page, anyone may try it, and a video-backed clear pays points.
--
-- Scheme added here (values sit on migration 074's scale):
--    5  variation_taught   to the SETTER, the first time someone ELSE clears one
--                          of their variations on this boulder with a video
--    1  variation_cleared  to the CLEARER, capped per boulder (not per variation),
--                          video required, and only for clearing someone ELSE's
--                          variation
--
-- Both awards need a second party and so can't be self-minted: clearing your own
-- variation pays nothing at all, no matter how many variations you set on a
-- boulder you sent yourself.

-- ── 1. the anchor ────────────────────────────────────────────────────────────
alter table challenges
  add column if not exists gym_problem_id uuid
    references gym_problems(id) on delete set null;

-- set null, not cascade: if the boulder is deleted (migration 070) the variation
-- survives as a plain portable challenge and keeps its attempt videos. The
-- movement library outlives the set.
create index if not exists challenges_gym_problem_idx
  on challenges (gym_problem_id) where gym_problem_id is not null;

-- ── 2. you must have SENT the boulder to set a variation on it ────────────────
-- No impossible trolling: the setter has proved it goes. A database constraint
-- rather than a client check, and the direct client insert in useChallenges.ts
-- keeps working unchanged. Portable challenges (null anchor) are unaffected.
drop policy if exists "authenticated users can create challenges" on challenges;
create policy "authenticated users can create challenges"
  on challenges for insert
  with check (
    auth.uid() = creator_id
    and (
      gym_problem_id is null
      or exists (
        select 1 from public.problems p
         where p.user_id = auth.uid()
           and p.gym_problem_id = challenges.gym_problem_id
           and p.sent
      )
    )
  );

-- ── 3. the UPDATE policy challenge_attempts never had ────────────────────────
-- Migration 003 gave the table select/insert/delete only. With RLS on, that
-- means useUpdateChallengeAttempt matches zero rows and fails silently, and
-- migration 038's `after update of video_url` trigger can never fire. Clearing
-- a variation and adding the video afterwards both need updates to work.
drop policy if exists "users update own challenge attempts" on challenge_attempts;
create policy "users update own challenge attempts"
  on challenge_attempts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── 4. ledger: challenge_id, the two new reasons, and their guards ───────────
alter table beta_points
  add column if not exists challenge_id uuid
    references challenges(id) on delete set null;

alter table beta_points drop constraint if exists beta_points_reason_check;
alter table beta_points add constraint beta_points_reason_check
  check (reason in ('bounty_won', 'helpful', 'first_logger', 'beta_posted',
                    'engagement', 'variation_taught', 'variation_cleared'));

-- Setter: capped at one award per boulder, the same shape and cap as
-- beta_points_beta_posted_uniq in migration 074. Set ten variations on one
-- boulder and it is still 5 points.
create unique index if not exists beta_points_variation_taught_uniq
  on beta_points (user_id, gym_problem_id) where reason = 'variation_taught';

-- Clearer: capped at one award per boulder, not per variation — otherwise a user
-- could send a boulder once, then set and clear variations on it without limit.
-- Same shape and cap as beta_points_beta_posted_uniq in migration 074.
create unique index if not exists beta_points_variation_cleared_uniq
  on beta_points (user_id, gym_problem_id) where reason = 'variation_cleared';

-- ── 5. the award trigger ─────────────────────────────────────────────────────
-- beta_points has no insert policy (046), so this is a SECURITY DEFINER trigger
-- rather than a client call. It fires on update as well as insert because an
-- attempt can be ticked first and get its video later.
create or replace function public.award_variation_points()
returns trigger as $$
declare
  v_creator uuid;
  v_gpid    uuid;
  v_gym     text;
  v_title   text;
begin
  -- Only an evidenced clear pays. An unevidenced tick is still recorded and
  -- still displayed on the boulder — it just earns nothing.
  if not new.completed or new.video_url is null or length(trim(new.video_url)) = 0 then
    return new;
  end if;

  select c.creator_id, c.gym_problem_id, c.title
    into v_creator, v_gpid, v_title
    from public.challenges c
   where c.id = new.challenge_id;

  -- Portable challenges pay nothing, exactly as before this migration.
  if v_gpid is null then
    return new;
  end if;

  -- Clearing your own variation pays nothing and notifies nobody — the same
  -- second-party requirement the setter award already had, now guarding the
  -- clearer's award too. Without this, sending a boulder once and then looping
  -- create-a-variation / clear-it-yourself would mint points without limit.
  if v_creator = new.user_id then
    return new;
  end if;

  select gym into v_gym from public.gym_problems where id = v_gpid;
  if v_gym is null then
    return new;
  end if;

  -- Clearer: capped per boulder, not per variation — beta_points_variation_cleared_uniq
  -- is (user_id, gym_problem_id). A re-tick, a re-upload, or a second variation on
  -- the same boulder all no-op here.
  insert into public.beta_points
    (user_id, gym, gym_problem_id, challenge_id, points, reason, cycle_month)
  values
    (new.user_id, v_gym, v_gpid, new.challenge_id, 1, 'variation_cleared',
     to_char((now() at time zone 'utc'), 'YYYY-MM'))
  on conflict do nothing;

  -- Setter: 5 points the first time someone else clears a variation of theirs on
  -- this boulder. Guarded purely by its own unique index now — there is no
  -- shared idempotency flag between the two awards.
  insert into public.beta_points
    (user_id, gym, gym_problem_id, challenge_id, points, reason, cycle_month)
  values
    (v_creator, v_gym, v_gpid, new.challenge_id, 5, 'variation_taught',
     to_char((now() at time zone 'utc'), 'YYYY-MM'))
  on conflict do nothing;

  -- The notification gets its own idempotency check rather than riding on
  -- either points insert: the clearer's award can no-op (a second variation on
  -- a boulder already capped) while the setter still deserves to be told about
  -- this specific clear.
  if not exists (
    select 1 from public.notifications
     where recipient_id = v_creator
       and type = 'variation_cleared'
       and actor_id = new.user_id
       and data->>'challenge_id' = new.challenge_id::text
  ) then
    perform public.create_notification(
      v_creator, new.user_id, 'variation_cleared', v_gpid,
      jsonb_build_object(
        'challenge_id', new.challenge_id,
        'challenge_title', v_title,
        'video_url', new.video_url
      )
    );
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists on_variation_clear_award on challenge_attempts;
create trigger on_variation_clear_award
  after insert or update on challenge_attempts
  for each row execute procedure public.award_variation_points();
```

- [ ] **Step 3: Read the migration back against three failure modes**

No local database exists, so this step is a careful read-through, not a run. Confirm by eye:

1. **Nothing self-mints.** The only inserts into `beta_points` are inside a `SECURITY DEFINER` function; both carry `on conflict do nothing` and are guarded by their own unique index; the `v_creator = new.user_id` check returns before either insert and before the notification, so a self-clear never pays and a solo create-then-clear loop can't mint points without limit.
2. **Re-firing is inert.** Editing an attempt's notes re-runs the trigger; both `on conflict do nothing` inserts no-op against the existing rows, and the `not exists` check against `notifications` finds the earlier row and skips the notification too.
3. **Portable challenges are untouched.** `v_gpid is null` returns early, so `/challenges` behaviour and its existing points are unchanged.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/076_boulder_variations.sql
git commit -m "Add migration 076: anchor challenges to a boulder as variations"
```

---

### Task 3: Types, the strip flag, and the strip marker

Puts the marker on screen. Ends with a visible deliverable: a boulder with a variation reads `6A · Variation` in the home strip.

**Files:**
- Modify: `src/types/index.ts` (the `Challenge` interface at line 63, `BoulderSummary` at line 307, `NotificationType` at line 155)
- Modify: `src/hooks/useDiscoverBoulders.ts` (after the help query at line 94, and the summary map at line 103)
- Modify: `src/components/LatestProblemsStrip.tsx:35-48`
- Modify: `src/utils/__tests__/betaRequests.test.ts:5` (its `boulder()` helper builds a full `BoulderSummary` literal, so a new required field breaks the typecheck)

**Interfaces:**
- Consumes: `boulderStripLabel` from Task 1.
- Produces: `BoulderSummary.hasVariation: boolean`; `Challenge.gym_problem_id: string | null`; `NotificationType` includes `'variation_cleared'`.

- [ ] **Step 1: Add the three type changes**

In `src/types/index.ts`, add `gym_problem_id` to `Challenge`:

```ts
export interface Challenge {
  id: string
  creator_id: string
  title: string
  description: string | null
  video_url: string | null
  tags: string[]
  is_public: boolean
  /** Set when this challenge is a *variation* anchored to a shared boulder. */
  gym_problem_id: string | null
  created_at: string
}
```

Add the notification type to the `NotificationType` union, after `'crew_stripped'`:

```ts
  | 'crew_stripped'
  | 'variation_cleared'
```

Add the flag to `BoulderSummary`, after `helpWanted`:

```ts
  helpWanted: boolean
  /** At least one variation (an anchored challenge) has been set on this boulder. */
  hasVariation: boolean
```

- [ ] **Step 2: Populate the flag in `useDiscoverBoulders`**

In `src/hooks/useDiscoverBoulders.ts`, immediately after the `helpWantedIds` line (line 101), add:

```ts
      // Boulders carrying at least one variation (an anchored challenge). Non-fatal
      // like the help query above: before migration 076 is applied the column isn't
      // there, and no variation markers beats no home page.
      const { data: variationRows } = await supabase
        .from('challenges')
        .select('gym_problem_id')
        .in('gym_problem_id', ids)
      const variationIds = new Set(
        ((variationRows ?? []) as { gym_problem_id: string | null }[])
          .map(r => r.gym_problem_id)
          .filter((gid): gid is string => !!gid),
      )
```

Then in the `summaries` map, after the `helpWanted` line:

```ts
        helpWanted: helpWantedIds.has(b.id),
        hasVariation: variationIds.has(b.id),
```

- [ ] **Step 3: Fix the test helper the new required field breaks**

In `src/utils/__tests__/betaRequests.test.ts`, the `boulder()` helper constructs a full `BoulderSummary`. Add the field to it, beside the existing `helpWanted`:

```ts
    hasVariation: false,
```

- [ ] **Step 4: Use the label in the strip**

In `src/components/LatestProblemsStrip.tsx`, add the import:

```ts
import { boulderStripLabel } from '../utils/boulderStripLabel'
```

and replace the `stories.map(...)` block (lines 35-48) with:

```tsx
        {stories.map(b => {
          const label = boulderStripLabel(b.community_grade, b.hasVariation)
          return (
            <StoryRing
              key={b.id}
              label={label}
              ariaLabel={label ? `${b.title} (${label})` : b.title}
              imageUrl={b.image_url}
              fallbackGym={b.gym}
              color={b.color}
              helpWanted={b.helpWanted}
              hasVideo={!!b.beta_video_url}
              seen={seen?.has(b.id) ?? false}
              onClick={() => navigate(`/gym-problems/${b.id}`, { state: { boulderIds: storyIds } satisfies BoulderNavState })}
            />
          )
        })}
```

No change to `StoryRing` itself: its caption is already `line-clamp-2 max-w-[64px]`, so the longer label wraps.

- [ ] **Step 5: Verify the build and the tests**

Run: `npm run build`
Expected: exit 0, no errors. A `BoulderSummary` error anywhere means a construction site was missed — add `hasVariation` there too.

Run: `npx vitest run`
Expected: all pass, including `betaRequests`.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/hooks/useDiscoverBoulders.ts src/components/LatestProblemsStrip.tsx src/utils/__tests__/betaRequests.test.ts
git commit -m "Mark boulders that have a variation in the Latest Gym Problems strip"
```

---

### Task 4: `useVariations` hook

All data access for the boulder page block, in one file so the component stays presentational.

**Files:**
- Create: `src/hooks/useVariations.ts`

**Interfaces:**
- Consumes: `challenges`, `challenge_attempts`, `problems`, `profiles`; `supabase` from `../lib/supabase`; `useAuth` from `../providers/AuthProvider`.
- Produces, for Task 5:
  - `interface VariationClear { user_id: string; username: string | null; avatar_url: string | null; video_url: string | null }`
  - `interface Variation { id: string; title: string; description: string | null; video_url: string | null; creator_id: string; creator_name: string | null; created_at: string; clears: VariationClear[] }`
  - `useVariations(gymProblemId: string)` → `UseQueryResult<Variation[]>`
  - `useCanSetVariation(gymProblemId: string)` → `UseQueryResult<boolean>`
  - `useCreateVariation()` → mutation over `{ gymProblemId: string; title: string; description: string | null; videoUrl: string | null; tags: string[] }`
  - `useClearVariation()` → mutation over `{ challengeId: string; gymProblemId: string; videoUrl: string | null }`

- [ ] **Step 1: Write the hook file**

Create `src/hooks/useVariations.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'

/** Someone who has cleared a variation. */
export interface VariationClear {
  user_id: string
  username: string | null
  avatar_url: string | null
  /** Their proof clip, when they attached one. Only video-backed clears pay points. */
  video_url: string | null
}

/** A challenge anchored to a shared boulder: the same wall, altered rules. */
export interface Variation {
  id: string
  title: string
  description: string | null
  video_url: string | null
  creator_id: string
  creator_name: string | null
  created_at: string
  clears: VariationClear[]
}

/**
 * Variations set on one shared boulder, oldest first, each with everyone who has
 * cleared it. Profiles come from a second `.in('id', ids)` query — there is no FK
 * embed between challenges and profiles.
 */
export function useVariations(gymProblemId: string) {
  return useQuery({
    queryKey: ['variations', gymProblemId],
    enabled: !!gymProblemId,
    queryFn: async (): Promise<Variation[]> => {
      const { data: rows, error } = await supabase
        .from('challenges')
        .select('id, title, description, video_url, creator_id, created_at')
        .eq('gym_problem_id', gymProblemId)
        .order('created_at', { ascending: true })
      if (error) throw error
      const variations = (rows ?? []) as Omit<Variation, 'clears' | 'creator_name'>[]
      if (variations.length === 0) return []

      const ids = variations.map(v => v.id)
      const { data: attemptRows, error: e2 } = await supabase
        .from('challenge_attempts')
        .select('challenge_id, user_id, video_url')
        .in('challenge_id', ids)
        .eq('completed', true)
      if (e2) throw e2
      const attempts = (attemptRows ?? []) as
        { challenge_id: string; user_id: string; video_url: string | null }[]

      const userIds = Array.from(new Set([
        ...variations.map(v => v.creator_id),
        ...attempts.map(a => a.user_id),
      ]))
      const { data: profileRows, error: e3 } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', userIds)
      if (e3) throw e3
      const profiles = new Map(
        ((profileRows ?? []) as { id: string; username: string | null; avatar_url: string | null }[])
          .map(p => [p.id, p]),
      )

      // One clear per person per variation, keeping whichever row has a video so a
      // duplicate tick never hides the proof clip.
      const clearsBy = new Map<string, Map<string, VariationClear>>()
      for (const a of attempts) {
        const perVariation = clearsBy.get(a.challenge_id) ?? new Map<string, VariationClear>()
        const existing = perVariation.get(a.user_id)
        if (!existing || (!existing.video_url && a.video_url)) {
          const p = profiles.get(a.user_id)
          perVariation.set(a.user_id, {
            user_id: a.user_id,
            username: p?.username ?? null,
            avatar_url: p?.avatar_url ?? null,
            video_url: a.video_url,
          })
        }
        clearsBy.set(a.challenge_id, perVariation)
      }

      return variations.map(v => ({
        ...v,
        creator_name: profiles.get(v.creator_id)?.username ?? null,
        clears: Array.from(clearsBy.get(v.id)?.values() ?? []),
      }))
    },
  })
}

/**
 * Whether the current user may set a variation here — they must have logged a
 * *sent* go on this boulder. Mirrors the RLS check in migration 076 so the button
 * is never a trap; the database remains the real guard.
 */
export function useCanSetVariation(gymProblemId: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['can_set_variation', gymProblemId, user?.id],
    enabled: !!gymProblemId && !!user,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('problems')
        .select('id')
        .eq('user_id', user!.id)
        .eq('gym_problem_id', gymProblemId)
        .eq('sent', true)
        .limit(1)
      if (error) throw error
      return (data ?? []).length > 0
    },
  })
}

/**
 * Set a variation on a boulder. Always public — a variation on a shared boulder
 * is inherently public, so the boulder-page form has no visibility toggle. The
 * insert is written here rather than through useCreateChallenge so the portable
 * challenge path at /challenges keeps its own shape and its own invalidations.
 */
export function useCreateVariation() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (v: {
      gymProblemId: string
      title: string
      description: string | null
      videoUrl: string | null
      tags: string[]
    }) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase.from('challenges').insert({
        creator_id: user.id,
        gym_problem_id: v.gymProblemId,
        title: v.title,
        description: v.description,
        video_url: v.videoUrl,
        tags: v.tags,
        is_public: true,
      })
      if (error) throw error
    },
    onSuccess: (_data, v) => {
      qc.invalidateQueries({ queryKey: ['variations', v.gymProblemId] })
      qc.invalidateQueries({ queryKey: ['discover_boulders'] })
    },
  })
}

/**
 * Mark a variation cleared, optionally with a proof clip. Only a video-backed
 * clear pays points — the guard for that lives in the migration 076 trigger, not
 * here. Updating an existing attempt rather than inserting a second one needs the
 * UPDATE policy that migration 076 adds.
 */
export function useClearVariation() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (v: { challengeId: string; gymProblemId: string; videoUrl: string | null }) => {
      if (!user) throw new Error('Not authenticated')
      const { data: existing, error: e1 } = await supabase
        .from('challenge_attempts')
        .select('id')
        .eq('challenge_id', v.challengeId)
        .eq('user_id', user.id)
        .limit(1)
      if (e1) throw e1

      const mine = (existing ?? []) as { id: string }[]
      if (mine.length > 0) {
        const { error } = await supabase
          .from('challenge_attempts')
          .update({ completed: true, video_url: v.videoUrl })
          .eq('id', mine[0].id)
        if (error) throw error
        return
      }
      const { error } = await supabase.from('challenge_attempts').insert({
        challenge_id: v.challengeId,
        user_id: user.id,
        completed: true,
        video_url: v.videoUrl,
      })
      if (error) throw error
    },
    onSuccess: (_data, v) => {
      qc.invalidateQueries({ queryKey: ['variations', v.gymProblemId] })
      qc.invalidateQueries({ queryKey: ['leaderboard'] })
    },
  })
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: exit 0. Nothing imports the hook yet, but `noUnusedLocals` applies inside the file, so an unused import here fails the build.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useVariations.ts
git commit -m "Add useVariations hook for boulder variations"
```

---

### Task 5: The Variations block on the boulder page

Its own component, because [src/pages/CrewPage.tsx](../../../src/pages/CrewPage.tsx) is already ~730 lines and is one of the app's two hero screens.

**Placement:** the top of the **Beta** tab, above the "Asking for beta" panel. A variation *is* beta with a constraint, so it belongs with the beta actions — and this avoids a third tab diluting the two the page already has.

**Files:**
- Create: `src/components/BoulderVariations.tsx`
- Modify: `src/pages/CrewPage.tsx` (import, plus the `tab === 'beta'` block at line 583)

**Interfaces:**
- Consumes: `useVariations`, `useCanSetVariation`, `useCreateVariation`, `useClearVariation`, `Variation` from Task 4; `BottomSheet` from `./BottomSheet`; `useChallengeTags()` from `../hooks/useChallengeTags`, which returns `ChallengeTagDefinition[]` — `{ id, name, created_by, created_at }`, ordered by name. Do **not** import `VariationClear`; the component never names the type, and an unused import fails `noUnusedLocals`.
- Produces: `BoulderVariations({ gymProblemId, readOnly }: { gymProblemId: string; readOnly?: boolean })`.

- [ ] **Step 1: Write the component**

Create `src/components/BoulderVariations.tsx`:

```tsx
import { useState } from 'react'
import { Plus, Play } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../providers/AuthProvider'
import { BottomSheet } from './BottomSheet'
import { useChallengeTags } from '../hooks/useChallengeTags'
import {
  useVariations, useCanSetVariation, useCreateVariation, useClearVariation,
  type Variation,
} from '../hooks/useVariations'

/**
 * Variations on a shared boulder: the same wall with altered rules. Sits at the
 * top of the boulder page's Beta tab, because a variation is beta with a
 * constraint. Compact by design — that page is a hero screen.
 */
export function BoulderVariations({ gymProblemId, readOnly = false }: {
  gymProblemId: string
  readOnly?: boolean
}) {
  const { data: variations = [] } = useVariations(gymProblemId)
  const { data: canSet = false } = useCanSetVariation(gymProblemId)
  const [newVariationOpen, setNewVariationOpen] = useState(false)
  const [selected, setSelected] = useState<Variation | null>(null)

  if (readOnly && variations.length === 0) return null

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500">🧩 Variations</p>
        {!readOnly && canSet && (
          <button type="button" onClick={() => setNewVariationOpen(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-sage-700">
            <Plus size={13} strokeWidth={2.5} /> Set a variation
          </button>
        )}
      </div>

      {variations.length === 0 ? (
        <p className="mt-1.5 text-xs text-gray-400">
          {canSet
            ? 'None yet — same boulder, different rules. Set one.'
            : 'None yet. Send it first, then you can set one.'}
        </p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {variations.map(v => (
            <button key={v.id} type="button" onClick={() => setSelected(v)}
              className="w-full text-left rounded-xl bg-gray-50 px-2.5 py-2 hover:bg-gray-100">
              <p className="text-sm font-medium text-gray-800 leading-snug">{v.title}</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[11px] text-gray-400 truncate">
                  {v.creator_name ?? 'Someone'}
                </span>
                {v.clears.length > 0 && (
                  <>
                    <div className="flex -space-x-1.5">
                      {v.clears.slice(0, 5).map(c => (
                        <span key={c.user_id} title={c.username ?? ''}
                          className="w-5 h-5 rounded-full bg-sage-100 border-2 border-gray-50 grid place-items-center text-[8px] font-semibold text-sage-700 overflow-hidden">
                          {c.avatar_url
                            ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" />
                            : (c.username ?? '?').slice(0, 1).toUpperCase()}
                        </span>
                      ))}
                    </div>
                    <span className="text-[11px] text-gray-500">{v.clears.length} cleared</span>
                  </>
                )}
                {v.video_url && <Play size={11} fill="currentColor" className="text-sage-700" />}
              </div>
            </button>
          ))}
        </div>
      )}

      <SetVariationSheet open={newVariationOpen} onClose={() => setNewVariationOpen(false)} gymProblemId={gymProblemId} />
      <VariationSheet variation={selected} onClose={() => setSelected(null)} gymProblemId={gymProblemId} readOnly={readOnly} />
    </div>
  )
}

/** Detail: the constraint, the demo clip, and everyone's clears. */
function VariationSheet({ variation, onClose, gymProblemId, readOnly }: {
  variation: Variation | null
  onClose: () => void
  gymProblemId: string
  readOnly: boolean
}) {
  const { user } = useAuth()
  const clear = useClearVariation()
  const [video, setVideo] = useState('')

  if (!variation) return null
  const mine = variation.clears.find(c => c.user_id === user?.id)

  const submit = () => {
    clear.mutate(
      { challengeId: variation.id, gymProblemId, videoUrl: video.trim() || null },
      {
        onSuccess: () => {
          toast.success(video.trim() ? 'Cleared — nice 🧩' : 'Cleared. Add a clip to earn points.')
          setVideo('')
          onClose()
        },
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not save'),
      },
    )
  }

  return (
    <BottomSheet open onClose={onClose} title="Variation">
      <div className="space-y-4">
        <div>
          <p className="font-semibold text-gray-900">{variation.title}</p>
          {variation.description && <p className="mt-1 text-sm text-gray-600">{variation.description}</p>}
          <p className="mt-1 text-xs text-gray-400">set by {variation.creator_name ?? 'someone'}</p>
          {variation.video_url && (
            <a href={variation.video_url} target="_blank" rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-sage-700">
              <Play size={13} fill="currentColor" /> Watch the demo
            </a>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
            Cleared it ({variation.clears.length})
          </p>
          {variation.clears.length === 0 ? (
            <p className="text-xs text-gray-400">Nobody yet. Be first.</p>
          ) : (
            <div className="space-y-1.5">
              {variation.clears.map(c => (
                <div key={c.user_id} className="flex items-center gap-2 text-sm">
                  <span className="w-6 h-6 rounded-full bg-sage-100 grid place-items-center text-[10px] font-semibold text-sage-700 overflow-hidden flex-shrink-0">
                    {c.avatar_url
                      ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" />
                      : (c.username ?? '?').slice(0, 1).toUpperCase()}
                  </span>
                  <span className="flex-1 truncate text-gray-800">{c.username ?? 'Someone'}</span>
                  {c.video_url && (
                    <a href={c.video_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-xs font-medium text-sage-700">
                      <Play size={11} fill="currentColor" /> clip
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {!readOnly && (
          mine && mine.video_url ? (
            <p className="text-xs text-sage-700 font-medium">You've cleared this one ✓</p>
          ) : (
            <div className="space-y-2 rounded-xl border border-gray-200 p-2.5">
              {mine && (
                <p className="text-xs text-gray-500">
                  You've ticked this. Add a clip to make it count for points.
                </p>
              )}
              <input value={video} onChange={e => setVideo(e.target.value)}
                placeholder="Video of your clear (optional link)"
                className="w-full text-xs text-gray-700 focus:outline-none placeholder:text-gray-400" />
              <button type="button" onClick={submit} disabled={clear.isPending}
                className="w-full rounded-xl bg-sage-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {clear.isPending ? 'Saving…' : mine ? 'Add my clip' : 'I cleared it'}
              </button>
            </div>
          )
        )}
      </div>
    </BottomSheet>
  )
}

/** Set one. Only reachable if you've sent the boulder; RLS enforces the same rule. */
function SetVariationSheet({ open, onClose, gymProblemId }: {
  open: boolean
  onClose: () => void
  gymProblemId: string
}) {
  const create = useCreateVariation()
  const { data: tags = [] } = useChallengeTags()
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [video, setVideo] = useState('')
  const [picked, setPicked] = useState<string[]>([])

  const toggle = (name: string) =>
    setPicked(prev => prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name])

  const submit = () => {
    const t = title.trim()
    if (!t) { toast.error('What are the rules?'); return }
    create.mutate(
      {
        gymProblemId,
        title: t,
        description: detail.trim() || null,
        videoUrl: video.trim() || null,
        tags: picked,
      },
      {
        onSuccess: () => {
          toast.success('Variation set 🧩')
          setTitle(''); setDetail(''); setVideo(''); setPicked([])
          onClose()
        },
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not set it'),
      },
    )
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Set a variation">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">The rules</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. no heel hook on the arête"
            className="w-full border rounded-lg px-3 py-2.5" />
          <p className="mt-1 text-xs text-gray-400">Same boulder, harder rules. Keep it one line.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Detail (optional)</label>
          <input value={detail} onChange={e => setDetail(e.target.value)}
            placeholder="e.g. the crimp is off, everything else is on"
            className="w-full border rounded-lg px-3 py-2.5" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Demo video (optional link)</label>
          <input value={video} onChange={e => setVideo(e.target.value)}
            placeholder="Show how it goes"
            className="w-full border rounded-lg px-3 py-2.5" />
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map(t => (
              <button key={t.id} type="button" onClick={() => toggle(t.name)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  picked.includes(t.name) ? 'bg-sage-700 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                {t.name}
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={submit} disabled={!title.trim() || create.isPending}
          className="w-full bg-sage-700 text-white py-3 rounded-xl font-semibold disabled:opacity-50">
          {create.isPending ? 'Setting…' : 'Set variation'}
        </button>
      </div>
    </BottomSheet>
  )
}
```

- [ ] **Step 2: Mount it on the boulder page**

In `src/pages/CrewPage.tsx`, add the import beside the other component imports:

```ts
import { BoulderVariations } from '../components/BoulderVariations'
```

Then in the `tab === 'beta'` block (line 583), insert it as the first child of the `space-y-4` wrapper, directly above the `{/* Beta exchange overview */}` comment:

```tsx
        {tab === 'beta' && (
          <div className="space-y-4">
            <BoulderVariations
              gymProblemId={id}
              readOnly={boulder.status !== 'active' || left < 0}
            />

            {/* Beta exchange overview */}
```

`readOnly` mirrors the condition already guarding "Add to a session" at line 468: an archived or expired boulder shows its variations but takes no new ones.

- [ ] **Step 3: Verify the build and lint**

Run: `npm run build`
Expected: exit 0.

Run: `npm run lint 2>&1 | tail -3`
Expected: the same problem count you measured before starting. Not zero — zero *new*.

- [ ] **Step 4: Commit**

```bash
git add src/components/BoulderVariations.tsx src/pages/CrewPage.tsx
git commit -m "Show variations on the boulder page's Beta tab"
```

---

### Task 6: Notification rendering and the `/challenges` boulder chip

The trigger from Task 2 already writes the notification; this makes it readable and navigable, and marks anchored challenges in the Challenges tab.

**Files:**
- Modify: `src/components/AppBar.tsx` (`ICONS` at line 102, `describe` at line 122, `routeFor` at line 169)
- Modify: `src/pages/ChallengesPage.tsx` (the tag row inside `renderChallengeCard`, around line 83)

**Interfaces:**
- Consumes: `NotificationType` including `'variation_cleared'` from Task 3; notification `data` keys `challenge_title` and `video_url`, and `entity_id` = the gym problem id, from Task 2.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Add the icon**

In `src/components/AppBar.tsx`, add to the `ICONS` record, after `crew_stripped`:

```ts
  crew_stripped: '🧹',
  variation_cleared: '🧩',
```

`ICONS` is a `Record<Notification['type'], string>`, so omitting this is a build error — which is the point.

- [ ] **Step 2: Add the copy**

In `describe`, add a case before `default`:

```ts
    case 'variation_cleared':
      return {
        text: `${username} cleared your variation "${d.challenge_title ?? ''}"`,
        detail: d.video_url ? 'Watch their clip' : undefined,
      }
```

- [ ] **Step 3: Make it navigate to the boulder**

In `routeFor`, add alongside the other gym-problem cases:

```ts
    case 'variation_cleared':
      return n.entity_id ? `/gym-problems/${n.entity_id}` : null
```

The notification's `entity_id` is the gym problem, so the row lands on the boulder page where the variation lives.

- [ ] **Step 4: Mark anchored challenges in the Challenges tab**

In `src/pages/ChallengesPage.tsx`, inside `renderChallengeCard`, add to the flex-wrap row that holds the badge and tags — immediately after the `{showBadge && (...)}` expression and before the `challenge.tags?.map(...)`:

```tsx
          {challenge.gym_problem_id && (
            <span className="text-[10px] font-medium text-sage-700 bg-sage-50 border border-sage-200 rounded-full px-1.5 py-px">
              🧩 Variation
            </span>
          )}
```

A plain marker, not a link: the card's own click opens the challenge, and nesting an anchor inside that button would be invalid markup.

**Deviation from the spec, recorded deliberately.** The spec asks for a chip showing `ProblemColorIcons` plus the gym name and linking to `/gym-problems/:id`. Two things get in the way: the `challenges` row carries no colour or gym, so it would need an embed (`select('*, gym_problems(gym, color, hold_color)')`) in `useChallenges` and a type change; and the link can't be an anchor inside the card's `<button>`. The marker above identifies an anchored challenge, which is the point of the chip, and the richer version is a contained follow-on if the Challenges tab turns out to be a real entry point for variations. Do not silently "fix" this by nesting an anchor.

- [ ] **Step 5: Verify the build and lint**

Run: `npm run build`
Expected: exit 0.

Run: `npm run lint 2>&1 | tail -3`
Expected: unchanged from your measured baseline.

- [ ] **Step 6: Commit**

```bash
git add src/components/AppBar.tsx src/pages/ChallengesPage.tsx
git commit -m "Render variation-cleared notifications and mark anchored challenges"
```

---

## Release gate

**Migration 076 must be applied by hand in the Supabase dashboard before this client is deployed.** Pushing `main` auto-deploys via Vercel, so a push is a release.

**Ordering: 076 must be applied after 074 and 075, and must never be re-run (or have 074 re-run) out of that order.** 074 and 076 both drop and recreate `beta_points_reason_check`; 074's version does not include `variation_taught` / `variation_cleared`. If 074 runs after 076, the constraint reverts to the narrower list, and the award trigger — which has no exception handler — aborts the clearing statement outright instead of just failing to pay.

Before applying, check in the dashboard whether `challenge_attempts` already has an UPDATE policy that no migration file records; the statement is idempotent (`drop policy if exists` first), so it is safe either way.

The strip query degrades gracefully if the migration is late — no variation markers rather than a broken home page — but setting a variation will fail until the column and the policy exist.

## Manual verification pass

Do this on a boulder you have logged, after applying the migration:

- [ ] On a boulder you have **not** sent, the block shows "Send it first, then you can set one" and no Set button.
- [ ] On a boulder you **have** sent, set a variation. It appears in the block and on the `/challenges` tab with a 🧩 Variation chip.
- [ ] The boulder's ring in Latest Gym Problems now reads `<grade> · Variation`, wrapping to two lines, with the ring's other badges unchanged.
- [ ] As a **second user**, clear the variation with no video. It shows in "Cleared it"; check `beta_points` — no new row.
- [ ] Re-open and add a clip. The update **persists** (this is the policy fix). Now `beta_points` has one `variation_cleared` row (1 pt, the clearer) and one `variation_taught` row (5 pts, the setter), and the setter has a notification that opens the boulder page.
- [ ] Edit that attempt again. No second award, no second notification.
- [ ] Clear **your own** variation with a video: **no** points to you, no `variation_taught` row, no notification.
- [ ] Set a second variation on the same boulder and have the other user clear it with a video: they get **no** second 1 (capped per boulder, not per variation); you get **no** second 5 either (also capped per boulder). The setter notification still fires for this second clear.
- [ ] On an archived boulder, existing variations render read-only with no Set button and no clear form.
