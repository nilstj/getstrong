# Gym Problems — Step 1 (Shared Boulder Identity + Claim/Create + Matching) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the crowd-created shared-boulder entity (`gym_problems`), let a personal problem log claim onto a shared boulder or create a new one, and surface matching boulders per problem — build-order step 1 of the Crew Projects & Beta Bounties spec.

**Architecture:** All changes are additive — the per-user `problems` model is untouched except for a new nullable `gym_problem_id` foreign key. A new `gym_problems` table holds the shared identity. Inserts and claims route through `SECURITY DEFINER` RPCs (the pattern migration 042 established to dodge the `auth.uid()` RLS-evaluation bug). The UI mirrors the existing `CallForHelp` component: a per-problem-card `GymProblemMatcher` that, for indoor problems with a gym + color, shows matching active boulders to join, or a "create new" path — claim/create happens *after* logging, not inside the form.

**Tech Stack:** React 18 + TypeScript, Vite, `@tanstack/react-query`, Supabase (Postgres + RLS), Tailwind, `react-hook-form`, `react-hot-toast`, `lucide-react`, Vitest (jsdom).

## Global Constraints

- **Additive only.** Do not alter existing `problems` columns or existing RLS policies. The only schema change to `problems` is adding nullable `gym_problem_id`.
- **Inserts via SECURITY DEFINER RPC.** Per migration 042, `auth.uid()` does not evaluate reliably inside `WITH CHECK` policies here. Route `gym_problems` inserts and problem-claim updates through `security definer` PL/pgSQL functions that capture `auth.uid()` in execution context. Never expose a raw client-side insert into `gym_problems`.
- **Matching key is `gym` + `color` (case-insensitive), within `status = 'active'`.** `wall_angle` is descriptive free text set only when *creating* a new boulder; it is not a match key. (Decision: personal logs lack a gym-wall angle; photo confirmation makes gym+color sufficient.)
- **Migration files are numbered SQL applied manually via the Supabase SQL editor** — there is no Supabase CLI or local DB in this repo. A migration "passes" when it applies cleanly and the provided verification query returns the expected shape. There is no automated SQL test harness; do not invent one.
- **Tests exist only for pure utilities** (`src/utils/__tests__/*.test.ts`, Vitest). Hooks and components are not unit-tested in this repo — verify them with `npx tsc -b` + `npm run build` + `npm run lint`. Apply TDD only to the pure helpers in Task 2.
- **Naming/style:** follow existing conventions — React Query keys as arrays (e.g. `['gym_problems', ...]`), hooks named `useX`, `sage-700` as the primary accent color, `lucide-react` icons, `react-hot-toast` for feedback.
- **Out of scope for step 1** (do NOT build): `gym_problem_members`/Crew membership, the Crew page/route, notifications, `beta_points`/bounties/leaderboard, lifecycle cron/archival. Joining here means setting `problems.gym_problem_id` only.
- **Do not touch `shared_projects`/`project_attempts`.** That is a separate, pre-existing feature; `gym_problems` is intentionally new.

---

### Task 1: Migration 044 — `gym_problems` table, `problems.gym_problem_id`, RLS, and RPCs

**Files:**
- Create: `supabase/migrations/044_gym_problems.sql`

**Interfaces:**
- Consumes: existing `problems` table, `auth.users`, the migration-042 RPC pattern.
- Produces (relied on by Tasks 3–4):
  - Table `gym_problems(id uuid, gym text, wall_angle text, color text, community_grade text, name text, image_url text, created_by uuid, set_at date, expires_at date, status text, created_at timestamptz)`.
  - Column `problems.gym_problem_id uuid` (nullable, `on delete set null`).
  - RPC `create_gym_problem(p_gym text, p_color text, p_wall_angle text, p_name text, p_image_url text) returns gym_problems` — inserts with `created_by = auth.uid()`, `set_at = current_date`, `expires_at = current_date + 30`, `status = 'active'`.
  - RPC `claim_gym_problem(p_problem_id uuid, p_gym_problem_id uuid) returns void` — sets `problems.gym_problem_id`, only when the caller owns the problem.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/044_gym_problems.sql`:

```sql
-- Crew Projects step 1: the shared, crowd-created boulder identity the schema
-- lacks. A personal `problems` row can optionally *claim* onto one of these.
-- All changes are additive. Inserts/claims route through SECURITY DEFINER
-- functions (see migration 042) because auth.uid() does not evaluate reliably
-- inside RLS WITH CHECK here.

create table gym_problems (
  id uuid primary key default gen_random_uuid(),
  gym text not null,
  wall_angle text,                       -- descriptive free text, e.g. "overhang"
  color text,
  community_grade text,                  -- crowd consensus; null until enough data
  name text,                             -- first logger names it
  image_url text,                        -- canonical photo from first logger
  created_by uuid references auth.users(id) on delete set null,
  set_at date not null default current_date,
  expires_at date not null default (current_date + 30),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);
alter table gym_problems enable row level security;

-- Discovery queries filter on gym + active status.
create index gym_problems_gym_active_idx
  on gym_problems (gym) where status = 'active';

-- Link a personal problem to a shared boulder. null = not claimed (current behavior).
alter table problems
  add column gym_problem_id uuid references gym_problems(id) on delete set null;
create index problems_gym_problem_idx on problems (gym_problem_id);

-- Any authenticated user may read shared boulders (they are public by nature).
create policy "gym_problems viewable by authenticated users"
  on gym_problems for select
  using (auth.role() = 'authenticated');
-- No direct insert/update policy: writes go through the RPCs below only.

-- Create a new shared boulder. Caller becomes created_by.
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

  return v_row;
end;
$$ language plpgsql security definer;

-- Claim (or unclaim, with null) a personal problem onto a shared boulder.
-- Only the problem's owner may do this.
create or replace function public.claim_gym_problem(
  p_problem_id     uuid,
  p_gym_problem_id uuid
)
returns void as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.problems
     set gym_problem_id = p_gym_problem_id
   where id = p_problem_id
     and user_id = v_user_id;

  if not found then
    raise exception 'Problem not found or not owned by caller';
  end if;
end;
$$ language plpgsql security definer;
```

- [ ] **Step 2: Self-review the SQL**

Read the file back. Confirm: table columns match the spec's data-model table; `gym_problem_id` is nullable with `on delete set null`; both functions are `security definer`; the select policy uses `auth.role() = 'authenticated'` (matches the `user_badges` policy in migration 039). There is no automated SQL test — review is the gate here.

- [ ] **Step 3: Apply via the Supabase SQL editor and verify**

Apply `044_gym_problems.sql` in the Supabase dashboard SQL editor (same manual process as prior migrations). Then run this verification query and confirm it returns rows describing the new columns:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'gym_problems'
order by ordinal_position;

select column_name from information_schema.columns
where table_name = 'problems' and column_name = 'gym_problem_id';

select proname from pg_proc
where proname in ('create_gym_problem', 'claim_gym_problem');
```
Expected: 12 `gym_problems` columns; one `problems.gym_problem_id` row; both function names listed.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/044_gym_problems.sql
git commit -m "feat: add gym_problems shared-boulder entity + claim/create RPCs (migration 044)"
```

---

### Task 2: `GymProblem` type + pure matching/lifecycle helpers (TDD)

**Files:**
- Modify: `src/types/index.ts` (append new interfaces)
- Create: `src/utils/gymProblems.ts`
- Test: `src/utils/__tests__/gymProblems.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (relied on by Tasks 3–4):
  - `interface GymProblem` matching the table columns.
  - `interface GymProblemMatchCriteria { gym: string | null; color: string | null }`.
  - `gymProblemMatches(gp: Pick<GymProblem,'gym'|'color'|'status'>, c: GymProblemMatchCriteria): boolean` — true iff active, same gym (trimmed, case-insensitive), same non-empty color (trimmed, case-insensitive).
  - `daysUntil(dateStr: string, now: Date): number` — whole days from `now` to `dateStr` (date-only), floored, may be negative.

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/gymProblems.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { gymProblemMatches, daysUntil } from '../gymProblems'

const base = { gym: 'Boulders Oslo', color: 'Blue', status: 'active' as const }

describe('gymProblemMatches', () => {
  it('matches same gym and color, case- and space-insensitive', () => {
    expect(gymProblemMatches(base, { gym: '  boulders oslo ', color: 'BLUE' })).toBe(true)
  })
  it('does not match a different color', () => {
    expect(gymProblemMatches(base, { gym: 'Boulders Oslo', color: 'Red' })).toBe(false)
  })
  it('does not match a different gym', () => {
    expect(gymProblemMatches(base, { gym: 'Klatreverket', color: 'Blue' })).toBe(false)
  })
  it('does not match archived boulders', () => {
    expect(gymProblemMatches({ ...base, status: 'archived' }, { gym: 'Boulders Oslo', color: 'Blue' })).toBe(false)
  })
  it('does not match when criteria gym or color is null/empty', () => {
    expect(gymProblemMatches(base, { gym: null, color: 'Blue' })).toBe(false)
    expect(gymProblemMatches(base, { gym: 'Boulders Oslo', color: '' })).toBe(false)
  })
})

describe('daysUntil', () => {
  it('counts whole days until a future date', () => {
    expect(daysUntil('2026-06-28', new Date('2026-06-19T10:00:00Z'))).toBe(9)
  })
  it('is zero on the expiry day', () => {
    expect(daysUntil('2026-06-19', new Date('2026-06-19T23:00:00Z'))).toBe(0)
  })
  it('is negative after expiry', () => {
    expect(daysUntil('2026-06-18', new Date('2026-06-19T10:00:00Z'))).toBe(-1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/gymProblems.test.ts`
Expected: FAIL — cannot resolve module `../gymProblems`.

- [ ] **Step 3: Write the helpers**

Create `src/utils/gymProblems.ts`:

```ts
import type { GymProblem, GymProblemMatchCriteria } from '../types'

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

export function gymProblemMatches(
  gp: Pick<GymProblem, 'gym' | 'color' | 'status'>,
  c: GymProblemMatchCriteria,
): boolean {
  if (gp.status !== 'active') return false
  if (!norm(c.gym) || !norm(c.color)) return false
  return norm(gp.gym) === norm(c.gym) && norm(gp.color) === norm(c.color)
}

// Whole days from `now` to the date-only `dateStr` (e.g. expires_at). Floored.
export function daysUntil(dateStr: string, now: Date): number {
  const target = new Date(`${dateStr}T00:00:00Z`).getTime()
  const today = new Date(
    `${now.toISOString().slice(0, 10)}T00:00:00Z`,
  ).getTime()
  return Math.round((target - today) / 86_400_000)
}
```

- [ ] **Step 4: Add the types**

Append to `src/types/index.ts`:

```ts
export interface GymProblem {
  id: string
  gym: string
  wall_angle: string | null
  color: string | null
  community_grade: string | null
  name: string | null
  image_url: string | null
  created_by: string | null
  set_at: string
  expires_at: string
  status: 'active' | 'archived'
  created_at: string
}

export interface GymProblemMatchCriteria {
  gym: string | null
  color: string | null
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/gymProblems.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/utils/gymProblems.ts src/utils/__tests__/gymProblems.test.ts
git commit -m "feat: add GymProblem type and pure matching/lifecycle helpers"
```

---

### Task 3: `useGymProblems` data hook

**Files:**
- Create: `src/hooks/useGymProblems.ts`

**Interfaces:**
- Consumes: `supabase` client, `useAuth`, `GymProblem`/`GymProblemMatchCriteria` types, the RPCs from Task 1.
- Produces (relied on by Task 4):
  - `useMatchingGymProblems(criteria: GymProblemMatchCriteria)` — query of active boulders in the gym; returns `GymProblem[]`, filtered to matches; `enabled` only when gym & color are non-empty.
  - `useCreateGymProblem()` — mutation taking `{ gym, color, wall_angle, name, image_url }`, calls `create_gym_problem` RPC, returns the new `GymProblem`.
  - `useClaimGymProblem()` — mutation taking `{ problemId, gymProblemId }` (gymProblemId may be `null` to unclaim), calls `claim_gym_problem` RPC.

- [ ] **Step 1: Write the hook**

Create `src/hooks/useGymProblems.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { gymProblemMatches } from '../utils/gymProblems'
import type { GymProblem, GymProblemMatchCriteria } from '../types'

// Active shared boulders in the same gym that match the given color.
export function useMatchingGymProblems(criteria: GymProblemMatchCriteria) {
  const gym = criteria.gym?.trim() ?? ''
  const color = criteria.color?.trim() ?? ''
  return useQuery({
    queryKey: ['gym_problems', 'match', gym.toLowerCase(), color.toLowerCase()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gym_problems')
        .select('*')
        .eq('status', 'active')
        .ilike('gym', gym)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data as GymProblem[]).filter(gp => gymProblemMatches(gp, criteria))
    },
    enabled: gym.length > 0 && color.length > 0,
  })
}

export function useCreateGymProblem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: {
      gym: string
      color: string | null
      wall_angle: string | null
      name: string | null
      image_url: string | null
    }) => {
      const { data, error } = await supabase.rpc('create_gym_problem', {
        p_gym: values.gym,
        p_color: values.color,
        p_wall_angle: values.wall_angle,
        p_name: values.name,
        p_image_url: values.image_url,
      })
      if (error) throw error
      return data as GymProblem
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym_problems'] })
    },
  })
}

export function useClaimGymProblem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      problemId,
      gymProblemId,
    }: {
      problemId: string
      gymProblemId: string | null
    }) => {
      const { error } = await supabase.rpc('claim_gym_problem', {
        p_problem_id: problemId,
        p_gym_problem_id: gymProblemId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['problems'] })
      queryClient.invalidateQueries({ queryKey: ['gym_problems'] })
    },
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: no errors. (Hooks are not unit-tested in this repo — the type checker is the gate.)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useGymProblems.ts
git commit -m "feat: add useGymProblems hook (match/create/claim)"
```

---

### Task 4: `GymProblemMatcher` component + wire into the problem card

**Files:**
- Create: `src/components/GymProblemMatcher.tsx`
- Modify: `src/pages/SessionDetailPage.tsx` (render it next to `CallForHelp`)

**Interfaces:**
- Consumes: `useMatchingGymProblems`, `useCreateGymProblem`, `useClaimGymProblem`, `daysUntil`, `BottomSheet`, the `Problem` type, `react-hot-toast`.
- Produces: a self-contained per-problem UI. No outputs other tasks depend on.

**Design:** Mirror `CallForHelp` — a small trigger row under the problem, opening a `BottomSheet`. Only render for indoor problems that have both `gym` and `color` (the match key) and are not already claimed. If `problem.gym_problem_id` is set, show a claimed indicator instead.

- [ ] **Step 1: Write the component**

Create `src/components/GymProblemMatcher.tsx`:

```tsx
import { useState } from 'react'
import { Users, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { BottomSheet } from './BottomSheet'
import {
  useMatchingGymProblems,
  useCreateGymProblem,
  useClaimGymProblem,
} from '../hooks/useGymProblems'
import { daysUntil } from '../utils/gymProblems'
import type { Problem } from '../types'

export function GymProblemMatcher({ problem }: { problem: Problem }) {
  const [open, setOpen] = useState(false)
  const criteria = { gym: problem.gym, color: problem.color }
  const { data: matches = [], isLoading } = useMatchingGymProblems(criteria)
  const create = useCreateGymProblem()
  const claim = useClaimGymProblem()

  // Match key is gym + color (indoor). Skip until both are present.
  if (!problem.gym || !problem.color) return null

  // Already claimed onto a shared boulder.
  if (problem.gym_problem_id) {
    return (
      <span className="inline-flex items-center gap-1 mt-1.5 text-xs text-sage-700 font-medium">
        <Users size={13} strokeWidth={2} /> On a shared boulder
      </span>
    )
  }

  const join = (gymProblemId: string) => {
    claim.mutate(
      { problemId: problem.id, gymProblemId },
      {
        onSuccess: () => {
          toast.success('Joined the boulder')
          setOpen(false)
        },
        onError: () => toast.error('Could not join'),
      },
    )
  }

  const createNew = () => {
    create.mutate(
      {
        gym: problem.gym!,
        color: problem.color,
        wall_angle: null,
        name: problem.name,
        image_url: problem.image_url,
      },
      {
        onSuccess: gp => join(gp.id),
        onError: () => toast.error('Could not create boulder'),
      },
    )
  }

  const now = new Date()

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 mt-1.5 text-xs text-gray-600 font-medium hover:text-sage-700"
      >
        <Users size={13} strokeWidth={2} /> Find this boulder&apos;s crew
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Find this boulder">
        <p className="text-sm text-gray-500 mb-4">
          {problem.color} at {problem.gym}. Is it one of these?
        </p>

        {isLoading ? (
          <p className="text-sm text-gray-400">Searching…</p>
        ) : (
          <div className="space-y-2">
            {matches.map(gp => {
              const left = daysUntil(gp.expires_at, now)
              return (
                <button
                  key={gp.id}
                  onClick={() => join(gp.id)}
                  disabled={claim.isPending}
                  className="w-full flex items-center gap-3 p-3 border rounded-xl text-left hover:bg-gray-50 disabled:opacity-50"
                >
                  {gp.image_url && (
                    <img src={gp.image_url} alt="" className="w-12 h-12 object-cover rounded-lg" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {gp.name || `${gp.color ?? ''} ${gp.wall_angle ?? ''}`.trim() || 'Shared boulder'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {left >= 0 ? `${left} days left` : 'expired'}
                    </p>
                  </div>
                </button>
              )
            })}
            {matches.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-2">
                No matching boulder yet. Be the first to log it.
              </p>
            )}

            <button
              onClick={createNew}
              disabled={create.isPending || claim.isPending}
              className="w-full flex items-center justify-center gap-2 p-3 mt-2 border border-dashed border-sage-300 rounded-xl text-sm font-medium text-sage-700 hover:bg-sage-50 disabled:opacity-50"
            >
              <Plus size={15} strokeWidth={2.2} /> No, it&apos;s new — create it
            </button>
          </div>
        )}
      </BottomSheet>
    </>
  )
}
```

- [ ] **Step 2: Wire it into the problem card**

In `src/pages/SessionDetailPage.tsx`, find where `<CallForHelp` is rendered for a problem (search `CallForHelp`). Add the import near the other component imports:

```tsx
import { GymProblemMatcher } from '../components/GymProblemMatcher'
```

and render the matcher immediately after the `CallForHelp` usage, passing the same problem object that card already has in scope (the variable used for `<CallForHelp problem={...} />` — reuse that exact expression):

```tsx
<CallForHelp problem={problem} />
<GymProblemMatcher problem={problem} />
```

If the problem variable in that scope is named differently (e.g. `p`), use that name — match the surrounding `CallForHelp` line exactly.

- [ ] **Step 3: Typecheck, lint, and build**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: no type errors, no new lint errors, build succeeds.

- [ ] **Step 4: Manual verification**

With migration 044 applied, run `npm run dev`. On a session detail page, for an indoor problem that has a gym and a color:
- A "Find this boulder's crew" link appears under the card.
- Tapping it opens the sheet; with no existing boulder, "create it" creates one, claims the problem, and the card flips to "On a shared boulder".
- Logging a second problem with the same gym + color shows the first as a match to join.

- [ ] **Step 5: Commit**

```bash
git add src/components/GymProblemMatcher.tsx src/pages/SessionDetailPage.tsx
git commit -m "feat: GymProblemMatcher — claim/create a shared boulder per problem"
```

---

## Self-Review

**Spec coverage (step 1 scope):**
- `gym_problems` table, crowd-created → Task 1 ✓
- `problems.gym_problem_id` nullable FK → Task 1 ✓
- Claim flow (set `gym_problem_id`) → Task 1 RPC + Task 3 `useClaimGymProblem` + Task 4 join ✓
- Create-new flow (first logger, photo carried over) → Task 1 RPC + Task 3 `useCreateGymProblem` + Task 4 `createNew` ✓
- Matching suggestions ("is this the one?") → Task 2 `gymProblemMatches` + Task 3 `useMatchingGymProblems` + Task 4 sheet ✓
- SECURITY DEFINER RPC pattern (migration 042) → Task 1 ✓
- `set_at`/`expires_at = set_at + 30`/`status` defaults → Task 1 ✓
- `wall_angle` as text reusing existing vocabulary → relaxed to free text per confirmed decision; documented in Global Constraints ✓
- Deferred to later steps and explicitly out of scope: `gym_problem_members`/Crew page/notifications (step 2), `beta_points`/bounties/leaderboard (step 3), lifecycle cron (step 4). Noted in Global Constraints ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"write tests for the above" — every code step contains complete content. ✓

**Type consistency:** `GymProblem`/`GymProblemMatchCriteria` defined in Task 2 are imported unchanged in Tasks 2–4. RPC names `create_gym_problem`/`claim_gym_problem` and params (`p_gym`, `p_color`, `p_wall_angle`, `p_name`, `p_image_url`, `p_problem_id`, `p_gym_problem_id`) are identical in Task 1 SQL and Task 3 `.rpc()` calls. `gymProblemMatches`/`daysUntil` signatures match across Tasks 2–4. ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-19-gym-problems-step1.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
