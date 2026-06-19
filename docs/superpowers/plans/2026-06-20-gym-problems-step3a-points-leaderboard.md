# Gym Problems — Step 3a (Beta Points Ledger + Monthly Leaderboard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the `beta_points` ledger, award points for the two actions that already exist (creating a shared boulder → `first_logger`; getting your beta marked helpful → `helpful`), and surface a monthly per-gym leaderboard on the Crew page — the first, visible slice of payoff C.

**Architecture:** A new append-only `beta_points` ledger, written only by `SECURITY DEFINER` functions so points cannot be self-minted. Two existing functions are extended via `create or replace`: `create_gym_problem` (migration 044) awards the creator `first_logger` points; `award_helpful_response` (migration 039) awards the helper `helpful` points. The leaderboard reads raw ledger rows (readable by all authenticated users) and aggregates/ranks them in a **pure, unit-tested helper** — no SQL aggregation function. It renders as a section on the existing Crew page, which already knows the boulder's gym.

**Tech Stack:** React 18 + TypeScript, Vite, `@tanstack/react-query`, Supabase (Postgres + RLS + triggers), Tailwind, `lucide-react`, `react-router-dom`, Vitest (jsdom).

## Global Constraints

- **`beta_points` is append-only and written ONLY by `SECURITY DEFINER` functions.** No client insert policy. Readable by any authenticated user (for the leaderboard).
- **Point values (this slice):** `first_logger` = **10**, `helpful` = **5**. The `reason` check constraint also permits `bounty_won` (used in step 3b; unused here).
- **`cycle_month` format is `YYYY-MM` (UTC).** SQL writes it as `to_char((now() at time zone 'utc'), 'YYYY-MM')`. The client computes the same value as `date.toISOString().slice(0, 7)` — both UTC, so they match.
- **Leaderboard is per-gym, current cycle.** Aggregation (sum points per user, sort desc, assign competition ranks) is a **pure helper**, not SQL. The Crew page passes `boulder.gym` + the current cycle month.
- **Helpful points require a gym.** Only insert a `helpful` row when the asker's problem has a non-null `gym` (an outdoor/un-gymmed problem earns no leaderboard points). `first_logger` always has a gym (`gym_problems.gym` is NOT NULL).
- **Extending existing functions must preserve their current behavior exactly** (badges, notifications) and only ADD the points insert. Reproduce the full function body via `create or replace`.
- **Migrations are numbered SQL applied manually via the Supabase SQL editor** — no CLI/local DB, no SQL test harness. A migration "passes" on clean apply + the verification query. Do not invent a SQL test harness.
- **Tests exist only for pure utilities** (`src/utils/__tests__/*.test.ts`, Vitest). Hooks/components verified via `npx tsc -b` + `npm run lint` + `npm run build`. Apply TDD only to the pure helpers in Task 2.
- **Naming/style:** React Query array keys, `useX` hooks, `sage-700` accent, `lucide-react` icons. Follow existing patterns.
- **Out of scope (step 3b / later):** bounty staking, monthly point budget, award-on-send, scoping help requests to gym_problems, the standalone leaderboard page, lifecycle archival. Do NOT build these.

---

### Task 1: Migration 046 — `beta_points` ledger + first_logger & helpful awards

**Files:**
- Create: `supabase/migrations/046_beta_points.sql`

**Interfaces:**
- Consumes: `gym_problems` + `create_gym_problem` (migration 044), `award_helpful_response` (migration 039), `problems`, `help_requests`, `help_responses`, `auth.users`.
- Produces (relied on by Task 3): table `beta_points(id, user_id, gym, gym_problem_id, points, reason, cycle_month, created_at)`, readable by authenticated users; ledger rows written by the two extended functions.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/046_beta_points.sql`. The two `create or replace` blocks reproduce the current functions verbatim and ADD only the marked points insert.

```sql
-- Crew Projects step 3a: the beta_points ledger (payoff C, points half).
-- Append-only, written only by SECURITY DEFINER functions so points cannot be
-- self-minted. Readable by all authenticated users for the per-gym leaderboard.
-- The monthly leaderboard is computed client-side from these rows (no SQL
-- aggregation function). Bounty (`bounty_won`) points arrive in step 3b.

create table beta_points (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gym text not null,
  gym_problem_id uuid references gym_problems(id) on delete set null,
  points integer not null,
  reason text not null check (reason in ('bounty_won', 'helpful', 'first_logger')),
  cycle_month text not null,          -- 'YYYY-MM' (UTC)
  created_at timestamptz not null default now()
);
alter table beta_points enable row level security;

create index beta_points_leaderboard_idx on beta_points (gym, cycle_month);

create policy "beta_points viewable by authenticated users"
  on beta_points for select
  using (auth.role() = 'authenticated');
-- No insert/update/delete policy: rows are written only by the SECURITY DEFINER
-- functions below.

-- ── first_logger: award the creator when a new shared boulder is created ─────
-- Reproduces migration 044's create_gym_problem and ADDS the beta_points insert.
create or replace function public.create_gym_problem(
  p_gym        text,
  p_color      text,
  p_wall_angle text,
  p_name       text,
  p_image_url  text
)
returns gym_problems as $$
declare
  v_user_id uuid := auth.uid();
  v_row     gym_problems;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if p_gym is null or length(trim(p_gym)) = 0 then
    raise exception 'gym is required';
  end if;

  insert into public.gym_problems (gym, color, wall_angle, name, image_url, created_by)
  values (trim(p_gym), p_color, p_wall_angle, p_name, p_image_url, v_user_id)
  returning * into v_row;

  -- NEW (step 3a): first_logger points to the creator.
  insert into public.beta_points (user_id, gym, gym_problem_id, points, reason, cycle_month)
  values (v_user_id, v_row.gym, v_row.id, 10, 'first_logger',
          to_char((now() at time zone 'utc'), 'YYYY-MM'));

  return v_row;
end;
$$ language plpgsql security definer;

-- ── helpful: award the helper when their response is marked helpful ──────────
-- Reproduces migration 039's award_helpful_response (notification + badge tiers)
-- and ADDS the beta_points insert for the helper.
create or replace function public.award_helpful_response()
returns trigger as $$
declare
  v_asker   uuid;
  v_count   integer;
  v_tier    record;
  v_gym     text;
  v_gpid    uuid;
begin
  if new.helpful = true and (old.helpful is distinct from true) then
    select user_id into v_asker from help_requests where id = new.request_id;

    perform public.create_notification(
      new.user_id, v_asker, 'help_marked_helpful', new.request_id, '{}'::jsonb
    );

    select count(*) into v_count
      from help_responses
     where user_id = new.user_id and helpful = true;

    for v_tier in
      select * from (values
        ('spotter', 1), ('beta_sprayer', 5), ('crux_crusher', 25), ('beta_legend', 100)
      ) as t(badge, threshold)
    loop
      if v_count >= v_tier.threshold
         and not exists (
           select 1 from user_badges b
           where b.user_id = new.user_id and b.badge = v_tier.badge
         ) then
        insert into user_badges (user_id, badge)
          values (new.user_id, v_tier.badge)
          on conflict do nothing;
        perform public.create_notification(
          new.user_id, v_asker, 'badge_earned', null,
          jsonb_build_object('badge', v_tier.badge)
        );
      end if;
    end loop;

    -- NEW (step 3a): helpful points to the helper, scoped to the asker's gym.
    select p.gym, p.gym_problem_id into v_gym, v_gpid
      from help_requests r
      join problems p on p.id = r.problem_id
     where r.id = new.request_id;

    if v_gym is not null then
      insert into public.beta_points (user_id, gym, gym_problem_id, points, reason, cycle_month)
      values (new.user_id, v_gym, v_gpid, 5, 'helpful',
              to_char((now() at time zone 'utc'), 'YYYY-MM'));
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;
```

- [ ] **Step 2: Self-review the SQL**

Confirm: `beta_points` columns match the spec data model; the select policy is `auth.role() = 'authenticated'` with NO insert policy; both functions remain `security definer`; `create_gym_problem` is otherwise byte-for-byte the migration-044 version plus the one insert; `award_helpful_response` preserves the notification + the four badge tiers exactly and only adds the gym lookup + guarded insert. Confirm the `helpful` insert is guarded by `if v_gym is not null`.

- [ ] **Step 3: Apply via the Supabase SQL editor and verify**

Apply `046_beta_points.sql` in the dashboard. Then:

```sql
select column_name, data_type, is_nullable from information_schema.columns
 where table_name = 'beta_points' order by ordinal_position;
select proname from pg_proc where proname in ('create_gym_problem', 'award_helpful_response');
```
Expected: 8 `beta_points` columns; both function names listed.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/046_beta_points.sql
git commit -m "feat: beta_points ledger + first_logger/helpful awards (migration 046)"
```

---

### Task 2: Leaderboard types + pure helpers (TDD)

**Files:**
- Modify: `src/types/index.ts` (append)
- Create: `src/utils/leaderboard.ts`
- Test: `src/utils/__tests__/leaderboard.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (relied on by Tasks 3–4):
  - `type BetaPointReason = 'bounty_won' | 'helpful' | 'first_logger'`
  - `interface BetaPointRow { user_id: string; points: number }`
  - `interface LeaderboardEntry { user_id: string; username: string | null; avatar_url: string | null; points: number; rank: number }`
  - `cycleMonth(date: Date): string` — UTC `YYYY-MM`.
  - `buildLeaderboard(rows: BetaPointRow[], profiles: { id: string; username: string | null; avatar_url: string | null }[]): LeaderboardEntry[]` — sum points per user, sort by points descending (tie-break by username ascending, nulls last), assign competition ranks (ties share a rank, the next rank skips: 1, 2, 2, 4), join profile fields (missing profile → null username/avatar).

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/leaderboard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { cycleMonth, buildLeaderboard } from '../leaderboard'

describe('cycleMonth', () => {
  it('formats a date as UTC YYYY-MM', () => {
    expect(cycleMonth(new Date('2026-06-20T10:00:00Z'))).toBe('2026-06')
    expect(cycleMonth(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01')
  })
})

describe('buildLeaderboard', () => {
  const profiles = [
    { id: 'a', username: 'Ann', avatar_url: 'ax' },
    { id: 'b', username: 'Bo', avatar_url: null },
    { id: 'c', username: 'Cy', avatar_url: null },
  ]

  it('sums points per user, sorts descending, joins profiles', () => {
    const board = buildLeaderboard(
      [
        { user_id: 'a', points: 10 },
        { user_id: 'a', points: 5 },
        { user_id: 'b', points: 30 },
      ],
      profiles,
    )
    expect(board).toEqual([
      { user_id: 'b', username: 'Bo', avatar_url: null, points: 30, rank: 1 },
      { user_id: 'a', username: 'Ann', avatar_url: 'ax', points: 15, rank: 2 },
    ])
  })

  it('assigns competition ranks (ties share, next skips)', () => {
    const board = buildLeaderboard(
      [
        { user_id: 'a', points: 20 },
        { user_id: 'b', points: 20 },
        { user_id: 'c', points: 5 },
      ],
      profiles,
    )
    expect(board.map(e => [e.user_id, e.rank])).toEqual([
      ['a', 1], ['b', 1], ['c', 3],
    ])
  })

  it('handles a three-way tie (all share rank 1)', () => {
    const board = buildLeaderboard(
      [
        { user_id: 'a', points: 9 },
        { user_id: 'b', points: 9 },
        { user_id: 'c', points: 9 },
      ],
      profiles,
    )
    expect(board.map(e => e.rank)).toEqual([1, 1, 1])
  })

  it('returns null profile fields when a user has no profile', () => {
    const board = buildLeaderboard([{ user_id: 'z', points: 7 }], profiles)
    expect(board).toEqual([{ user_id: 'z', username: null, avatar_url: null, points: 7, rank: 1 }])
  })

  it('returns empty for no rows', () => {
    expect(buildLeaderboard([], profiles)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/leaderboard.test.ts`
Expected: FAIL — cannot resolve module `../leaderboard`.

- [ ] **Step 3: Write the helpers**

Create `src/utils/leaderboard.ts`:

```ts
import type { BetaPointRow, LeaderboardEntry } from '../types'

export function cycleMonth(date: Date): string {
  return date.toISOString().slice(0, 7)
}

export function buildLeaderboard(
  rows: BetaPointRow[],
  profiles: { id: string; username: string | null; avatar_url: string | null }[],
): LeaderboardEntry[] {
  const profileById = new Map(profiles.map(p => [p.id, p]))

  const totals = new Map<string, number>()
  for (const r of rows) {
    totals.set(r.user_id, (totals.get(r.user_id) ?? 0) + r.points)
  }

  const sorted = Array.from(totals.entries())
    .map(([user_id, points]) => ({
      user_id,
      points,
      username: profileById.get(user_id)?.username ?? null,
      avatar_url: profileById.get(user_id)?.avatar_url ?? null,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      const an = a.username ?? '￿'
      const bn = b.username ?? '￿'
      return an < bn ? -1 : an > bn ? 1 : 0
    })

  // Competition ranking: equal points share a rank; the next distinct score
  // skips (1, 2, 2, 4). Single pass so 3+-way ties resolve correctly.
  let lastPoints: number | null = null
  let lastRank = 0
  return sorted.map((e, i) => {
    const rank = lastPoints !== null && e.points === lastPoints ? lastRank : i + 1
    lastPoints = e.points
    lastRank = rank
    return { ...e, rank }
  })
}
```

- [ ] **Step 4: Add the types**

Append to `src/types/index.ts`:

```ts
export type BetaPointReason = 'bounty_won' | 'helpful' | 'first_logger'

export interface BetaPointRow {
  user_id: string
  points: number
}

export interface LeaderboardEntry {
  user_id: string
  username: string | null
  avatar_url: string | null
  points: number
  rank: number
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/leaderboard.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/utils/leaderboard.ts src/utils/__tests__/leaderboard.test.ts
git commit -m "feat: add leaderboard aggregation/ranking helpers and types"
```

---

### Task 3: `useGymLeaderboard` hook

**Files:**
- Create: `src/hooks/useLeaderboard.ts`

**Interfaces:**
- Consumes: `supabase`, `buildLeaderboard` from `src/utils/leaderboard`, `BetaPointRow`/`LeaderboardEntry` types.
- Produces (relied on by Task 4): `useGymLeaderboard(gym: string, cycleMonth: string)` → query returning `LeaderboardEntry[]`.

- [ ] **Step 1: Write the hook**

Create `src/hooks/useLeaderboard.ts`. Two-step fetch (points rows, then profiles by id) — the codebase pattern (see `src/hooks/useCrew.ts`).

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { buildLeaderboard } from '../utils/leaderboard'
import type { BetaPointRow, LeaderboardEntry } from '../types'

export function useGymLeaderboard(gym: string, cycleMonth: string) {
  return useQuery({
    queryKey: ['leaderboard', gym, cycleMonth],
    queryFn: async (): Promise<LeaderboardEntry[]> => {
      const { data: pts, error } = await supabase
        .from('beta_points')
        .select('user_id, points')
        .eq('gym', gym)
        .eq('cycle_month', cycleMonth)
      if (error) throw error
      const rows = (pts ?? []) as BetaPointRow[]

      const userIds = Array.from(new Set(rows.map(r => r.user_id)))
      let profiles: { id: string; username: string | null; avatar_url: string | null }[] = []
      if (userIds.length > 0) {
        const { data: profs, error: pErr } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', userIds)
        if (pErr) throw pErr
        profiles = (profs ?? []) as { id: string; username: string | null; avatar_url: string | null }[]
      }

      return buildLeaderboard(rows, profiles)
    },
    enabled: !!gym && !!cycleMonth,
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: no errors. (Hooks are not unit-tested in this repo — the type checker is the gate.)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useLeaderboard.ts
git commit -m "feat: add useGymLeaderboard hook"
```

---

### Task 4: Leaderboard section on the Crew page

**Files:**
- Modify: `src/pages/CrewPage.tsx`

**Interfaces:**
- Consumes: `useGymLeaderboard`, `cycleMonth` from `src/utils/leaderboard`, `useAuth` from `src/providers/AuthProvider`, `lucide-react` (`Trophy`).
- Produces: nothing.

**Design:** Below the existing crew list, add a leaderboard section for `boulder.gym` and the current cycle. Show the top 5 entries with rank, username, and points; highlight the signed-in user's row. Render nothing if `boulder.gym` is falsy or the leaderboard is empty.

- [ ] **Step 1: Add the imports**

In `src/pages/CrewPage.tsx`, extend the imports:

```tsx
import { Users, ArrowLeft, Trophy } from 'lucide-react'
import { useGymProblem, useCrew } from '../hooks/useCrew'
import { useGymLeaderboard } from '../hooks/useLeaderboard'
import { daysUntil } from '../utils/gymProblems'
import { cycleMonth } from '../utils/leaderboard'
import { useAuth } from '../providers/AuthProvider'
```

(Adjust the existing `lucide-react` and `useCrew`/`daysUntil` import lines to match — add `Trophy`, the leaderboard hook, the `cycleMonth` util, and `useAuth`.)

- [ ] **Step 2: Call the hook and compute the cycle**

Inside the `CrewPage` component, after the existing `useGymProblem`/`useCrew` calls (and before any early return — hooks must not be conditional), add:

```tsx
  const { user } = useAuth()
  const month = cycleMonth(new Date())
  const { data: leaderboard = [] } = useGymLeaderboard(boulder?.gym ?? '', month)
```

Note: `boulder` may be undefined on the first render; `boulder?.gym ?? ''` keeps the hook's `enabled` guard false until it loads. This line must sit with the other hook calls, above the `if (loadingBoulder ...)` / `if (!boulder)` early returns.

- [ ] **Step 3: Render the leaderboard section**

Inside the main content `<div className="px-5 mt-4 space-y-4">`, after the crew list block (the `<div className="space-y-2">...members...</div>`), add:

```tsx
        {boulder.gym && leaderboard.length > 0 && (
          <div className="pt-2">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-800 mb-2">
              <Trophy size={15} strokeWidth={2} className="text-amber-500" />
              {new Date(`${month}-01T00:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} leaderboard
              <span className="font-normal text-gray-400">· {boulder.gym}</span>
            </h2>
            <div className="space-y-1">
              {leaderboard.slice(0, 5).map(entry => (
                <div
                  key={entry.user_id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm ${
                    entry.user_id === user?.id ? 'bg-sage-50 border border-sage-200' : 'bg-gray-50'
                  }`}
                >
                  <span className="w-5 text-center font-bold text-gray-400">{entry.rank}</span>
                  <span className="flex-1 font-medium text-gray-800 truncate">{entry.username ?? 'Someone'}</span>
                  <span className="font-semibold text-sage-700">{entry.points}</span>
                </div>
              ))}
            </div>
          </div>
        )}
```

- [ ] **Step 4: Typecheck, lint, and build**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: no type errors, no new lint errors, build succeeds (a pre-existing vite chunk-size warning is fine).

- [ ] **Step 5: Manual verification**

With migrations 044/045/046 applied, run `npm run dev`. Create a new shared boulder (earns the creator 10 first_logger points) and open its Crew page → the leaderboard section shows that user with 10 points, rank 1, for the current month. Marking a beta response helpful on a gym problem adds 5 points to the helper and they appear/climb.

- [ ] **Step 6: Commit**

```bash
git add src/pages/CrewPage.tsx
git commit -m "feat: monthly per-gym leaderboard section on the Crew page"
```

---

## Self-Review

**Spec coverage (step 3a scope):**
- `beta_points` ledger table (per spec data model) → Task 1 ✓
- `first_logger` points on boulder creation → Task 1 (extends `create_gym_problem`) ✓
- `helpful` points on helpful marks → Task 1 (extends `award_helpful_response`) ✓
- Monthly per-gym leaderboard (`SUM(points) … WHERE gym, cycle_month … ORDER BY DESC`) → Task 2 helper + Task 3 hook + Task 4 UI ✓
- Points cannot be self-minted (insert only via SECURITY DEFINER) → Task 1 RLS ✓
- `beta_points` readable by all (leaderboard) → Task 1 RLS ✓
- Cycle resets implicitly by `cycle_month` grouping → Task 2/3 (query filters current month) ✓
- DEFERRED to step 3b (documented in Global Constraints): monthly point budget, bounty staking, award-on-send (`bounty_won`), scoping help requests to gym_problems. The `bounty_won` reason is included in the check constraint for forward-compat but never written here. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"write tests for the above" — every code step contains complete content. ✓

**Type consistency:** `BetaPointReason`/`BetaPointRow`/`LeaderboardEntry` defined in Task 2 are imported unchanged in Tasks 2–4. `cycleMonth`/`buildLeaderboard` signatures match across Tasks 2–4. `useGymLeaderboard(gym, cycleMonth)` name and return type match between Task 3 (definition) and Task 4 (use). The SQL `cycle_month` literal format (`to_char(... 'YYYY-MM')`) matches the client's `date.toISOString().slice(0,7)` used by `cycleMonth`. ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-20-gym-problems-step3a-points-leaderboard.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
