# IG Redesign — Plan 1: Data Model (migrations + types + hooks + pure logic)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data foundation for the Instagram-style redesign — boulder-scoped beta with a "worked for N" signal, boulder reactions/digs, a crew-activity feed, plus the types/hooks/pure-logic the UI plans will consume. No UI in this plan.

**Architecture:** Four manually-applied Supabase migrations (boulder_beta, boulder_beta_worked + award RPCs, gym_problem_reactions, get_crew_feed RPC), all RLS-guarded with point-awarding done in SECURITY DEFINER functions (consistent with `beta_points`). Then TypeScript types, two TDD-tested pure helpers (crew titles + beta sort), and the react-query hooks.

**Tech Stack:** Supabase Postgres + RLS + SECURITY DEFINER plpgsql; React + TypeScript + Vite; `@tanstack/react-query`; Vitest. Spec: `docs/superpowers/specs/2026-06-26-ig-redesign-foundation-and-hero-screens-design.md`.

## Global Constraints

- **Migrations are applied MANUALLY in the Supabase dashboard.** This plan only writes the numbered `.sql` files; they are not run by any task. There is no SQL test harness — SQL tasks are verified by a reviewer diffing them against the reproduced patterns (here: `046_beta_points.sql`, `018_social_features.sql`) and by `npx tsc -b`.
- Next migration numbers are **052, 053, 054, 055** (existing files stop at 051; 049 was reverted — do not reuse 049).
- All new tables: `enable row level security`; `select` for `auth.role() = 'authenticated'`; owner-only writes — EXCEPT point-awarding writes, which have **no insert policy** and happen only inside SECURITY DEFINER functions (mirrors `beta_points`).
- Point awards reuse the existing `beta_points` ledger with `reason = 'helpful'`, `points = 5`, `gym` = the boulder's gym, `cycle_month = to_char((now() at time zone 'utc'), 'YYYY-MM')` — copied verbatim from `046_beta_points.sql`.
- ESLint baseline is **17 problems** — introduce **0 new**. `noUnusedLocals`/`noUnusedParameters` are ON (unused locals fail `tsc -b` and the Vercel build).
- `@typescript-eslint/no-unused-vars` runs with defaults — `ignoreRestSiblings` false, no `^_` ignore pattern — so any unused/`_`-prefixed binding fails lint.
- Verification gate per task: `npx tsc -b` clean + `npm run lint` ≤17 + (for tasks touching app code) `npm run build` succeeds; unit tasks also run `npx vitest run <file>`.
- Only pure utilities are unit-tested in this repo; hooks/components are verified by tsc/lint/build.

---

### Task 1: Migration 052 — `boulder_beta` table

**Files:**
- Create: `supabase/migrations/052_boulder_beta.sql`

**Interfaces:**
- Produces table `boulder_beta(id, gym_problem_id, user_id, body, video_url, awarded, created_at)`. `awarded` tracks whether the author has already received points for this beta (used by Task 2). At least one of `body`/`video_url` must be present.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/052_boulder_beta.sql`:

```sql
-- IG redesign: boulder-scoped beta. Beta is a first-class object on a shared
-- boulder (distinct from per-problem comments and challenge betas). A beta is a
-- tip (text) and/or an external video link. `awarded` records whether the author
-- has already received beta_points for this beta (set once in 053's RPC), so
-- reputation cannot be farmed by toggling "worked for me".
create table if not exists boulder_beta (
  id uuid primary key default gen_random_uuid(),
  gym_problem_id uuid not null references gym_problems(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text,
  video_url text,
  awarded boolean not null default false,
  created_at timestamptz not null default now(),
  constraint boulder_beta_nonempty check (
    (body is not null and length(trim(body)) > 0) or video_url is not null
  )
);
alter table boulder_beta enable row level security;

create index if not exists boulder_beta_gp_idx on boulder_beta (gym_problem_id, created_at desc);

create policy "boulder_beta viewable by authenticated users"
  on boulder_beta for select using (auth.role() = 'authenticated');
create policy "users manage own boulder_beta"
  on boulder_beta for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Verify the file parses as intended (self-check)**

There is no SQL runner. Re-read the file and confirm: RLS enabled, the `select` policy is authenticated-wide, the owner policy guards `for all` with both `using` and `with check`, and the check constraint requires text or video. No `tsc` impact.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/052_boulder_beta.sql
git commit -m "feat(db): boulder_beta table — boulder-scoped beta with award flag

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Migration 053 — `boulder_beta_worked` + `mark_beta_worked` / `unmark_beta_worked`

**Files:**
- Create: `supabase/migrations/053_boulder_beta_worked.sql`

**Interfaces:**
- Produces table `boulder_beta_worked(beta_id, user_id, created_at)` PK `(beta_id, user_id)` — one positive mark per user per beta; `worked_count` = row count, `worked_by_me` = row exists.
- Produces RPCs `mark_beta_worked(p_beta_id uuid)` and `unmark_beta_worked(p_beta_id uuid)`. The first mark of a beta sets `boulder_beta.awarded` and awards the **author** 5 `helpful` `beta_points` once (never the author marking their own beta; never re-awarded). Unmark deletes the mark (count drops) but never claws back points.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/053_boulder_beta_worked.sql`:

```sql
-- IG redesign: the "✓ worked for me" signal that ranks beta and credits authors.
-- One mark per (beta, user). The FIRST time any climber marks a beta worked, the
-- author is credited once (beta_points 'helpful', 5 pts), guarded by
-- boulder_beta.awarded so toggling can't farm points. Marking your own beta does
-- not pay you. Counting "worked for N" = count(*) of rows for the beta.
create table if not exists boulder_beta_worked (
  beta_id uuid not null references boulder_beta(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (beta_id, user_id)
);
alter table boulder_beta_worked enable row level security;

create policy "boulder_beta_worked viewable by authenticated users"
  on boulder_beta_worked for select using (auth.role() = 'authenticated');
create policy "users manage own worked marks"
  on boulder_beta_worked for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Mark a beta as "worked for me". Idempotent (PK). On the first-ever mark of the
-- beta, credit the author once. SECURITY DEFINER so it can write beta_points
-- (which has no insert policy).
create or replace function public.mark_beta_worked(p_beta_id uuid)
returns void as $$
declare
  v_user_id uuid := auth.uid();
  v_author  uuid;
  v_gpid    uuid;
  v_gym     text;
  v_first   boolean := false;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select b.user_id, b.gym_problem_id into v_author, v_gpid
    from boulder_beta b where b.id = p_beta_id;
  if v_author is null then
    raise exception 'beta not found';
  end if;

  insert into boulder_beta_worked (beta_id, user_id)
  values (p_beta_id, v_user_id)
  on conflict (beta_id, user_id) do nothing;

  -- Award the author once, the first time this beta works for anyone (not self).
  if v_author <> v_user_id then
    update boulder_beta set awarded = true
      where id = p_beta_id and awarded = false;
    if found then
      select gym into v_gym from gym_problems where id = v_gpid;
      if v_gym is not null then
        insert into public.beta_points (user_id, gym, gym_problem_id, points, reason, cycle_month)
        values (v_author, v_gym, v_gpid, 5, 'helpful',
                to_char((now() at time zone 'utc'), 'YYYY-MM'));
      end if;
    end if;
  end if;
end;
$$ language plpgsql security definer;

-- Remove your "worked" mark (drops the count). Reputation already earned by the
-- author is intentionally not clawed back.
create or replace function public.unmark_beta_worked(p_beta_id uuid)
returns void as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  delete from boulder_beta_worked where beta_id = p_beta_id and user_id = v_user_id;
end;
$$ language plpgsql security definer;
```

- [ ] **Step 2: Self-check against `046_beta_points.sql`**

Re-read and confirm the `beta_points` insert matches 046 verbatim in column list, `points = 5`, `reason = 'helpful'`, and the `cycle_month` expression. Confirm the award is guarded by `awarded = false` + `found`, and skipped when `v_author = v_user_id`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/053_boulder_beta_worked.sql
git commit -m "feat(db): boulder_beta_worked + mark/unmark RPCs (worked-for-N, author credit)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Migration 054 — `gym_problem_reactions`

**Files:**
- Create: `supabase/migrations/054_gym_problem_reactions.sql`

**Interfaces:**
- Produces table `gym_problem_reactions(id, gym_problem_id, user_id, emoji, created_at)` unique `(gym_problem_id, user_id, emoji)` — mirrors `problem_reactions`. Powers the `+ dig`/reaction bar on boulders.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/054_gym_problem_reactions.sql`:

```sql
-- IG redesign: reactions / "digs" on a shared boulder. Mirrors problem_reactions
-- (migration 018) but keyed to gym_problems so banter lives on the shared object.
create table if not exists gym_problem_reactions (
  id uuid primary key default gen_random_uuid(),
  gym_problem_id uuid not null references gym_problems(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (gym_problem_id, user_id, emoji)
);
alter table gym_problem_reactions enable row level security;

create index if not exists gym_problem_reactions_gp_idx on gym_problem_reactions (gym_problem_id);

create policy "gym_problem_reactions viewable by authenticated users"
  on gym_problem_reactions for select using (auth.role() = 'authenticated');
create policy "users manage own gym_problem_reactions"
  on gym_problem_reactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Self-check against `018_social_features.sql`**

Confirm shape/policies match `problem_reactions` (authenticated select; owner `for all` with `using` + `with check`; unique triple).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/054_gym_problem_reactions.sql
git commit -m "feat(db): gym_problem_reactions — digs/reactions on shared boulders

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Migration 055 — `get_crew_feed` RPC

**Files:**
- Create: `supabase/migrations/055_get_crew_feed.sql`

**Interfaces:**
- Produces `get_crew_feed(p_limit int, p_before timestamptz)` returning the unified feed row set consumed by `useCrewFeed` (Task 6). Scope: boulders in any gym the caller has logged a problem in. Columns (exact names the hook/types depend on): `event_type text, event_at timestamptz, actor_id uuid, gym_problem_id uuid, boulder_name text, boulder_color text, boulder_grade text, boulder_image_url text, gym text, beta_id uuid, beta_snippet text, beta_video_url text`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/055_get_crew_feed.sql`:

```sql
-- IG redesign: the home activity feed. Unifies four event kinds over the boulders
-- in gyms the caller climbs at (any gym they've logged a problem in), newest
-- first, keyset-paged by event_at < p_before. SECURITY DEFINER for a stable read
-- across the joined tables; every row is public-readable data anyway.
create or replace function public.get_crew_feed(
  p_limit  int default 20,
  p_before timestamptz default null
)
returns table (
  event_type        text,
  event_at          timestamptz,
  actor_id          uuid,
  gym_problem_id    uuid,
  boulder_name      text,
  boulder_color     text,
  boulder_grade     text,
  boulder_image_url text,
  gym               text,
  beta_id           uuid,
  beta_snippet      text,
  beta_video_url    text
) as $$
declare
  v_user_id uuid := auth.uid();
  v_before  timestamptz := coalesce(p_before, now());
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  return query
  with my_gyms as (
    select distinct gym from problems
     where user_id = v_user_id and gym is not null
  )
  select * from (
    -- new boulder
    select 'boulder_new'::text, gp.created_at, gp.created_by, gp.id,
           gp.name, gp.color, gp.community_grade, gp.image_url, gp.gym,
           null::uuid, null::text, null::text
      from gym_problems gp
     where gp.gym in (select gym from my_gyms) and gp.created_by is not null

    union all
    -- send (someone logged a sent problem linked to a boulder)
    select 'send'::text, p.created_at, p.user_id, gp.id,
           gp.name, gp.color, gp.community_grade, gp.image_url, gp.gym,
           null::uuid, null::text, null::text
      from problems p
      join gym_problems gp on gp.id = p.gym_problem_id
     where gp.gym in (select gym from my_gyms) and p.sent = true

    union all
    -- beta added
    select 'beta_added'::text, bb.created_at, bb.user_id, gp.id,
           gp.name, gp.color, gp.community_grade, gp.image_url, gp.gym,
           bb.id, left(bb.body, 140), bb.video_url
      from boulder_beta bb
      join gym_problems gp on gp.id = bb.gym_problem_id
     where gp.gym in (select gym from my_gyms)

    union all
    -- beta worked for someone
    select 'beta_worked'::text, w.created_at, w.user_id, gp.id,
           gp.name, gp.color, gp.community_grade, gp.image_url, gp.gym,
           bb.id, left(bb.body, 140), bb.video_url
      from boulder_beta_worked w
      join boulder_beta bb on bb.id = w.beta_id
      join gym_problems gp on gp.id = bb.gym_problem_id
     where gp.gym in (select gym from my_gyms)
  ) feed
  where feed.event_at < v_before
  order by feed.event_at desc
  limit greatest(1, least(p_limit, 50));
end;
$$ language plpgsql security definer;
```

Note: `gym_problems.community_grade` is confirmed present (used by the existing picker/crew code). If a column referenced here is missing at apply time, that is a release-gate failure surfaced when the migration is applied — not something this code task can run.

- [ ] **Step 2: Self-check**

Confirm: the four `union all` branches have identical column counts/types/order matching the `returns table (...)` list; keyset filter `event_at < v_before`; `order by event_at desc`; limit clamped to ≤50.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/055_get_crew_feed.sql
git commit -m "feat(db): get_crew_feed RPC — unified crew activity feed

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Types + pure helpers (`crewTitles`, `betaSort`) with tests

**Files:**
- Modify: `src/types/index.ts` (append new types)
- Create: `src/utils/crewTitles.ts`
- Create: `src/utils/crewTitles.test.ts`
- Create: `src/utils/betaSort.ts`
- Create: `src/utils/betaSort.test.ts`

**Interfaces:**
- Produces types: `BoulderBeta`, `FeedEventType`, `FeedEvent`, `CrewTitle`, `BoulderReaction`.
- Produces `crewTitles(rows): Record<string, CrewTitle[]>` and `CREW_TITLE_META`.
- Produces `betaSort(a, b): number` (worked_count desc, then created_at desc).

- [ ] **Step 1: Append types to `src/types/index.ts`**

```ts
export interface BoulderBeta {
  id: string
  gym_problem_id: string
  user_id: string
  body: string | null
  video_url: string | null
  created_at: string
  worked_count: number
  worked_by_me: boolean
}

export interface BoulderReaction {
  id: string
  gym_problem_id: string
  user_id: string
  emoji: string
  created_at: string
}

export type FeedEventType = 'boulder_new' | 'send' | 'beta_added' | 'beta_worked'

export interface FeedEvent {
  event_type: FeedEventType
  event_at: string
  actor_id: string
  gym_problem_id: string
  boulder_name: string | null
  boulder_color: string | null
  boulder_grade: string | null
  boulder_image_url: string | null
  gym: string | null
  beta_id: string | null
  beta_snippet: string | null
  beta_video_url: string | null
}

export type CrewTitle = 'flash' | 'grinder' | 'first_send' | 'sandbagger'
```

- [ ] **Step 2: Write the failing test for `crewTitles`**

Create `src/utils/crewTitles.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { crewTitles } from './crewTitles'

const row = (user_id: string, sent: boolean, attempts: number, created_at: string) =>
  ({ user_id, sent, attempts, created_at })

describe('crewTitles', () => {
  it('awards flash to a one-attempt send', () => {
    const t = crewTitles([row('a', true, 1, '2026-01-01')])
    expect(t['a']).toContain('flash')
  })

  it('awards grinder to the sender with the most attempts', () => {
    const t = crewTitles([
      row('a', true, 2, '2026-01-01'),
      row('b', true, 9, '2026-01-02'),
    ])
    expect(t['b']).toContain('grinder')
    expect(t['a'] ?? []).not.toContain('grinder')
  })

  it('awards first_send to the earliest sender', () => {
    const t = crewTitles([
      row('a', true, 3, '2026-01-05'),
      row('b', true, 3, '2026-01-02'),
    ])
    expect(t['b']).toContain('first_send')
  })

  it('ignores non-senders for flash/grinder/first_send', () => {
    const t = crewTitles([row('a', false, 1, '2026-01-01')])
    expect(t['a'] ?? []).toEqual([])
  })

  it('returns an empty map for no rows', () => {
    expect(crewTitles([])).toEqual({})
  })
})
```

- [ ] **Step 3: Run it; verify it fails**

Run: `npx vitest run src/utils/crewTitles.test.ts`
Expected: FAIL — `crewTitles` not found.

- [ ] **Step 4: Implement `crewTitles`**

Create `src/utils/crewTitles.ts`:

```ts
import type { CrewTitle } from '../types'

export const CREW_TITLE_META: Record<CrewTitle, { label: string; emoji: string }> = {
  flash:      { label: 'Flash',      emoji: '👑' },
  grinder:    { label: 'Grinder',    emoji: '🪨' },
  first_send: { label: 'First send', emoji: '🥇' },
  sandbagger: { label: 'Sandbagger', emoji: '🤨' },
}

export interface CrewTitleRow {
  user_id: string
  sent: boolean
  attempts: number
  created_at: string
}

/**
 * Derive playful per-climber titles for one boulder from the problems logged
 * against it. Pure; no DB. Sandbagger is intentionally not derived here (it
 * needs a community-grade comparison decided later) — see the spec's open Qs.
 */
export function crewTitles(rows: CrewTitleRow[]): Record<string, CrewTitle[]> {
  const out: Record<string, CrewTitle[]> = {}
  const add = (u: string, t: CrewTitle) => { (out[u] ??= []).push(t) }

  const senders = rows.filter(r => r.sent)

  for (const r of senders) {
    if (r.attempts <= 1) add(r.user_id, 'flash')
  }

  if (senders.length > 0) {
    const grinder = senders.reduce((m, r) => (r.attempts > m.attempts ? r : m))
    if (grinder.attempts > 1) add(grinder.user_id, 'grinder')

    const first = senders.reduce((m, r) => (r.created_at < m.created_at ? r : m))
    add(first.user_id, 'first_send')
  }

  // Ensure non-senders that appear in rows resolve to [] rather than undefined
  // only when queried — callers use (out[id] ?? []).
  return out
}
```

- [ ] **Step 5: Run the test; verify it passes**

Run: `npx vitest run src/utils/crewTitles.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Write the failing test for `betaSort`**

Create `src/utils/betaSort.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { betaSort } from './betaSort'
import type { BoulderBeta } from '../types'

const beta = (id: string, worked_count: number, created_at: string): BoulderBeta =>
  ({ id, gym_problem_id: 'g', user_id: 'u', body: 'x', video_url: null, created_at, worked_count, worked_by_me: false })

describe('betaSort', () => {
  it('ranks higher worked_count first', () => {
    const list = [beta('a', 1, '2026-01-02'), beta('b', 9, '2026-01-01')]
    expect([...list].sort(betaSort).map(b => b.id)).toEqual(['b', 'a'])
  })

  it('breaks ties by most recent', () => {
    const list = [beta('a', 3, '2026-01-01'), beta('b', 3, '2026-01-09')]
    expect([...list].sort(betaSort).map(b => b.id)).toEqual(['b', 'a'])
  })
})
```

- [ ] **Step 7: Run it; verify it fails**

Run: `npx vitest run src/utils/betaSort.test.ts`
Expected: FAIL — `betaSort` not found.

- [ ] **Step 8: Implement `betaSort`**

Create `src/utils/betaSort.ts`:

```ts
import type { BoulderBeta } from '../types'

/** Rank beta by what worked: most "worked for me" first, then most recent. */
export function betaSort(a: BoulderBeta, b: BoulderBeta): number {
  if (b.worked_count !== a.worked_count) return b.worked_count - a.worked_count
  return b.created_at.localeCompare(a.created_at)
}
```

- [ ] **Step 9: Run both tests + full suite**

Run: `npx vitest run src/utils/crewTitles.test.ts src/utils/betaSort.test.ts && npx tsc -b && npm run lint`
Expected: tests PASS; tsc clean; lint ≤17.

- [ ] **Step 10: Commit**

```bash
git add src/types/index.ts src/utils/crewTitles.ts src/utils/crewTitles.test.ts src/utils/betaSort.ts src/utils/betaSort.test.ts
git commit -m "feat: redesign types + crewTitles/betaSort pure helpers (tested)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Hooks (`useBoulderBetas`, `useMarkBetaWorked`/`useUnmarkBetaWorked`, `useGymProblemReactions`, `useCrewFeed`)

**Files:**
- Create: `src/hooks/useBoulderBeta.ts`
- Create: `src/hooks/useCrewFeed.ts`

**Interfaces:**
- Consumes: types + `betaSort` (Task 5); the `supabase` client (`src/lib/supabase` — confirm the import path matches the other hooks, e.g. `useReactions.ts`).
- Produces:
  - `useBoulderBetas(gymProblemId: string)` → `{ data: BoulderBeta[] }` sorted by `betaSort`.
  - `useAddBoulderBeta()` → mutate `{ gymProblemId, body, videoUrl }`.
  - `useMarkBetaWorked()` / `useUnmarkBetaWorked()` → mutate `{ betaId, gymProblemId }` (gymProblemId for cache invalidation).
  - `useGymProblemReactions(gymProblemId)`, `useAddGymProblemReaction()`, `useRemoveGymProblemReaction()`.
  - `useCrewFeed()` → infinite query of `FeedEvent[]` pages via `get_crew_feed`.

- [ ] **Step 1: Confirm the supabase import path + query-key + reaction patterns**

Open `src/hooks/useReactions.ts` and `src/hooks/useGymProblems.ts`. Copy their `import { supabase } from '...'` path, their `useQueryClient` + `invalidateQueries` style, and the `problem_reactions` add/remove shape (this plan mirrors them). Use the same conventions.

- [ ] **Step 2: Write `useBoulderBeta.ts`**

Create `src/hooks/useBoulderBeta.ts` (adjust the `supabase` import to match Step 1):

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { betaSort } from '../utils/betaSort'
import type { BoulderBeta, BoulderReaction } from '../types'

// ---- Beta thread ----
export function useBoulderBetas(gymProblemId: string) {
  return useQuery({
    queryKey: ['boulder_beta', gymProblemId],
    enabled: !!gymProblemId,
    queryFn: async (): Promise<BoulderBeta[]> => {
      const { data: { user } } = await supabase.auth.getUser()
      const [betasRes, workedRes] = await Promise.all([
        supabase
          .from('boulder_beta')
          .select('id, gym_problem_id, user_id, body, video_url, created_at, boulder_beta_worked(count)')
          .eq('gym_problem_id', gymProblemId),
        supabase
          .from('boulder_beta_worked')
          .select('beta_id')
          .eq('user_id', user?.id ?? ''),
      ])
      if (betasRes.error) throw betasRes.error
      const mine = new Set((workedRes.data ?? []).map(r => r.beta_id as string))
      const rows = (betasRes.data ?? []).map((r): BoulderBeta => ({
        id: r.id as string,
        gym_problem_id: r.gym_problem_id as string,
        user_id: r.user_id as string,
        body: r.body as string | null,
        video_url: r.video_url as string | null,
        created_at: r.created_at as string,
        worked_count: ((r.boulder_beta_worked as { count: number }[] | null)?.[0]?.count) ?? 0,
        worked_by_me: mine.has(r.id as string),
      }))
      return rows.sort(betaSort)
    },
  })
}

export function useAddBoulderBeta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { gymProblemId: string; body: string | null; videoUrl: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('boulder_beta')
        .insert({ gym_problem_id: v.gymProblemId, user_id: user?.id, body: v.body, video_url: v.videoUrl })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['boulder_beta', v.gymProblemId] }),
  })
}

export function useMarkBetaWorked() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { betaId: string; gymProblemId: string }) => {
      const { error } = await supabase.rpc('mark_beta_worked', { p_beta_id: v.betaId })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['boulder_beta', v.gymProblemId] }),
  })
}

export function useUnmarkBetaWorked() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { betaId: string; gymProblemId: string }) => {
      const { error } = await supabase.rpc('unmark_beta_worked', { p_beta_id: v.betaId })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['boulder_beta', v.gymProblemId] }),
  })
}

// ---- Reactions / digs on a boulder ----
export function useGymProblemReactions(gymProblemId: string) {
  return useQuery({
    queryKey: ['gym_problem_reactions', gymProblemId],
    enabled: !!gymProblemId,
    queryFn: async (): Promise<BoulderReaction[]> => {
      const { data, error } = await supabase
        .from('gym_problem_reactions')
        .select('*')
        .eq('gym_problem_id', gymProblemId)
      if (error) throw error
      return (data ?? []) as BoulderReaction[]
    },
  })
}

export function useAddGymProblemReaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { gymProblemId: string; emoji: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('gym_problem_reactions')
        .insert({ gym_problem_id: v.gymProblemId, user_id: user?.id, emoji: v.emoji })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['gym_problem_reactions', v.gymProblemId] }),
  })
}

export function useRemoveGymProblemReaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { gymProblemId: string; emoji: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('gym_problem_reactions')
        .delete()
        .eq('gym_problem_id', v.gymProblemId)
        .eq('user_id', user?.id ?? '')
        .eq('emoji', v.emoji)
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['gym_problem_reactions', v.gymProblemId] }),
  })
}
```

- [ ] **Step 3: Write `useCrewFeed.ts`**

Create `src/hooks/useCrewFeed.ts`:

```ts
import { useInfiniteQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { FeedEvent } from '../types'

const PAGE = 20

export function useCrewFeed() {
  return useInfiniteQuery({
    queryKey: ['crew_feed'],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<FeedEvent[]> => {
      const { data, error } = await supabase.rpc('get_crew_feed', {
        p_limit: PAGE,
        p_before: pageParam,
      })
      if (error) throw error
      return (data ?? []) as FeedEvent[]
    },
    getNextPageParam: last =>
      last.length === PAGE ? last[last.length - 1].event_at : undefined,
  })
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: tsc clean; lint ≤17; build succeeds. (The `react-hooks` plugin must report no new issues.)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBoulderBeta.ts src/hooks/useCrewFeed.ts
git commit -m "feat: hooks for boulder beta, worked-for, boulder reactions, crew feed

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Release gate (when this ships)

Apply migrations **052 → 053 → 054 → 055** in the Supabase dashboard **before** deploying any frontend from the later UI plans that calls them. The hooks here are inert until a UI plan mounts them, so this plan can merge ahead of the apply, but nothing that calls `get_crew_feed` / `mark_beta_worked` / the new tables may go live first.

## Self-Review

**1. Spec coverage (data-model portions):**
- `boulder_beta` first-class beta → Task 1 ✓
- "worked for N" + idempotent author credit → Task 2 (`mark_beta_worked`, `awarded` guard, self-exclusion) ✓
- dig/reactions on boulders → Task 3 + Task 6 reaction hooks ✓
- crew feed RPC + hook → Task 4 + Task 6 `useCrewFeed` ✓
- derived crew titles (pure, tested) → Task 5 `crewTitles` ✓
- beta ranking (worked desc, recency) → Task 5 `betaSort`, applied in `useBoulderBetas` ✓
- types `BoulderBeta`/`FeedEvent`/`CrewTitle`/`BoulderReaction` → Task 5 ✓
- reuse `beta_points` for reputation → Task 2 (verbatim insert) ✓

**2. Placeholder scan:** No TBD/TODO; every SQL and TS step is complete. Sandbagger is explicitly deferred (documented in `crewTitles`), not a silent gap.

**3. Type consistency:** `BoulderBeta` fields are identical across the type def, `betaSort` test, and `useBoulderBetas` mapping. `FeedEvent` columns match the RPC `returns table (...)` names one-for-one. Mutation inputs (`{ betaId, gymProblemId }`, `{ gymProblemId, emoji }`, `{ gymProblemId, body, videoUrl }`) are the shapes the UI plans will call. `get_crew_feed` params (`p_limit`, `p_before`) match `useCrewFeed`.

**4. Lint safety:** The mutations use `onSuccess: (_, v) =>` — the exact pattern already passing lint in `src/hooks/useReactions.ts` (lines 48, 73, 105, 124). It is lint-safe because `no-unused-vars` runs with `args: 'after-used'`: an unused positional arg (`_`) that precedes a used one (`v`) is never reported. No new discarded/`_`-prefixed *standalone* bindings are introduced. Implementer: match `useReactions.ts` verbatim if in any doubt.
