# Crew Beta Streak Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the crew page's headline streak count weeks the crew **posted beta** instead of weeks its members merely showed up.

**Architecture:** The streak's arithmetic is already a tested-shaped pure function that takes a bag of ISO dates; only its *input* changes. A new hook supplies `boulder_beta` timestamps in place of session timestamps, and two labels change so the number explains itself. No migration.

**Tech Stack:** React 18 + TypeScript, Vite, React Query (array query keys), Supabase, `date-fns`, Tailwind, Vitest for pure utils.

**Spec:** [docs/superpowers/specs/2026-07-31-crew-beta-streak-design.md](../specs/2026-07-31-crew-beta-streak-design.md)

## Global Constraints

- **Vocabulary:** a *Crew* is the persistent invite-only training group at `/crews`. A *Sendtrain* is the per-boulder group. *Beta* is a first-class object on a shared boulder — a tip and/or video — not a comment. Do not swap these words in user-facing copy.
- **Build:** `npm run build` is `tsc -b && vite build`. `noUnusedLocals` and `noUnusedParameters` are ON — an unused local or import is a build-failing error. This plan touches no `api/` files.
- **Lint:** `npm run lint` has a baseline of pre-existing problems. **Measure it yourself before starting** (`npm run lint 2>&1 | grep problems`) and add **zero**. Do not trust a number quoted anywhere else.
- **Tests:** Vitest, and **only pure functions in `src/utils/`** are tested. There is no `@testing-library/react`. Hooks, components and pages are verified by `npm run build` plus a manual pass. Do not add hook or component tests.
- **No migration in this plan.** Do not create one; `boulder_beta` already exists (migration 052) and is readable by any authenticated user.
- **`weeklyStreak`'s logic must not change.** Only its doc comment, which currently names the wrong input.
- **Commit after every task.**

---

### Task 1: Cover `crewStreak` before repurposing it

`src/utils/crewStreak.ts` is the only pure util in `src/utils/` with no test file, and this plan changes what it measures. Lock its behaviour in first.

**Note on TDD here:** the function already exists and is **not** being modified, so these tests should **pass on their first run**. That is expected — they are characterization tests adding missing coverage, not red-green. If one fails, you have found a real bug in existing code: stop and report it rather than editing the test to match.

**Files:**
- Test: `src/utils/crewStreak.test.ts` (create)

**Interfaces:**
- Consumes: `weeklyStreak(dates: string[], now: Date): number` from `src/utils/crewStreak.ts`.
- Produces: nothing consumed by Task 2.

- [ ] **Step 1: Read the function you are covering**

Run: `cat src/utils/crewStreak.ts`

Note two things its doc comment promises, because both are tested below: the current week counts as **in-progress** (activity last week but not this week is still a streak, not a break), and dates in the future are ignored.

- [ ] **Step 2: Write the test file**

Create `src/utils/crewStreak.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { subWeeks, addWeeks } from 'date-fns'
import { weeklyStreak } from './crewStreak'

// Fixed reference point so the assertions never depend on the day the suite runs.
// subWeeks keeps the same weekday, so differenceInCalendarWeeks is exactly n.
const NOW = new Date('2026-07-31T12:00:00Z')
const weeksAgo = (n: number) => subWeeks(NOW, n).toISOString()

describe('weeklyStreak', () => {
  it('is zero with nothing to count', () => {
    expect(weeklyStreak([], NOW)).toBe(0)
  })

  it('counts this week alone as one', () => {
    expect(weeklyStreak([weeksAgo(0)], NOW)).toBe(1)
  })

  it('counts consecutive weeks back from this one', () => {
    expect(weeklyStreak([weeksAgo(0), weeksAgo(1), weeksAgo(2)], NOW)).toBe(3)
  })

  it('treats the current week as in progress rather than a break', () => {
    // Nothing yet this week, but last week and the one before were active.
    expect(weeklyStreak([weeksAgo(1), weeksAgo(2)], NOW)).toBe(2)
  })

  it('is zero when the most recent activity is too old to be in progress', () => {
    expect(weeklyStreak([weeksAgo(2), weeksAgo(3)], NOW)).toBe(0)
  })

  it('stops at the first gap', () => {
    expect(weeklyStreak([weeksAgo(0), weeksAgo(2), weeksAgo(3)], NOW)).toBe(1)
  })

  it('counts a week once however many dates land in it', () => {
    expect(weeklyStreak([weeksAgo(0), weeksAgo(0), weeksAgo(0)], NOW)).toBe(1)
  })

  it('ignores dates in the future', () => {
    expect(weeklyStreak([addWeeks(NOW, 1).toISOString()], NOW)).toBe(0)
  })
})
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run src/utils/crewStreak.test.ts`
Expected: PASS, 8 tests. A failure means existing behaviour differs from the doc comment — report it, do not adjust the expectations to match.

- [ ] **Step 4: Commit**

```bash
git add src/utils/crewStreak.test.ts
git commit -m "Cover crewStreak, the last untested pure util"
```

---

### Task 2: Feed the streak from beta, and say so

**Files:**
- Modify: `src/hooks/useCrews.ts` (add one hook, next to `useCrewActivityFeed` around line 237)
- Modify: `src/pages/CrewGroupPage.tsx` (the import list from `../hooks/useCrews`; the `on_fire` badge description at line 28; the streak computation at line 59; the header subtitle at line 84)
- Modify: `src/utils/crewStreak.ts` (doc comment only)

**Interfaces:**
- Consumes: `weeklyStreak(dates: string[], now: Date): number`; `boulder_beta` (migration 052) with `user_id uuid not null` and `created_at timestamptz not null`, readable by any authenticated user.
- Produces: `useCrewBetaWeeks(memberIds: string[])` → `UseQueryResult<string[]>`, the `created_at` timestamps of crew members' beta from the last 26 weeks.

- [ ] **Step 1: Add the hook**

In `src/hooks/useCrews.ts`, add this immediately **after** the `useCrewActivityFeed` function, whose conventions it deliberately mirrors:

```ts
/**
 * The weeks a crew posted beta, as raw timestamps for weeklyStreak to bucket.
 *
 * Bounded to the last 26 weeks for two reasons: a streak can only ever use recent
 * weeks, and boulder_beta is indexed on (gym_problem_id, created_at desc) rather
 * than on user_id, so an unbounded member filter would scan the table.
 */
export function useCrewBetaWeeks(memberIds: string[]) {
  return useQuery({
    queryKey: ['crew_beta_weeks', [...memberIds].sort().join(',')],
    enabled: memberIds.length > 0,
    queryFn: async (): Promise<string[]> => {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 26 * 7)
      const { data, error } = await supabase
        .from('boulder_beta')
        .select('created_at')
        .in('user_id', memberIds)
        .gte('created_at', cutoff.toISOString())
        .order('created_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as { created_at: string }[]).map(r => r.created_at)
    },
  })
}
```

- [ ] **Step 2: Point the streak at it**

In `src/pages/CrewGroupPage.tsx`, add `useCrewBetaWeeks` to the existing named import from `'../hooks/useCrews'` — it is a long multi-line import; put it beside `useCrewActivityFeed`.

Then add the hook call next to the other data hooks near the top of the component, beside the existing `useCrewActivityFeed` call:

```ts
  const { data: betaWeeks = [] } = useCrewBetaWeeks(memberIds)
```

And change the streak line (currently `const streak = weeklyStreak(feed.map(f => f.date), new Date())`) to:

```ts
  const streak = weeklyStreak(betaWeeks, new Date())
```

**Leave `useCrewActivityFeed` and its `feed` variable in place** — the Crew feed section further down still renders from it. It just stops driving the streak. Removing it would break that section and fail the build on an unused variable.

- [ ] **Step 3: Make both labels tell the truth**

Still in `src/pages/CrewGroupPage.tsx`:

The header subtitle currently ends with:

```tsx
{streak > 0 ? ` · 🔥 ${streak}-week streak` : ''}
```

Change it to:

```tsx
{streak > 0 ? ` · 🔥 ${streak}-week beta streak` : ''}
```

The word *beta* is load-bearing. Without it, a number that just dropped for most crews looks broken rather than changed. Keep the `streak > 0` guard exactly as it is — a crew with no beta shows no streak rather than a zero.

Then in the `CREW_BADGES` array, change the `on_fire` entry's `desc` from `'4-week active streak'` to `'4 weeks running with beta'`. Leave its `key`, `emoji`, `label` and the `streak >= 4` threshold alone.

- [ ] **Step 4: Correct the util's doc comment**

In `src/utils/crewStreak.ts`, the doc comment's second line currently reads:

```
 * `dates` are ISO timestamps of crew activity (member sessions). The current
```

That parenthetical is now wrong. Change that line to:

```
 * `dates` are ISO timestamps of the activity being counted — the crew's beta
 * posts. The current
```

so the sentence continues into the existing `week counts as in-progress:` text. **Change nothing else in this file** — the function's logic is deliberately untouched, and Task 1's tests must still pass unchanged.

- [ ] **Step 5: Verify build, tests and lint**

Run: `npm run build`
Expected: exit 0. An unused-variable error on `feed` means Step 2 removed the activity-feed call it was told to keep.

Run: `npx vitest run`
Expected: all pass, including Task 1's 8 — the util's behaviour did not change, only its comment.

Run: `npm run lint 2>&1 | grep problems`
Expected: the count you measured before starting.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useCrews.ts src/pages/CrewGroupPage.tsx src/utils/crewStreak.ts
git commit -m "Count the crew streak in weeks of beta, not weeks of attendance"
```

---

## Release gate

None. No migration, so this ships on its own. The outstanding queue from earlier work is untouched and still **074 → 075 → 076 → 077 → 078**, with 076 and 077 applied together and 074 never re-run after 076.

## Manual verification pass

- [ ] On a crew whose members posted beta in each of the last few weeks, the header reads `🔥 n-week beta streak` with n matching those weeks.
- [ ] On a crew that has posted no beta, no streak appears in the header at all and the **On Fire** badge is absent.
- [ ] A crew whose members posted beta last week but not yet this week still shows a streak — the current week is in progress, not a break.
- [ ] The **Crew feed** section still lists members' sessions exactly as before.
- [ ] The On Fire badge's tooltip reads `4 weeks running with beta`.
- [ ] Expect most crews' streaks to drop, many to zero. That is the intended effect of the change, not a fault.
