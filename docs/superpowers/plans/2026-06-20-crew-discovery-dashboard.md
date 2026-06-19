# Crew Discovery — Dashboard Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Crew Projects feature a discoverable entry point — a Dashboard section listing the shared boulders you're on ("Your crews") plus other active boulders in your gyms ("In your gym"), each linking to its Crew page.

**Why:** Steps 1–3a shipped the shared-boulder, crew, and leaderboard features but left them reachable only via a contextual link on session-detail problem cards (and only when a problem has a color). There is no browse view of `gym_problems` at all, so the feature is effectively invisible. This adds the missing discovery surface. No schema change — all reads on existing, publicly-readable tables (`problems`, `gym_problems`).

**Architecture:** A new `useDiscoverBoulders` hook derives the lists from `problems` + `gym_problems`: your gyms and claimed boulder ids come from your own problems; candidate boulders are active `gym_problems` in those gyms (plus any you're claimed onto); crew counts come from a single `problems` read aggregated by a pure helper. A self-contained `CrewsSection` component renders the two groups and is dropped into the existing `DashboardPage`.

**Tech Stack:** React 18 + TypeScript, `@tanstack/react-query`, Supabase, Tailwind, `lucide-react`, `react-router-dom`, Vitest (jsdom).

## Global Constraints

- **No migration / no schema change.** Reads only, on existing tables.
- **Reuse:** `daysUntil` from `src/utils/gymProblems.ts` for "N days left"; the `GymProblem` type from `src/types`; `useAuth` from `src/providers/AuthProvider`.
- **"Your crews"** = active boulders you have a problem claimed onto (`problems.gym_problem_id`). **"In your gym"** = other active boulders whose `gym` matches a gym you've logged in, excluding ones you're already on; cap at 5, sorted by crew size descending.
- **Crew count** = distinct users with a problem on a boulder (matches the Crew page's notion of membership).
- **`boulderTitle`** is the single source of a boulder's display name: `name || (color + ' ' + wall_angle).trim() || 'Shared boulder'`.
- **Tests exist only for pure utilities** (`src/utils/__tests__/*.test.ts`, Vitest). Hooks/components verified via `npx tsc -b` + `npm run lint` + `npm run build`. Apply TDD only to the pure helpers in Task 1.
- **Naming/style:** React Query array keys, `useX` hooks, `sage-700` accent, `lucide-react` icons. Follow existing patterns; render nothing when both lists are empty (no empty-state clutter on the Dashboard).
- **Out of scope:** changing the bottom nav, a standalone boulders page, gym selection UI, any bounty/lifecycle work.

---

### Task 1: Boulder-discovery types + pure helpers (TDD)

**Files:**
- Modify: `src/types/index.ts` (append)
- Create: `src/utils/boulders.ts`
- Test: `src/utils/__tests__/boulders.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (relied on by Tasks 2–3):
  - `interface BoulderSummary { id: string; title: string; gym: string; color: string | null; expires_at: string; crewCount: number; claimed: boolean }`
  - `boulderTitle(gp: { name: string | null; color: string | null; wall_angle: string | null }): string`
  - `countMembersByBoulder(rows: { gym_problem_id: string | null; user_id: string }[]): Record<string, number>` — distinct user count per boulder id, ignoring null `gym_problem_id`.

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/boulders.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { boulderTitle, countMembersByBoulder } from '../boulders'

describe('boulderTitle', () => {
  it('prefers the name', () => {
    expect(boulderTitle({ name: 'The Prow', color: 'Blue', wall_angle: 'overhang' })).toBe('The Prow')
  })
  it('falls back to color + wall_angle', () => {
    expect(boulderTitle({ name: null, color: 'Blue', wall_angle: 'overhang' })).toBe('Blue overhang')
  })
  it('trims when only one of color/angle is present', () => {
    expect(boulderTitle({ name: null, color: 'Blue', wall_angle: null })).toBe('Blue')
  })
  it('falls back to a default when nothing is set', () => {
    expect(boulderTitle({ name: null, color: null, wall_angle: null })).toBe('Shared boulder')
  })
})

describe('countMembersByBoulder', () => {
  it('counts distinct users per boulder, ignoring null boulder ids', () => {
    const counts = countMembersByBoulder([
      { gym_problem_id: 'x', user_id: 'a' },
      { gym_problem_id: 'x', user_id: 'a' }, // same user, same boulder → still 1
      { gym_problem_id: 'x', user_id: 'b' },
      { gym_problem_id: 'y', user_id: 'a' },
      { gym_problem_id: null, user_id: 'c' }, // unclaimed → ignored
    ])
    expect(counts).toEqual({ x: 2, y: 1 })
  })
  it('returns empty for no rows', () => {
    expect(countMembersByBoulder([])).toEqual({})
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/boulders.test.ts`
Expected: FAIL — cannot resolve module `../boulders`.

- [ ] **Step 3: Write the helpers**

Create `src/utils/boulders.ts`:

```ts
export function boulderTitle(gp: { name: string | null; color: string | null; wall_angle: string | null }): string {
  return gp.name || `${gp.color ?? ''} ${gp.wall_angle ?? ''}`.trim() || 'Shared boulder'
}

export function countMembersByBoulder(
  rows: { gym_problem_id: string | null; user_id: string }[],
): Record<string, number> {
  const byBoulder = new Map<string, Set<string>>()
  for (const r of rows) {
    if (!r.gym_problem_id) continue
    let set = byBoulder.get(r.gym_problem_id)
    if (!set) {
      set = new Set()
      byBoulder.set(r.gym_problem_id, set)
    }
    set.add(r.user_id)
  }
  const out: Record<string, number> = {}
  for (const [id, set] of byBoulder) out[id] = set.size
  return out
}
```

- [ ] **Step 4: Add the type**

Append to `src/types/index.ts`:

```ts
export interface BoulderSummary {
  id: string
  title: string
  gym: string
  color: string | null
  expires_at: string
  crewCount: number
  claimed: boolean
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/boulders.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/utils/boulders.ts src/utils/__tests__/boulders.test.ts
git commit -m "feat: add boulder-discovery helpers and BoulderSummary type"
```

---

### Task 2: `useDiscoverBoulders` hook

**Files:**
- Create: `src/hooks/useDiscoverBoulders.ts`

**Interfaces:**
- Consumes: `supabase`, `useAuth`, `boulderTitle`/`countMembersByBoulder` from `src/utils/boulders`, `GymProblem`/`BoulderSummary` types.
- Produces (relied on by Task 3): `useDiscoverBoulders()` → query returning `{ yours: BoulderSummary[]; discover: BoulderSummary[] }`.

- [ ] **Step 1: Write the hook**

Create `src/hooks/useDiscoverBoulders.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import { boulderTitle, countMembersByBoulder } from '../utils/boulders'
import type { GymProblem, BoulderSummary } from '../types'

export function useDiscoverBoulders() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['discover_boulders', user?.id],
    queryFn: async (): Promise<{ yours: BoulderSummary[]; discover: BoulderSummary[] }> => {
      // 1. My gyms + the boulders I've already claimed onto.
      const { data: mine, error: e1 } = await supabase
        .from('problems')
        .select('gym, gym_problem_id')
        .eq('user_id', user!.id)
      if (e1) throw e1
      const myRows = (mine ?? []) as { gym: string | null; gym_problem_id: string | null }[]
      const myGyms = Array.from(new Set(myRows.map(r => r.gym).filter((g): g is string => !!g)))
      const myClaimedIds = new Set(
        myRows.map(r => r.gym_problem_id).filter((id): id is string => !!id),
      )
      if (myGyms.length === 0 && myClaimedIds.size === 0) return { yours: [], discover: [] }

      // 2. Candidate boulders: active ones in my gyms, plus any I'm claimed onto.
      const boulders = new Map<string, GymProblem>()
      if (myGyms.length > 0) {
        const { data, error } = await supabase
          .from('gym_problems').select('*').eq('status', 'active').in('gym', myGyms)
        if (error) throw error
        for (const b of (data ?? []) as GymProblem[]) boulders.set(b.id, b)
      }
      const claimedIds = Array.from(myClaimedIds)
      if (claimedIds.length > 0) {
        const { data, error } = await supabase
          .from('gym_problems').select('*').eq('status', 'active').in('id', claimedIds)
        if (error) throw error
        for (const b of (data ?? []) as GymProblem[]) boulders.set(b.id, b)
      }
      const list = Array.from(boulders.values())
      if (list.length === 0) return { yours: [], discover: [] }

      // 3. Crew counts (distinct users per boulder).
      const ids = list.map(b => b.id)
      const { data: probs, error: e3 } = await supabase
        .from('problems').select('gym_problem_id, user_id').in('gym_problem_id', ids)
      if (e3) throw e3
      const counts = countMembersByBoulder(
        (probs ?? []) as { gym_problem_id: string | null; user_id: string }[],
      )

      const summaries: BoulderSummary[] = list.map(b => ({
        id: b.id,
        title: boulderTitle(b),
        gym: b.gym,
        color: b.color,
        expires_at: b.expires_at,
        crewCount: counts[b.id] ?? 0,
        claimed: myClaimedIds.has(b.id),
      }))

      const yours = summaries
        .filter(s => s.claimed)
        .sort((a, b) => (a.expires_at < b.expires_at ? -1 : a.expires_at > b.expires_at ? 1 : 0))
      const discover = summaries
        .filter(s => !s.claimed)
        .sort((a, b) => b.crewCount - a.crewCount)
        .slice(0, 5)

      return { yours, discover }
    },
    enabled: !!user,
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: no errors. (Hooks are not unit-tested in this repo — the type checker is the gate.)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDiscoverBoulders.ts
git commit -m "feat: add useDiscoverBoulders hook"
```

---

### Task 3: `CrewsSection` component + wire into the Dashboard

**Files:**
- Create: `src/components/CrewsSection.tsx`
- Modify: `src/pages/DashboardPage.tsx`

**Interfaces:**
- Consumes: `useDiscoverBoulders`, `daysUntil` from `src/utils/gymProblems`, `BoulderSummary` type, `react-router-dom` (`Link`), `lucide-react` (`Users`).
- Produces: nothing.

**Design:** A self-contained section rendering two groups ("Your crews", "In your gym"). Each boulder is a `Link` to `/gym-problems/:id` showing the title, gym, crew count, and days left. The whole section renders `null` when both lists are empty, so it never shows an empty box on the Dashboard.

- [ ] **Step 1: Write the component**

Create `src/components/CrewsSection.tsx`:

```tsx
import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import { useDiscoverBoulders } from '../hooks/useDiscoverBoulders'
import { daysUntil } from '../utils/gymProblems'
import type { BoulderSummary } from '../types'

function BoulderRow({ b }: { b: BoulderSummary }) {
  const left = daysUntil(b.expires_at, new Date())
  return (
    <Link
      to={`/gym-problems/${b.id}`}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{b.title}</p>
        <p className="text-xs text-gray-400 truncate">{b.gym}</p>
      </div>
      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
        <Users size={12} strokeWidth={2} /> {b.crewCount}
      </span>
      <span className={`text-xs ${left >= 0 ? 'text-sage-700' : 'text-gray-400'}`}>
        {left >= 0 ? `${left}d` : 'gone'}
      </span>
    </Link>
  )
}

export function CrewsSection() {
  const { data } = useDiscoverBoulders()
  const yours = data?.yours ?? []
  const discover = data?.discover ?? []
  if (yours.length === 0 && discover.length === 0) return null

  return (
    <div className="mb-6">
      <h2 className="flex items-center gap-1.5 text-base font-bold mb-2">🧗 Crews</h2>
      {yours.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Your crews</p>
          <div className="space-y-1.5">
            {yours.map(b => <BoulderRow key={b.id} b={b} />)}
          </div>
        </div>
      )}
      {discover.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">In your gym</p>
          <div className="space-y-1.5">
            {discover.map(b => <BoulderRow key={b.id} b={b} />)}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire it into the Dashboard**

In `src/pages/DashboardPage.tsx`, add the import next to the other component imports:

```tsx
import { CrewsSection } from '../components/CrewsSection'
```

Then render `<CrewsSection />` in the dashboard's main content. Place it right after the `{/* Stats row */}` block (search for the `{/* Stats row */}` comment and insert `<CrewsSection />` immediately after that block's closing tag, before the `{/* Friends activity this week */}` section). Match the surrounding indentation.

- [ ] **Step 3: Typecheck, lint, and build**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: no type errors, no new lint errors (baseline 17), build succeeds (pre-existing vite chunk-size warning is fine).

- [ ] **Step 4: Manual verification**

With migrations 044–046 applied, run `npm run dev`. On the Dashboard: if you've claimed a boulder it appears under "Your crews"; other active boulders in gyms you've logged in appear under "In your gym", each showing crew count and days left and linking to the Crew page. If you have no gym problems at all, the section is absent.

- [ ] **Step 5: Commit**

```bash
git add src/components/CrewsSection.tsx src/pages/DashboardPage.tsx
git commit -m "feat: Crews discovery section on the Dashboard"
```

---

## Self-Review

**Coverage:**
- Discoverable entry point on the Dashboard → Task 3 ✓
- "Your crews" (claimed, active) → Task 2 (`yours`) + Task 3 ✓
- "In your gym" (active boulders in your gyms, not yet joined, top 5 by crew size) → Task 2 (`discover`) + Task 3 ✓
- Crew count + days-left per boulder → Task 1 (`countMembersByBoulder`) + `daysUntil` reuse ✓
- Links to the existing Crew page → Task 3 (`/gym-problems/:id`) ✓
- No empty-state clutter (renders null when both empty) → Task 3 ✓

**Placeholder scan:** No TBD/TODO/vague directives — every code step is complete. ✓

**Type consistency:** `BoulderSummary` defined in Task 1, imported unchanged in Tasks 2–3. `boulderTitle`/`countMembersByBoulder` signatures match across Tasks 1–2. `useDiscoverBoulders` return shape `{ yours, discover }` matches between Task 2 (definition) and Task 3 (use). ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-20-crew-discovery-dashboard.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
