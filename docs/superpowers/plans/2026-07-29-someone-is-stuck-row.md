# "Someone's Stuck" Beta Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show who is stuck on which boulder, and what they said, in a section between the homepage's story strip and its feed — so an explicit ask for beta is answerable instead of being a 20-pixel emoji.

**Architecture:** `useDiscoverBoulders` already queries `gym_problem_help` for open requests and spends the result on one boolean per boulder. Widen that select, batch-fetch the askers' names, and hand both to a tested pure function that drops your own asks and inactive boulders and sorts newest first. A new section component renders up to three, and `DashboardPage` places it between the strip and the feed.

**Tech Stack:** React 19, TypeScript, TanStack Query v5, Supabase JS, Tailwind (custom `sage` palette), lucide-react, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-29-someone-is-stuck-row-design.md`

## Global Constraints

- **No migration, no SQL, no new RPC.** `gym_problem_help` and its `note` column are live (migrations 057, 059). If you find yourself writing a `.sql` file you have misread the plan.
- **The help query must stay non-fatal.** It deliberately ignores its error so an unapplied migration degrades to "no help indicators" rather than breaking the whole home strip (`useDiscoverBoulders.ts:84-86`). The widened select and the new profile lookup must preserve that: any failure yields an empty request list while the strip and feed render normally. Do not add `if (error) throw`.
- **Your own asks are hidden.** You know you asked; being listed under "someone's stuck" reads as a bug.
- **Requests on inactive boulders are dropped** — expired or archived. The pure function achieves this by only matching against the active summaries it is given.
- **One row per request, not per boulder.** Two climbers stuck on the same problem is two asks.
- **Three rows maximum**, newest first. When more exist, a muted `+N more` links to `/gym-problems`, which already filters by help-wanted.
- **Nothing renders when nobody is stuck** — no heading, no empty state.
- **The note line is omitted when there is no note.** `gym_problem_help.note` is nullable and an empty quotation reads as a bug.
- **Tapping a row opens `/gym-problems/{gymProblemId}`** — the boulder's Beta tab holds the thread and composer. Do not build an answer affordance into the section.
- **Tailwind classes only.** No inline `style`, no CSS files.
- **Only pure functions in `src/utils/` get tests.** This project has no `@testing-library/react`; do not test the hook, the section or the page, and do not add test tooling.
- **`npm run build` must pass** (`tsc -b` with `noUnusedLocals`).
- **`npm run lint` must not add problems. Measure the baseline yourself first** and report both numbers.
- **`npx vitest run` was 153 tests across 18 files** before this work; confirm that yourself and report the new counts.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/utils/betaRequests.ts` | *(create)* `BetaRequest` and `buildBetaRequests` — the filtering and ordering. The only logic in this feature. |
| `src/utils/__tests__/betaRequests.test.ts` | *(create)* Own-asks excluded, inactive boulders dropped, newest first, name attached or null, empty inputs. |
| `src/hooks/useDiscoverBoulders.ts` | *(modify)* Widen the help select, batch-fetch asker profiles, return `betaRequests`. |
| `src/components/BetaRequestsSection.tsx` | *(create)* The section: heading, up to three rows, `+N more`. Presentational. |
| `src/pages/DashboardPage.tsx` | *(modify)* Render it between the strip and the feed. |

Task order: the tested util first (nothing depends on it), then the hook that produces its input, then the component, then the page. The component is written before it has a consumer, which builds cleanly since `noUnusedLocals` does not flag an unused exported component.

---

### Task 1: buildBetaRequests

**Files:**
- Create: `src/utils/betaRequests.ts`
- Test: `src/utils/__tests__/betaRequests.test.ts`

**Interfaces:**
- Consumes: `BoulderSummary` from `src/types`, already defined:

```ts
interface BoulderSummary {
  id: string; title: string; gym: string; color: string | null
  hold_color: string | null; community_grade: string | null
  image_url: string | null; beta_video_url: string | null
  set_at: string; helpWanted: boolean; expires_at: string
  crewCount: number; claimed: boolean; doneByMe: boolean
}
```

- Produces:

```ts
export interface BetaRequest {
  gymProblemId: string
  askerId: string
  askerName: string | null
  note: string | null
  createdAt: string
  boulder: BoulderSummary
}

export function buildBetaRequests(
  rows: { gym_problem_id: string; user_id: string; note: string | null; created_at: string }[],
  boulders: BoulderSummary[],
  profiles: { id: string; username: string | null }[],
  currentUserId: string | undefined,
): BetaRequest[]
```

Task 2 calls it; Tasks 3 and 4 render `BetaRequest[]`.

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/betaRequests.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildBetaRequests } from '../betaRequests'
import type { BoulderSummary } from '../../types'

function boulder(id: string): BoulderSummary {
  return {
    id, title: 'Shared boulder', gym: 'Boulders Oslo', color: 'Blue',
    hold_color: 'Red', community_grade: '6C', image_url: null,
    beta_video_url: null, set_at: '2026-07-01', helpWanted: true,
    expires_at: '2026-08-01', crewCount: 2, claimed: false, doneByMe: false,
  }
}

function row(gym_problem_id: string, user_id: string, created_at: string, note: string | null = null) {
  return { gym_problem_id, user_id, note, created_at }
}

const profiles = [
  { id: 'u1', username: 'ola' },
  { id: 'u2', username: 'kari' },
]

describe('buildBetaRequests', () => {
  it('attaches the asker name, note and boulder', () => {
    const b = boulder('gp1')
    const out = buildBetaRequests(
      [row('gp1', 'u1', '2026-07-20T10:00:00+00:00', 'cannot hold the crux')],
      [b], profiles, 'me',
    )
    expect(out).toEqual([{
      gymProblemId: 'gp1',
      askerId: 'u1',
      askerName: 'ola',
      note: 'cannot hold the crux',
      createdAt: '2026-07-20T10:00:00+00:00',
      boulder: b,
    }])
  })

  it('orders newest first', () => {
    const out = buildBetaRequests(
      [
        row('gp1', 'u1', '2026-07-18T10:00:00+00:00'),
        row('gp2', 'u2', '2026-07-20T10:00:00+00:00'),
      ],
      [boulder('gp1'), boulder('gp2')], profiles, 'me',
    )
    expect(out.map(r => r.gymProblemId)).toEqual(['gp2', 'gp1'])
  })

  it('hides the viewer own asks', () => {
    const out = buildBetaRequests(
      [
        row('gp1', 'me', '2026-07-20T10:00:00+00:00'),
        row('gp2', 'u1', '2026-07-19T10:00:00+00:00'),
      ],
      [boulder('gp1'), boulder('gp2')], profiles, 'me',
    )
    expect(out.map(r => r.askerId)).toEqual(['u1'])
  })

  it('keeps every ask when there is no viewer id', () => {
    const out = buildBetaRequests(
      [row('gp1', 'me', '2026-07-20T10:00:00+00:00')],
      [boulder('gp1')], profiles, undefined,
    )
    expect(out).toHaveLength(1)
  })

  it('drops a request whose boulder is not in the active list', () => {
    const out = buildBetaRequests(
      [
        row('gp1', 'u1', '2026-07-20T10:00:00+00:00'),
        row('gone', 'u2', '2026-07-19T10:00:00+00:00'),
      ],
      [boulder('gp1')], profiles, 'me',
    )
    expect(out.map(r => r.gymProblemId)).toEqual(['gp1'])
  })

  it('keeps two asks on the same boulder as two rows', () => {
    const out = buildBetaRequests(
      [
        row('gp1', 'u1', '2026-07-20T10:00:00+00:00'),
        row('gp1', 'u2', '2026-07-19T10:00:00+00:00'),
      ],
      [boulder('gp1')], profiles, 'me',
    )
    expect(out.map(r => r.askerId)).toEqual(['u1', 'u2'])
  })

  it('yields a null name when the asker has no profile', () => {
    const out = buildBetaRequests(
      [row('gp1', 'stranger', '2026-07-20T10:00:00+00:00')],
      [boulder('gp1')], profiles, 'me',
    )
    expect(out[0].askerName).toBeNull()
  })

  it('returns empty for no rows', () => {
    expect(buildBetaRequests([], [boulder('gp1')], profiles, 'me')).toEqual([])
  })

  it('returns empty when no boulders are active', () => {
    expect(buildBetaRequests(
      [row('gp1', 'u1', '2026-07-20T10:00:00+00:00')], [], profiles, 'me',
    )).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/betaRequests.test.ts`

Expected: FAIL — the suite cannot resolve `../betaRequests`, reporting something like
`Failed to load url ../betaRequests` or `No "buildBetaRequests" export is defined`.

- [ ] **Step 3: Implement it**

Create `src/utils/betaRequests.ts`:

```ts
import type { BoulderSummary } from '../types'

/** An open "I'm stuck, help me" request on a boulder, ready to render. */
export interface BetaRequest {
  gymProblemId: string
  askerId: string
  askerName: string | null
  note: string | null
  createdAt: string
  boulder: BoulderSummary
}

/**
 * Open beta requests worth showing: not your own, on a boulder still active,
 * newest first.
 *
 * A row whose boulder is absent from `boulders` is dropped — that is how expired
 * and archived boulders are excluded, since the caller passes only the active
 * summaries. One row per request, so two climbers stuck on the same boulder stay
 * two asks.
 */
export function buildBetaRequests(
  rows: { gym_problem_id: string; user_id: string; note: string | null; created_at: string }[],
  boulders: BoulderSummary[],
  profiles: { id: string; username: string | null }[],
  currentUserId: string | undefined,
): BetaRequest[] {
  const boulderById = new Map(boulders.map(b => [b.id, b]))
  const nameById = new Map(profiles.map(p => [p.id, p.username]))

  return rows
    .filter(r => r.user_id !== currentUserId && boulderById.has(r.gym_problem_id))
    .map(r => ({
      gymProblemId: r.gym_problem_id,
      askerId: r.user_id,
      askerName: nameById.get(r.user_id) ?? null,
      note: r.note,
      createdAt: r.created_at,
      boulder: boulderById.get(r.gym_problem_id)!,
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/betaRequests.test.ts`

Expected: PASS, 9 tests.

- [ ] **Step 5: Run the full suite and the build**

Run: `npx vitest run && npm run build`

Expected: 153 pre-existing tests plus your 9; build clean.

- [ ] **Step 6: Commit**

```bash
git add src/utils/betaRequests.ts src/utils/__tests__/betaRequests.test.ts
git commit -m "Add buildBetaRequests: open asks worth answering, newest first"
```

---

### Task 2: Return the requests from useDiscoverBoulders

**Files:**
- Modify: `src/hooks/useDiscoverBoulders.ts`

**Interfaces:**
- Consumes: `buildBetaRequests` and `BetaRequest` from Task 1.
- Produces: the hook's `data` gains a fourth field —
  `{ yours: BoulderSummary[]; discover: BoulderSummary[]; archived: BoulderSummary[]; betaRequests: BetaRequest[] }`.
  Task 4 reads `betaRequests`.

Facts already verified — do not re-derive:
- The help query is at `useDiscoverBoulders.ts:87-89`, already filtered
  `.in('gym_problem_id', ids).is('resolved_at', null)`, and already ignores its error
  on purpose.
- `gym_problem_help` columns are `gym_problem_id, user_id, created_at, resolved_at`
  (migration 057) plus `note, video_url` (migration 059).
- `activeIds` is built at line 64; `summaries` at line 91; `active` at line 114.
- There are exactly **three** `return { yours` statements: two early bails at lines 43
  (`myGyms.length === 0 && myClaimedIds.size === 0`) and 62 (`list.length === 0`), plus
  the real one at line 122. All three need the new field or TypeScript will reject
  them. Verify with `grep -n "return { yours" src/hooks/useDiscoverBoulders.ts`.

- [ ] **Step 1: Widen the help select**

Replace the help query (currently selecting one column) so it also brings back the
asker, the note and the timestamp:

```ts
      const { data: helpRows } = await supabase
        .from('gym_problem_help')
        .select('gym_problem_id, user_id, note, created_at')
        .in('gym_problem_id', ids)
        .is('resolved_at', null)
      const openHelp = (helpRows ?? []) as
        { gym_problem_id: string; user_id: string; note: string | null; created_at: string }[]
      const helpWantedIds = new Set(openHelp.map(h => h.gym_problem_id))
```

Note there is still no `if (error) throw` — that omission is deliberate and must
survive, so a missing table degrades to no indicators and no requests.

- [ ] **Step 2: Fetch the askers' names**

After `summaries` and `active` are built (so the active list exists), add:

```ts
      // Names for the "someone's stuck" section. One batched query, skipped when
      // nobody is asking. Non-fatal like the help query above: no name is better
      // than no home page.
      const askerIds = Array.from(new Set(openHelp.map(h => h.user_id)))
      let askerProfiles: { id: string; username: string | null }[] = []
      if (askerIds.length > 0) {
        const { data: askers } = await supabase
          .from('profiles').select('id, username').in('id', askerIds)
        askerProfiles = (askers ?? []) as { id: string; username: string | null }[]
      }
      const betaRequests = buildBetaRequests(openHelp, active, askerProfiles, user?.id)
```

`active` is the right list to pass: it is already filtered to boulders that are still
active, which is exactly how the util excludes expired ones.

- [ ] **Step 3: Add the field to the return type and every return**

Change the `queryFn` return annotation to:

```ts
    queryFn: async (): Promise<{
      yours: BoulderSummary[]
      discover: BoulderSummary[]
      archived: BoulderSummary[]
      betaRequests: BetaRequest[]
    }> => {
```

Add `betaRequests` to the final return, and add `betaRequests: []` to each of the
early returns that bail before any requests can exist. Add the import:

```ts
import { buildBetaRequests } from '../utils/betaRequests'
import type { BetaRequest } from '../utils/betaRequests'
```

- [ ] **Step 4: Confirm nothing else broke**

Run: `npm run build && npm run lint && npx vitest run`

Expected: build clean — a missed early return shows up here as
`Property 'betaRequests' is missing`; lint at your measured baseline; all tests pass.

Then run: `grep -rn "useDiscoverBoulders()" src/`

Expected: `src/components/LatestProblemsStrip.tsx` and `src/components/CrewsSection.tsx`.
Both destructure the fields they use, so a new field needs no change in either — but
read both lines to be sure neither does something exhaustive with the object.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDiscoverBoulders.ts
git commit -m "Return open beta requests from useDiscoverBoulders"
```

---

### Task 3: BetaRequestsSection

**Files:**
- Create: `src/components/BetaRequestsSection.tsx`

**Interfaces:**
- Consumes: `BetaRequest` from Task 1.
- Produces: `<BetaRequestsSection requests={BetaRequest[]} />`. Task 4 renders it.

Purely presentational: it takes the list, owns no state and fetches nothing.

- [ ] **Step 1: Create the component**

Create `src/components/BetaRequestsSection.tsx`:

```tsx
import { Link, useNavigate } from 'react-router-dom'
import type { BetaRequest } from '../utils/betaRequests'

const SHOWN = 3

/** "the blue 6C", falling back to the summary's own title. */
function boulderLabel(r: BetaRequest): string {
  const colorGrade = [r.boulder.color?.toLowerCase(), r.boulder.community_grade]
    .filter(Boolean)
    .join(' ')
  return colorGrade ? `the ${colorGrade}` : r.boulder.title
}

/**
 * Open "I'm stuck" asks at your gyms — the one place in the app where someone has
 * explicitly requested beta and you can answer. Renders nothing when nobody is
 * asking; tapping a row opens the boulder, whose Beta tab holds the composer.
 */
export function BetaRequestsSection({ requests }: { requests: BetaRequest[] }) {
  const navigate = useNavigate()
  if (requests.length === 0) return null

  const shown = requests.slice(0, SHOWN)
  const extra = requests.length - shown.length

  return (
    <div className="px-4 pt-3 pb-1">
      <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Someone's stuck</h2>
      <div className="space-y-2">
        {shown.map(r => (
          <button
            key={`${r.gymProblemId}:${r.askerId}`}
            type="button"
            onClick={() => navigate(`/gym-problems/${r.gymProblemId}`)}
            className="w-full flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/60 px-3.5 py-2.5 text-left hover:border-amber-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500"
          >
            <span aria-hidden className="text-base leading-none mt-0.5">🆘</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-gray-800">
                <span className="font-semibold">{r.askerName ?? 'Someone'}</span>
                <span className="text-gray-500"> is stuck on </span>
                <span className="font-medium">{boulderLabel(r)}</span>
              </span>
              {r.note && (
                <span className="mt-0.5 block text-xs text-gray-600 line-clamp-2">"{r.note}"</span>
              )}
              <span className="mt-0.5 block text-[11px] text-gray-400">{r.boulder.gym}</span>
            </span>
            <span aria-hidden className="text-gray-400 text-base leading-none mt-0.5">›</span>
          </button>
        ))}
      </div>
      {extra > 0 && (
        <p className="mt-1.5 text-right">
          <Link to="/gym-problems" className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
            +{extra} more →
          </Link>
        </p>
      )}
    </div>
  )
}
```

Three details are deliberate:

- **The key is `gymProblemId:askerId`**, which is `gym_problem_help`'s primary key
  (migration 057), so it is exactly the row identity and cannot collide when two
  climbers are stuck on the same boulder.
- **Amber, not sage.** The 🆘 badge on the story rings is already amber
  (`StoryRing.tsx:46`), so the section matches the signal the user has learned.
- **The note is `line-clamp-2`** — a note is free text and a long one would push the
  feed off the screen.

- [ ] **Step 2: Verify the build**

Run: `npm run build && npm run lint`

Expected: build clean; lint at your measured baseline. The component is unused until
Task 4, which does not fail the build.

- [ ] **Step 3: Commit**

```bash
git add src/components/BetaRequestsSection.tsx
git commit -m "Add the someone's-stuck section"
```

---

### Task 4: Place it on the homepage

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

**Interfaces:**
- Consumes: `<BetaRequestsSection requests={...} />` from Task 3, and `betaRequests`
  from the hook in Task 2.
- Produces: the feature.

`DashboardPage` currently renders `<LatestProblemsStrip />` then a `div` holding the
feed heading and cards. It does **not** currently call `useDiscoverBoulders` — the
strip does that internally. Calling it here too costs no extra request: it is the same
TanStack Query key (`['discover_boulders', user?.id]`), so the two consumers share one
cached result.

- [ ] **Step 1: Render the section between the strip and the feed**

In `src/pages/DashboardPage.tsx`, add these imports:

```tsx
import { useDiscoverBoulders } from '../hooks/useDiscoverBoulders'
import { BetaRequestsSection } from '../components/BetaRequestsSection'
```

Add the hook call beside the existing ones:

```tsx
  // Same query key the strip uses, so this shares its cached result rather than
  // issuing a second request.
  const { data: boulders } = useDiscoverBoulders()
```

And render the section between the strip and the feed `div`:

```tsx
      <LatestProblemsStrip />

      <BetaRequestsSection requests={boulders?.betaRequests ?? []} />

      <div className="px-4 py-4 space-y-3">
```

The section returns `null` on an empty list, so there is nothing to guard here and no
layout gap when nobody is stuck.

- [ ] **Step 2: Verify build, lint and tests**

Run: `npm run build && npm run lint && npx vitest run`

Expected: build clean; lint at your measured baseline; all tests pass.

- [ ] **Step 3: Check it in the browser**

Run `npm run dev` and open `http://localhost:5173/dashboard`.

Confirm:
- With no open asks at your gyms, there is no "Someone's stuck" heading and no gap
  between the strip and the feed.
- With an open ask, the section sits between them, showing the asker, the boulder as
  colour + grade, the note if there is one, and the gym.
- Tapping a row opens that boulder's page.

If you have no open asks you cannot see the populated state — say so in your report
rather than manufacturing data.

- [ ] **Step 4: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "Show open beta requests on the homepage"
```

---

## Final verification

- [ ] `npm run build` — clean
- [ ] `npm run lint` — no new problems versus the baseline measured at the start
- [ ] `npx vitest run` — all tests pass, 9 more than before
- [ ] `git log --oneline -4` — four commits, one per task
- [ ] `grep -n "if (error) throw" src/hooks/useDiscoverBoulders.ts` — the help query
      and the asker-profile query must both still be absent from that list, so a
      missing table or a failed lookup cannot break the homepage

## Release gate

**None.** No migration, no SQL. `gym_problem_help.note` has been live since migration
059.

Unrelated but still open from earlier work: migrations **074** and then **075** are
pending in Supabase, and publishing a boulder fails until 075 is applied.
