# Leaderboards on an Analysis Subpage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the beta-points and grade-score leaderboards off the shared boulder page onto a new `/analysis/leaderboards` subpage, with beta points first, both boards monthly, and top 10 per board.

**Architecture:** Purely client-side. Two existing React Query hooks already fetch per-gym boards; `useGymGradeLeaderboard` gains a month parameter and a `created_at` range filter. A new `LeaderboardsPage` owns gym selection (chips from `profile.default_gyms`, mirrored to `?gym=`) and month selection (component state), and renders two instances of a new `LeaderboardList` component. The boulder page's copies are deleted last, so the app builds and works at every step.

**Tech Stack:** React 19, TypeScript, React Router 7 (`useSearchParams`), TanStack Query v5, Supabase JS v2, Tailwind (custom `sage`/`khaki` palettes), lucide-react icons, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-27-leaderboards-analysis-subpage-design.md`

## Global Constraints

- **No migration, no SQL, no RLS change.** The entire change is client-side. If you find yourself writing a `.sql` file, stop — you have misread the plan.
- **`npm run build` must pass.** It runs `tsc -b` with `noUnusedLocals`, so an import left behind by a deletion fails the build.
- **`npm run lint` must stay at the baseline of 16 problems** (15 errors, 1 warning — all pre-existing, verified on this branch). Do not "fix" pre-existing lint warnings; do not add new ones.
- **`npm test` must pass.** Vitest, run non-interactively as `npx vitest run`.
- **Only pure functions in `src/utils/` get tests.** There is no `@testing-library/react` in this project. Do not add one, and do not write component or hook tests — every existing test file tests a pure util.
- **Month strings are `'YYYY-MM'`** everywhere (matches the `beta_points.cycle_month` column and the existing `cycleMonth` helper).
- **Tailwind classes only.** No inline `style` attributes, no CSS files. Signed-in user's row is `bg-sage-50 border border-sage-200`; other rows are `bg-gray-50`.
- **Commit after every task.** Conventional-commit subject lines, imperative mood.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/utils/leaderboard.ts` | *(modify)* Pure month/ranking helpers. Gains `shiftMonth`, `monthBounds`, `topEntries` beside the existing `cycleMonth`, `rankEntries`, `buildLeaderboard`. |
| `src/utils/__tests__/leaderboard.test.ts` | *(modify)* Tests for the three new helpers. |
| `src/hooks/useGradeLeaderboard.ts` | *(modify)* `useGymGradeLeaderboard(gym, month)` — adds the month parameter and the `created_at` range filter. |
| `src/components/LeaderboardList.tsx` | *(create)* Presentational ranked list: rows, empty label, `top N of M` footer. No data fetching. |
| `src/pages/LeaderboardsPage.tsx` | *(create)* The new page: gym chips, gym lookup input, month stepper, two `LeaderboardList` sections. |
| `src/App.tsx` | *(modify)* Register `/analysis/leaderboards`. |
| `src/pages/AnalysisPage.tsx` | *(modify)* Add the nav row that links to the new page. |
| `src/pages/CrewPage.tsx` | *(modify)* Delete both leaderboard blocks and everything only they used. |

Task order keeps the tree green: the hook signature changes while `CrewPage` still consumes it (one-line call-site update), the new page is built, and only then are the old blocks deleted — so the feature is never missing from the app.

---

### Task 1: Pure month and ranking helpers

**Files:**
- Modify: `src/utils/leaderboard.ts`
- Test: `src/utils/__tests__/leaderboard.test.ts`

**Interfaces:**
- Consumes: `cycleMonth(date: Date): string` and `LeaderboardEntry` (from `src/types`), both already present.
- Produces:
  - `shiftMonth(month: string, delta: number): string`
  - `monthBounds(month: string): { start: string; end: string }`
  - `topEntries(entries: LeaderboardEntry[], limit: number): LeaderboardEntry[]`

`LeaderboardEntry` is already defined in `src/types/index.ts:299-305` as:

```ts
export interface LeaderboardEntry {
  user_id: string
  username: string | null
  avatar_url: string | null
  points: number
  rank: number
}
```

- [ ] **Step 1: Write the failing tests**

Append to `src/utils/__tests__/leaderboard.test.ts`, and extend the existing import on line 2 to `import { cycleMonth, buildLeaderboard, shiftMonth, monthBounds, topEntries } from '../leaderboard'`. Also add `import type { LeaderboardEntry } from '../../types'` below it.

```ts
describe('shiftMonth', () => {
  it('steps back inside a year', () => {
    expect(shiftMonth('2026-07', -1)).toBe('2026-06')
  })

  it('steps back across a year boundary', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('steps forward across a year boundary', () => {
    expect(shiftMonth('2025-12', 1)).toBe('2026-01')
  })

  it('handles multi-month jumps', () => {
    expect(shiftMonth('2026-03', -5)).toBe('2025-10')
  })

  it('is a no-op for delta 0', () => {
    expect(shiftMonth('2026-03', 0)).toBe('2026-03')
  })
})

describe('monthBounds', () => {
  it('returns half-open UTC bounds', () => {
    expect(monthBounds('2026-07')).toEqual({
      start: '2026-07-01T00:00:00.000Z',
      end: '2026-08-01T00:00:00.000Z',
    })
  })

  it('rolls the end into the next year for December', () => {
    expect(monthBounds('2026-12')).toEqual({
      start: '2026-12-01T00:00:00.000Z',
      end: '2027-01-01T00:00:00.000Z',
    })
  })
})

describe('topEntries', () => {
  const entry = (rank: number, points: number): LeaderboardEntry => ({
    user_id: `u${rank}-${points}`,
    username: `u${rank}-${points}`,
    avatar_url: null,
    points,
    rank,
  })

  it('keeps entries up to the limit and drops the rest', () => {
    const board = [entry(1, 30), entry(2, 20), entry(3, 10)]
    expect(topEntries(board, 2).map(e => e.rank)).toEqual([1, 2])
  })

  it('keeps every member of a tie straddling the limit', () => {
    // ranks 1..9 distinct, then three climbers tied at rank 10: all three show,
    // so a limit of 10 renders 12 rows rather than cutting a tied climber.
    const board = [
      ...Array.from({ length: 9 }, (_, i) => entry(i + 1, 100 - i)),
      entry(10, 5), entry(10, 5), entry(10, 5),
    ]
    const shown = topEntries(board, 10)
    expect(shown).toHaveLength(12)
    expect(shown.filter(e => e.rank === 10)).toHaveLength(3)
  })

  it('drops a tie that sits entirely past the limit', () => {
    const board = [entry(1, 30), entry(2, 20), entry(2, 20), entry(4, 10)]
    expect(topEntries(board, 2).map(e => e.points)).toEqual([30, 20, 20])
  })

  it('returns everything when the board is shorter than the limit', () => {
    const board = [entry(1, 30), entry(2, 20)]
    expect(topEntries(board, 10)).toEqual(board)
  })

  it('returns empty for an empty board', () => {
    expect(topEntries([], 10)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/leaderboard.test.ts`

Expected: FAIL. The suite errors before any assertion with something like `No "shiftMonth" export is defined on the "../leaderboard" mock` or a TypeScript/import resolution error naming `shiftMonth`, `monthBounds`, `topEntries`.

- [ ] **Step 3: Implement the three helpers**

Append to `src/utils/leaderboard.ts` (the file already imports `LeaderboardEntry`, so no import change is needed):

```ts
/**
 * Shift a 'YYYY-MM' cycle month by whole months.
 * shiftMonth('2026-01', -1) === '2025-12'
 */
export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number)
  return cycleMonth(new Date(Date.UTC(year, m - 1 + delta, 1)))
}

/**
 * Half-open UTC bounds for a 'YYYY-MM' month, shaped for a timestamptz range
 * filter: start <= created_at < end. Half-open avoids the end-of-month
 * off-by-one that an inclusive upper bound invites.
 */
export function monthBounds(month: string): { start: string; end: string } {
  const [year, m] = month.split('-').map(Number)
  return {
    start: new Date(Date.UTC(year, m - 1, 1)).toISOString(),
    end: new Date(Date.UTC(year, m, 1)).toISOString(),
  }
}

/**
 * Entries whose competition rank falls within `limit`. Tie-inclusive: climbers
 * tied on the boundary rank all appear, so the result can exceed `limit`.
 * Filtering on rank rather than slicing is the point — cutting one member of a
 * tie while showing another on identical points reads as a bug.
 */
export function topEntries(entries: LeaderboardEntry[], limit: number): LeaderboardEntry[] {
  return entries.filter(e => e.rank <= limit)
}
```

`Date.UTC` normalises out-of-range months on its own (month `-1` rolls to the previous December, month `12` to next January), which is what makes `shiftMonth` boundary-safe without arithmetic.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/leaderboard.test.ts`

Expected: PASS, all tests in the file green (the 5 pre-existing `cycleMonth`/`buildLeaderboard` tests plus the 13 new ones).

- [ ] **Step 5: Run the full suite and the build**

Run: `npx vitest run && npm run build`

Expected: all test files pass; build completes with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/utils/leaderboard.ts src/utils/__tests__/leaderboard.test.ts
git commit -m "Add shiftMonth, monthBounds and topEntries leaderboard helpers"
```

---

### Task 2: Scope grade score to a month

**Files:**
- Modify: `src/hooks/useGradeLeaderboard.ts`
- Modify: `src/pages/CrewPage.tsx:203` (call site, one line)

**Interfaces:**
- Consumes: `monthBounds(month)` from Task 1.
- Produces: `useGymGradeLeaderboard(gym: string, month: string)` — month is `'YYYY-MM'`; returns the same `UseQueryResult<LeaderboardEntry[]>` as before.

Why `created_at` and not the session's climb date: `problems` is readable by every authenticated user (`supabase/migrations/015_social_read_policies.sql`), but `sessions` is not — `supabase/migrations/032_session_wisdom.sql:6-10` limits it to your own sessions plus shared-wisdom sessions of people you follow. Joining `sessions` for the true date would silently drop other climbers' rows and produce a wrong board. Do not add that join.

- [ ] **Step 1: Add the month parameter and the date filter**

Replace the whole of `src/hooks/useGradeLeaderboard.ts` with:

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { buildGradeLeaderboard, type GradeProblemRow } from '../utils/gradeLeaderboard'
import { monthBounds } from '../utils/leaderboard'
import type { GymGrading, LeaderboardEntry } from '../types'

/**
 * Grade score for one gym over one cycle month ('YYYY-MM').
 *
 * The month is taken from problems.created_at — when the send was logged — not
 * from the session's date: sessions is not readable across users (see
 * migration 032), so joining it would silently drop other climbers' rows.
 * Consequence: a boulder climbed on the last of the month but logged the next
 * day counts for the following month.
 */
export function useGymGradeLeaderboard(gym: string, month: string) {
  return useQuery({
    queryKey: ['grade_leaderboard', gym, month],
    queryFn: async (): Promise<LeaderboardEntry[]> => {
      const { data: gradings, error: gErr } = await supabase
        .from('gym_gradings')
        .select('gym, color_name, rank, points')
        .eq('gym', gym)
      if (gErr) throw gErr

      // v1: client-side aggregation over one month of one gym's sends. The
      // explicit cap makes the (now very unlikely) truncation non-silent.
      // Revisit with a server-side aggregation RPC if a gym exceeds this.
      const { start, end } = monthBounds(month)
      const { data: probs, error: pErr } = await supabase
        .from('problems')
        .select('user_id, color, sent, gym_problem_id, name, grade_value')
        .eq('gym', gym)
        .eq('sent', true)
        .gte('created_at', start)
        .lt('created_at', end)
        .range(0, 99999)
      if (pErr) throw pErr
      const rows = (probs ?? []) as GradeProblemRow[]

      const userIds = Array.from(new Set(rows.map(r => r.user_id)))
      let profiles: { id: string; username: string | null; avatar_url: string | null }[] = []
      if (userIds.length > 0) {
        const { data: profs, error: prErr } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', userIds)
        if (prErr) throw prErr
        profiles = (profs ?? []) as { id: string; username: string | null; avatar_url: string | null }[]
      }

      return buildGradeLeaderboard(rows, (gradings ?? []) as GymGrading[], profiles)
    },
    enabled: !!gym && !!month,
  })
}
```

`buildGradeLeaderboard` and its per-user dedupe are unchanged — within a month, re-logging the same boulder still counts once.

- [ ] **Step 2: Update the existing call site**

`src/pages/CrewPage.tsx` already computes `const month = cycleMonth(new Date())` on line 201. Change line 203 from:

```tsx
  const { data: gradeLeaderboard = [] } = useGymGradeLeaderboard(boulder?.gym ?? '')
```

to:

```tsx
  const { data: gradeLeaderboard = [] } = useGymGradeLeaderboard(boulder?.gym ?? '', month)
```

This block is deleted in Task 6; the one-line update keeps the build green in between.

- [ ] **Step 3: Verify the build and tests**

Run: `npm run build && npx vitest run`

Expected: build completes with no TypeScript errors (a missing second argument at any call site would fail here); all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useGradeLeaderboard.ts src/pages/CrewPage.tsx
git commit -m "Scope grade score leaderboard to a cycle month"
```

---

### Task 3: LeaderboardList component

**Files:**
- Create: `src/components/LeaderboardList.tsx`

**Interfaces:**
- Consumes: `topEntries` from Task 1; `SetterBadge` from `src/components/SetterBadge.tsx`; `LeaderboardEntry` from `src/types`.
- Produces: `<LeaderboardList entries={...} currentUserId={...} limit={10} emptyLabel="..." />` — `limit` defaults to `10` and is optional; `currentUserId` accepts `string | undefined`.

No test: there is no React test harness in this project. Verification is the build plus the manual check in Task 4.

- [ ] **Step 1: Create the component**

Create `src/components/LeaderboardList.tsx`:

```tsx
import { SetterBadge } from './SetterBadge'
import { topEntries } from '../utils/leaderboard'
import type { LeaderboardEntry } from '../types'

interface Props {
  entries: LeaderboardEntry[]
  currentUserId: string | undefined
  /** Ranks above this are cut. Tie-inclusive, so more rows than this can render. */
  limit?: number
  emptyLabel: string
}

export function LeaderboardList({ entries, currentUserId, limit = 10, emptyLabel }: Props) {
  if (entries.length === 0) {
    return (
      <p className="text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3.5 text-center">
        {emptyLabel}
      </p>
    )
  }

  const shown = topEntries(entries, limit)

  return (
    <>
      <div className="space-y-1">
        {shown.map(entry => (
          <div
            key={entry.user_id}
            className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm ${
              entry.user_id === currentUserId ? 'bg-sage-50 border border-sage-200' : 'bg-gray-50'
            }`}
          >
            <span className="w-5 text-center font-bold text-gray-400">{entry.rank}</span>
            <span className="flex flex-1 items-center gap-1 font-medium text-gray-800 min-w-0">
              <span className="truncate">{entry.username ?? 'Someone'}</span>
              <SetterBadge userId={entry.user_id} />
            </span>
            <span className="font-semibold text-sage-700">{entry.points}</span>
          </div>
        ))}
      </div>
      {shown.length < entries.length && (
        <p className="text-[11px] text-gray-400 text-right mt-1.5">
          top {shown.length} of {entries.length}
        </p>
      )}
    </>
  )
}
```

The row markup is lifted verbatim from `src/pages/CrewPage.tsx:588-599` so the boards look identical to today. The footer counts `shown.length`, not `limit`, so a tie that renders 12 rows honestly reads `top 12 of 14`.

- [ ] **Step 2: Verify the build**

Run: `npm run build`

Expected: completes with no TypeScript errors. (An unused new file would not fail — Task 4 consumes it.)

- [ ] **Step 3: Commit**

```bash
git add src/components/LeaderboardList.tsx
git commit -m "Add LeaderboardList component with tie-inclusive top-N cut"
```

---

### Task 4: LeaderboardsPage and its route

**Files:**
- Create: `src/pages/LeaderboardsPage.tsx`
- Modify: `src/App.tsx` (import + one `<Route>`)

**Interfaces:**
- Consumes: `LeaderboardList` (Task 3); `useGymGradeLeaderboard(gym, month)` (Task 2); `cycleMonth`, `shiftMonth` (Task 1); plus existing `useGymLeaderboard(gym, cycleMonth)`, `useProfile()`, `useGymSuggestions()`, `useGymGradings(gym)`, `useAuth()`.
- Produces: `export function LeaderboardsPage()`, routed at `/analysis/leaderboards`.

Hooks you will use, with their real shapes:

```ts
useProfile()                        // no arg = signed-in user; data.default_gyms is string[]
useGymSuggestions()                 // data: { name: string; uses: number }[]
useGymGradings(gym: string | null)  // data: GymGrading[]; [] means this gym has no grading configured
useGymLeaderboard(gym, month)       // data: LeaderboardEntry[] — beta points, already monthly
useGymGradeLeaderboard(gym, month)  // data: LeaderboardEntry[] — grade score, monthly as of Task 2
useAuth()                           // { user } — user?.id is the signed-in id
```

The page needs **no** in-page back chevron: `AppBar` (`src/components/AppBar.tsx:18-34`) already renders one for every route outside `TOP_LEVEL_PATHS`, and `/analysis/leaderboards` is not in that list.

- [ ] **Step 1: Create the page**

Create `src/pages/LeaderboardsPage.tsx`:

```tsx
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Trophy, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../providers/AuthProvider'
import { useProfile } from '../hooks/useProfile'
import { useGymSuggestions } from '../hooks/useGymSuggestions'
import { useGymGradings } from '../hooks/useGymGradings'
import { useGymLeaderboard } from '../hooks/useLeaderboard'
import { useGymGradeLeaderboard } from '../hooks/useGradeLeaderboard'
import { LeaderboardList } from '../components/LeaderboardList'
import { cycleMonth, shiftMonth } from '../utils/leaderboard'

export function LeaderboardsPage() {
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const { data: gymOptions = [] } = useGymSuggestions()
  const [params, setParams] = useSearchParams()

  const defaultGyms = profile?.default_gyms ?? []
  // Gym lives in the URL so the page is linkable and survives a reload; the
  // first default gym is the implicit default.
  const gym = params.get('gym') ?? defaultGyms[0] ?? ''
  const selectGym = (next: string) => setParams(next ? { gym: next } : {}, { replace: true })

  const thisMonth = cycleMonth(new Date())
  const [month, setMonth] = useState(thisMonth)
  const [lookupOpen, setLookupOpen] = useState(false)
  const [lookupText, setLookupText] = useState('')

  const { data: gradings = [] } = useGymGradings(gym || null)
  const { data: betaBoard = [], isLoading: betaLoading } = useGymLeaderboard(gym, month)
  const { data: gradeBoard = [], isLoading: gradeLoading } = useGymGradeLeaderboard(gym, month)

  // A gym reached through the lookup input gets a chip for this visit too, so
  // the selection is always visible somewhere.
  const chips = gym && !defaultGyms.includes(gym) ? [...defaultGyms, gym] : defaultGyms
  const monthLabel = new Date(`${month}-01T00:00:00Z`)
    .toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  return (
    <div className="p-4 space-y-4 pb-28">
      <h1 className="text-xl font-bold">Leaderboards</h1>

      {chips.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-0.5">
          {chips.map(g => (
            <button
              key={g}
              onClick={() => selectGym(g)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border whitespace-nowrap transition-colors ${
                g === gym
                  ? 'bg-sage-700 border-sage-700 text-white'
                  : 'bg-white border-gray-200 text-gray-600'
              }`}
            >
              {g}
            </button>
          ))}
          <button
            onClick={() => setLookupOpen(o => !o)}
            aria-label="Choose another gym"
            aria-expanded={lookupOpen}
            className="text-xs text-gray-400 px-2.5 py-1.5 rounded-full border border-gray-200 bg-white"
          >
            ⌄
          </button>
        </div>
      )}

      {(lookupOpen || chips.length === 0) && (
        <div>
          <label htmlFor="leaderboard-gym" className="block text-sm font-medium text-gray-700 mb-1">Gym</label>
          <input
            id="leaderboard-gym"
            list="leaderboard-gyms"
            value={lookupText}
            onChange={e => {
              const next = e.target.value
              setLookupText(next)
              // Commit only on a real gym name. Binding the URL straight to
              // keystrokes would fire a gym-wide query per character typed.
              if (gymOptions.some(g => g.name === next)) selectGym(next)
            }}
            onBlur={() => { if (lookupText) selectGym(lookupText) }}
            onKeyDown={e => { if (e.key === 'Enter' && lookupText) selectGym(lookupText) }}
            placeholder="e.g. Boulders Oslo"
            className="w-full border rounded-lg px-3 py-2.5"
          />
          <datalist id="leaderboard-gyms">
            {gymOptions.map(g => <option key={g.name} value={g.name} />)}
          </datalist>
        </div>
      )}

      {!gym ? (
        <p className="text-sm text-gray-400 bg-gray-50 rounded-xl px-4 py-6 text-center">
          Pick a gym to see its leaderboards.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between bg-white border border-gray-200 rounded-full p-1.5">
            <button
              onClick={() => setMonth(m => shiftMonth(m, -1))}
              aria-label="Previous month"
              className="w-7 h-7 rounded-full grid place-items-center bg-gray-100 text-gray-500"
            >
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
            <span className="text-sm font-bold text-gray-700">{monthLabel}</span>
            <button
              onClick={() => setMonth(m => shiftMonth(m, 1))}
              disabled={month >= thisMonth}
              aria-label="Next month"
              className="w-7 h-7 rounded-full grid place-items-center bg-gray-100 text-gray-500 disabled:bg-transparent disabled:text-gray-300"
            >
              <ChevronRight size={16} strokeWidth={2} />
            </button>
          </div>

          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
              <Trophy size={15} strokeWidth={2} className="text-amber-500" />
              Beta points
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5 mb-2">helping others through a boulder</p>
            {betaLoading
              ? <BoardSkeleton />
              : <LeaderboardList entries={betaBoard} currentUserId={user?.id} emptyLabel="No points yet this month." />}
          </div>

          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
              <Trophy size={15} strokeWidth={2} className="text-amber-500" />
              Grade score
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5 mb-2">colour points for boulders sent this month</p>
            {gradeLoading ? (
              <BoardSkeleton />
            ) : gradings.length === 0 ? (
              <p className="text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3.5 text-center">
                No grading set up for this gym yet.
              </p>
            ) : (
              <LeaderboardList entries={gradeBoard} currentUserId={user?.id} emptyLabel="No sends scored this month." />
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** Keeps the section height stable while a gym or month change is in flight. */
function BoardSkeleton() {
  return (
    <div className="space-y-1">
      {[0, 1, 2].map(i => <div key={i} className="h-9 rounded-xl bg-gray-100 animate-pulse" />)}
    </div>
  )
}
```

Two details that matter:

- `month >= thisMonth` is a plain string comparison, which is correct for `'YYYY-MM'` — lexical order matches chronological order for zero-padded ISO months. It disables forward paging on the current month.
- The grade-score section checks `gradings.length === 0` *before* the empty board, so "no grading configured for this gym" and "grading exists but nobody scored" read differently. Today the block renders nothing at all in either case.

- [ ] **Step 2: Register the route**

In `src/App.tsx`, add the import after the `AnalysisPage` import on line 15:

```tsx
import { LeaderboardsPage } from './pages/LeaderboardsPage'
```

and add the route directly after the `/analysis` route on line 50:

```tsx
                <Route path="/analysis" element={<AnalysisPage />} />
                <Route path="/analysis/leaderboards" element={<LeaderboardsPage />} />
```

- [ ] **Step 3: Verify the build and lint**

Run: `npm run build && npm run lint`

Expected: build clean; lint reports the same 17 problems as before, no new ones.

- [ ] **Step 4: Check it in the browser**

Run: `npm run dev`, then open `http://localhost:5173/analysis/leaderboards`.

Confirm:
- Chips list your default gyms, first one selected, and `?gym=` appears in the URL when you tap another.
- The month pill reads the current month and `›` is greyed out; `‹` pages back and both boards refetch.
- Beta points renders above grade score.
- A gym with no grading configured shows "No grading set up for this gym yet." under Grade score.
- Reloading the page keeps the selected gym and resets the month to the current one.

- [ ] **Step 5: Commit**

```bash
git add src/pages/LeaderboardsPage.tsx src/App.tsx
git commit -m "Add /analysis/leaderboards page with gym chips and month stepper"
```

---

### Task 5: Analysis entry row

**Files:**
- Modify: `src/pages/AnalysisPage.tsx`

**Interfaces:**
- Consumes: the `/analysis/leaderboards` route from Task 4.
- Produces: nothing other tasks depend on.

The row deliberately fetches no data. A live rank teaser would make Analysis pay for the gym-wide grade query on every load, which is the cost this whole change removes.

- [ ] **Step 1: Add the imports**

In `src/pages/AnalysisPage.tsx`, change the lucide import on line 13 from:

```tsx
import { RefreshCw, Sparkles } from 'lucide-react'
```

to:

```tsx
import { RefreshCw, Sparkles, Trophy } from 'lucide-react'
```

and add below the `useState` import on line 14:

```tsx
import { Link } from 'react-router-dom'
```

- [ ] **Step 2: Add the nav row**

In the returned JSX, insert the row between the stat card (which closes with `</div>` on line 88) and the `{/* AI Coaching */}` block on line 90:

```tsx
      <Link
        to="/analysis/leaderboards"
        className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 hover:border-gray-300 transition-colors"
      >
        <Trophy size={18} strokeWidth={1.75} className="text-sage-700" />
        <div>
          <p className="text-sm font-medium text-gray-700">Leaderboards</p>
          <p className="text-[11px] text-gray-400">Beta points &amp; grade score</p>
        </div>
        <span className="ml-auto text-gray-400 text-base">›</span>
      </Link>
```

This is the `/gym-grading` row pattern from `src/pages/ProfilePage.tsx:319-327`, with a subtitle added.

- [ ] **Step 3: Verify the build and lint**

Run: `npm run build && npm run lint`

Expected: build clean; lint still at 17 problems.

- [ ] **Step 4: Check it in the browser**

Run: `npm run dev` and open `http://localhost:5173/analysis`. The 🏆 Leaderboards row sits between the stat card and the AI Coaching button, and tapping it opens the new page.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AnalysisPage.tsx
git commit -m "Link to leaderboards from Analysis"
```

---

### Task 6: Remove both boards from the boulder page

**Files:**
- Modify: `src/pages/CrewPage.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. `useGymLeaderboard` and `useGymGradeLeaderboard` remain exported and are now consumed only by `LeaderboardsPage`.

- [ ] **Step 1: Delete the two blocks**

In `src/pages/CrewPage.tsx`, delete lines 579-627 in their entirety — the `{boulder.gym && leaderboard.length > 0 && (…)}` block and the `{boulder.gym && gradeLeaderboard.length > 0 && (…)}` block that follows it. After the deletion, the member-list `</div>` on line 577 is followed directly by the `</div>` on line 628 that closes the crew tab.

- [ ] **Step 2: Delete everything only those blocks used**

Four more edits in the same file:

1. Line 14 — delete `import { useGymLeaderboard } from '../hooks/useLeaderboard'`
2. Line 15 — delete `import { useGymGradeLeaderboard } from '../hooks/useGradeLeaderboard'`
3. Line 42 — delete `import { cycleMonth } from '../utils/leaderboard'`
4. Lines 201-203 — delete the `month` const and both hook calls:

```tsx
  const month = cycleMonth(new Date())
  const { data: leaderboard = [] } = useGymLeaderboard(boulder?.gym ?? '', month)
  const { data: gradeLeaderboard = [] } = useGymGradeLeaderboard(boulder?.gym ?? '', month)
```

5. Line 3 — remove `Trophy` from the lucide import. It is used only at lines 582 and 607, both inside the deleted blocks. `ChevronLeft` and `ChevronRight` are still used at lines 380 and 389 (image navigation) — **keep them**. The line becomes:

```tsx
import { ArrowLeft, Users, Play, Send, Plus, Pencil, ChevronLeft, ChevronRight, Wrench } from 'lucide-react'
```

- [ ] **Step 3: Verify the build catches nothing left behind**

Run: `npm run build`

Expected: clean. `tsc -b` runs with `noUnusedLocals`, so any surviving unused import or variable fails here with `'X' is declared but its value is never read`. If that happens, delete the named symbol — do not silence it.

- [ ] **Step 4: Run lint and the full suite**

Run: `npm run lint && npx vitest run`

Expected: lint at the 17-problem baseline; all tests pass.

- [ ] **Step 5: Check it in the browser**

Run: `npm run dev`, open any boulder at `/gym-problems/<id>`, and confirm the crew tab ends after the member list with no leaderboard blocks and no empty gap.

- [ ] **Step 6: Commit**

```bash
git add src/pages/CrewPage.tsx
git commit -m "Remove leaderboards from the shared boulder page"
```

---

## Final verification

- [ ] `npm run build` — clean
- [ ] `npm run lint` — 17 problems, unchanged from the baseline
- [ ] `npx vitest run` — all files pass
- [ ] `git log --oneline -6` — six commits, one per task
- [ ] Manual pass: `/analysis` → tap Leaderboards → switch gyms → page a month back → both boards update → back arrow returns to Analysis → a boulder page's crew tab ends after the member list

No migration to apply. This branch is deployable as soon as the above passes.
