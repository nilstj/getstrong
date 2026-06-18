# Friends Feed — Show Exercises Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface each friend's exercises (strength/conditioning work) in the friends feed summary table, detail sheet, and power rankings using the existing rolling 7-day window.

**Architecture:** Two files change — `useFriendsActivity.ts` adds a 3rd parallel Supabase query and extends both interfaces; `DashboardPage.tsx` adds one table column, one detail section, and one rankings category. No new files, no schema changes (exercises table already has `user_id` and `created_at`).

**Tech Stack:** React, TypeScript, Supabase (`@supabase/supabase-js`), TanStack Query (`@tanstack/react-query`), Tailwind CSS.

---

## File Map

| File | Change |
|------|--------|
| `src/hooks/useFriendsActivity.ts` | Extend `FriendWeeklySummary`, `FriendWeeklyDetail`; add exercises queries to both hooks |
| `src/pages/DashboardPage.tsx` | Add table column header, `FriendRow` cell, detail sheet section, power rankings category |

---

## Task 1: Extend `FriendWeeklySummary` and `useFriendsWeeklyActivity`

**Files:**
- Modify: `src/hooks/useFriendsActivity.ts`

- [ ] **Step 1: Add `exercises` field to `FriendWeeklySummary`**

Open `src/hooks/useFriendsActivity.ts`. The interface currently ends at `challengesCompleted`. Add one field:

```ts
export interface FriendWeeklySummary {
  userId: string
  problems: number
  sends: number
  challengeAttempts: number
  challengesCompleted: number
  exercises: number   // ← add this
}
```

- [ ] **Step 2: Add exercises query to `useFriendsWeeklyActivity`**

Inside `useFriendsWeeklyActivity`, the `queryFn` has this `Promise.all`:

```ts
const [problemsRes, attemptsRes] = await Promise.all([
  supabase
    .from('problems')
    .select('user_id, sent')
    .in('user_id', followingIds)
    .gte('created_at', sinceStr),
  supabase
    .from('challenge_attempts')
    .select('user_id, completed')
    .in('user_id', followingIds)
    .gte('created_at', sinceStr),
])
```

Replace it with:

```ts
const [problemsRes, attemptsRes, exercisesRes] = await Promise.all([
  supabase
    .from('problems')
    .select('user_id, sent')
    .in('user_id', followingIds)
    .gte('created_at', sinceStr),
  supabase
    .from('challenge_attempts')
    .select('user_id, completed')
    .in('user_id', followingIds)
    .gte('created_at', sinceStr),
  supabase
    .from('exercises')
    .select('user_id')
    .in('user_id', followingIds)
    .gte('created_at', sinceStr),
])
```

- [ ] **Step 3: Add error check and initialise `exercises` in summary**

After the existing error checks add:

```ts
if (exercisesRes.error) throw exercisesRes.error
```

In the initialisation loop change:

```ts
summary[id] = { userId: id, problems: 0, sends: 0, challengeAttempts: 0, challengesCompleted: 0 }
```

to:

```ts
summary[id] = { userId: id, problems: 0, sends: 0, challengeAttempts: 0, challengesCompleted: 0, exercises: 0 }
```

- [ ] **Step 4: Aggregate exercises and update filter + sort**

After the existing `for (const a of attemptsRes.data)` loop, add:

```ts
for (const e of exercisesRes.data) {
  if (summary[e.user_id]) {
    summary[e.user_id].exercises++
  }
}
```

Update the filter (currently `s.problems + s.challengeAttempts > 0`):

```ts
.filter(s => s.problems + s.challengeAttempts + s.exercises > 0)
```

Update the sort (currently sorts by `b.problems + b.challengeAttempts`):

```ts
.sort((a, b) => (b.problems + b.challengeAttempts + b.exercises) - (a.problems + a.challengeAttempts + a.exercises))
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useFriendsActivity.ts
git commit -m "feat: add exercises count to FriendWeeklySummary and weekly activity query"
```

---

## Task 2: Extend `FriendWeeklyDetail` and `useFriendWeeklyDetail`

**Files:**
- Modify: `src/hooks/useFriendsActivity.ts`

- [ ] **Step 1: Import `Exercise` type and extend `FriendWeeklyDetail`**

At the top of `src/hooks/useFriendsActivity.ts`, the existing import is:

```ts
import type { Problem } from '../types'
```

Change it to:

```ts
import type { Problem, Exercise } from '../types'
```

The `FriendWeeklyDetail` interface currently is:

```ts
export interface FriendWeeklyDetail {
  problems: Problem[]
  attempts: { id: string; completed: boolean; notes: string | null; challenges: { title: string } | null }[]
}
```

Add the exercises field:

```ts
export interface FriendWeeklyDetail {
  problems: Problem[]
  attempts: { id: string; completed: boolean; notes: string | null; challenges: { title: string } | null }[]
  exercises: Exercise[]
}
```

- [ ] **Step 2: Add exercises query to `useFriendWeeklyDetail`**

Inside `useFriendWeeklyDetail`, the `queryFn` has this `Promise.all`:

```ts
const [problemsRes, attemptsRes] = await Promise.all([
  supabase
    .from('problems')
    .select('*')
    .eq('user_id', userId!)
    .gte('created_at', sinceStr)
    .order('created_at', { ascending: false }),
  supabase
    .from('challenge_attempts')
    .select('id, completed, notes, challenges(title)')
    .eq('user_id', userId!)
    .gte('created_at', sinceStr)
    .order('created_at', { ascending: false }),
])
```

Replace with:

```ts
const [problemsRes, attemptsRes, exercisesRes] = await Promise.all([
  supabase
    .from('problems')
    .select('*')
    .eq('user_id', userId!)
    .gte('created_at', sinceStr)
    .order('created_at', { ascending: false }),
  supabase
    .from('challenge_attempts')
    .select('id, completed, notes, challenges(title)')
    .eq('user_id', userId!)
    .gte('created_at', sinceStr)
    .order('created_at', { ascending: false }),
  supabase
    .from('exercises')
    .select('*')
    .eq('user_id', userId!)
    .gte('created_at', sinceStr)
    .order('created_at', { ascending: false }),
])
```

- [ ] **Step 3: Add error check and include exercises in return value**

After the existing error checks add:

```ts
if (exercisesRes.error) throw exercisesRes.error
```

Update the return statement from:

```ts
return {
  problems: problemsRes.data as Problem[],
  attempts: attemptsRes.data as unknown as FriendWeeklyDetail['attempts'],
}
```

to:

```ts
return {
  problems: problemsRes.data as Problem[],
  attempts: attemptsRes.data as unknown as FriendWeeklyDetail['attempts'],
  exercises: exercisesRes.data as Exercise[],
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useFriendsActivity.ts
git commit -m "feat: add exercises to FriendWeeklyDetail and detail query"
```

---

## Task 3: Add "Exercises" column to the summary table

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Add the table header**

In `DashboardPage.tsx` find the `<thead>` block (around line 312). It currently ends with:

```tsx
<th className="text-center px-2 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Challenges</th>
```

Add after it:

```tsx
<th className="text-center px-2 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Exercises</th>
```

- [ ] **Step 2: Add the exercises cell to `FriendRow`**

In `FriendRow`, find the last `<td>` (the Challenges cell, around line 479). It ends with:

```tsx
      </td>
    </tr>
  )
}
```

Add a new `<td>` between the Challenges cell closing tag and `</tr>`:

```tsx
      <td className="text-center px-2 py-3">
        {friend.exercises > 0
          ? <span className="font-semibold text-gray-800">{friend.exercises}</span>
          : <span className="text-gray-300">—</span>}
      </td>
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors (TypeScript will confirm `friend.exercises` exists on `FriendWeeklySummary`).

- [ ] **Step 4: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat: add Exercises column to friends feed summary table"
```

---

## Task 4: Add exercises section to the friend detail sheet

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Add the exercises section after the Challenges block**

In `FriendDetailSheet`, find the closing `</div>` of the Challenges section (the one that ends around line 680 with `{/* Challenges */}`). After the entire Challenges `<div>` block add:

```tsx
          {/* Exercises */}
          <div>
            <p className="text-sm font-bold mb-2">
              Exercises
              <span className="text-gray-400 font-normal ml-1">({detail.exercises.length})</span>
            </p>
            {detail.exercises.length === 0 ? (
              <p className="text-sm text-gray-400">No exercises logged this week.</p>
            ) : (
              <div className="space-y-2">
                {detail.exercises.map(ex => (
                  <div key={ex.id} className="bg-gray-50 rounded-xl px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">{ex.name}</p>
                      <span className="text-xs bg-gray-200 text-gray-600 rounded-full px-2 py-0.5 flex-shrink-0">
                        {ex.type === 'reps' ? 'Reps' : 'Time'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {ex.type === 'reps'
                        ? [ex.sets != null && `${ex.sets} sets`, ex.reps != null && `${ex.reps} reps`].filter(Boolean).join(' × ')
                        : [ex.sets != null && `${ex.sets} sets`, ex.duration_seconds != null && `${ex.duration_seconds}s`].filter(Boolean).join(' × ')}
                      {ex.weight_kg != null && <span className="ml-1 text-gray-400">+{ex.weight_kg} kg</span>}
                    </p>
                    {ex.notes && <p className="text-xs text-gray-400 mt-0.5">{ex.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. TypeScript infers `ex` as `Exercise` from `FriendWeeklyDetail['exercises']`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat: add exercises section to friend detail sheet"
```

---

## Task 5: Add exercises category to Power Rankings

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Add `byExercises` sort and update grid**

In `PowerRankings`, find:

```tsx
  const byProblems = [...activity].sort((a, b) => b.problems - a.problems).slice(0, 3)
  const bySends = [...activity].sort((a, b) => b.sends - a.sends).filter(a => a.sends > 0).slice(0, 3)
  const byChallenges = [...activity].sort((a, b) => b.challengesCompleted - a.challengesCompleted).filter(a => a.challengesCompleted > 0).slice(0, 3)
```

Add after it:

```tsx
  const byExercises = [...activity].sort((a, b) => b.exercises - a.exercises).filter(a => a.exercises > 0).slice(0, 3)
```

- [ ] **Step 2: Change grid from 3 to 2 columns and add the category**

Find:

```tsx
      <div className="grid grid-cols-3 gap-2">
        {[
          { title: '🧗 Problems', list: byProblems, value: (f: FriendWeeklySummary) => f.problems },
          { title: '✅ Sends', list: bySends, value: (f: FriendWeeklySummary) => f.sends },
          { title: '🏆 Challenges', list: byChallenges, value: (f: FriendWeeklySummary) => f.challengesCompleted },
        ].map(cat => (
```

Replace with:

```tsx
      <div className="grid grid-cols-2 gap-2">
        {[
          { title: '🧗 Problems', list: byProblems, value: (f: FriendWeeklySummary) => f.problems },
          { title: '✅ Sends', list: bySends, value: (f: FriendWeeklySummary) => f.sends },
          { title: '🏆 Challenges', list: byChallenges, value: (f: FriendWeeklySummary) => f.challengesCompleted },
          { title: '💪 Exercises', list: byExercises, value: (f: FriendWeeklySummary) => f.exercises },
        ].map(cat => (
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat: add exercises category to weekly power rankings"
```

---

## Self-Review

**Spec coverage:**
- ✅ `FriendWeeklySummary.exercises: number` — Task 1
- ✅ Exercises query in `useFriendsWeeklyActivity` — Task 1
- ✅ Visibility filter includes exercises — Task 1, Step 4
- ✅ Sort includes exercises — Task 1, Step 4
- ✅ `FriendWeeklyDetail.exercises: Exercise[]` — Task 2
- ✅ Exercises query in `useFriendWeeklyDetail` — Task 2
- ✅ "Exercises" column header in summary table — Task 3
- ✅ `FriendRow` exercises cell with `—` for zero — Task 3
- ✅ Exercises section in detail sheet (both types, weight, notes, empty state) — Task 4
- ✅ `byExercises` ranking + grid-cols-2 — Task 5

**Placeholder scan:** No TBDs, no "similar to Task N", all code blocks complete.

**Type consistency:** `FriendWeeklySummary.exercises` defined in Task 1, consumed as `friend.exercises` in Task 3 and `f.exercises` in Task 5. `FriendWeeklyDetail.exercises` defined in Task 2, consumed as `detail.exercises` in Task 4. `Exercise` type imported in Task 2, inferred in Task 4. ✓
