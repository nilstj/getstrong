# Friends Feed — Show Exercises (Last 7 Days)

**Date:** 2026-06-15  
**Status:** Approved

## Summary

Add `Exercise` activity to the friends feed alongside the existing Problems and Challenges columns. Exercises (strength/conditioning work: sets/reps/weight/duration) are currently only viewable per-session in SessionDetailPage. This change surfaces them in the social feed with a rolling 7-day window — matching the existing feed time range.

## Scope

- **Time range:** Rolling 7 days (same as problems and challenges — uses `created_at >= now - 7 days`)
- **Where it appears:** Summary table column + friend detail sheet section + Power Rankings
- **No new files:** All changes land in `useFriendsActivity.ts` and `DashboardPage.tsx`

---

## Data Layer — `src/hooks/useFriendsActivity.ts`

### `FriendWeeklySummary` interface

Add one field:

```ts
exercises: number
```

### `useFriendsWeeklyActivity`

Add a 3rd parallel query to the existing `Promise.all`:

```ts
supabase
  .from('exercises')
  .select('user_id')
  .in('user_id', followingIds)
  .gte('created_at', sinceStr)
```

- Initialize `summary[id].exercises = 0` alongside the existing fields.
- Aggregate: `summary[e.user_id].exercises++` for each result row.
- **Visibility filter:** Update to include friends with exercises — `s.problems + s.challengeAttempts + s.exercises > 0`
- **Sort:** Include exercises in activity total — `(b.problems + b.challengeAttempts + b.exercises) - (a.problems + a.challengeAttempts + a.exercises)`

### `FriendWeeklyDetail` interface

Add one field:

```ts
exercises: Exercise[]
```

Import `Exercise` from `'../types'`.

### `useFriendWeeklyDetail`

Add a 3rd parallel query:

```ts
supabase
  .from('exercises')
  .select('*')
  .eq('user_id', userId!)
  .gte('created_at', sinceStr)
  .order('created_at', { ascending: false })
```

Return shape becomes:

```ts
{
  problems: problemsRes.data as Problem[],
  attempts: attemptsRes.data as ...,
  exercises: exercisesRes.data as Exercise[],
}
```

---

## Summary Table — `DashboardPage.tsx`

### Table header

Add a 5th `<th>` after "Challenges":

```
Exercises
```

Same styling as existing headers (`text-center px-2 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider`).

### `FriendRow` component

Add a 5th `<td>` after the Challenges cell:

```tsx
<td className="text-center px-2 py-3">
  {friend.exercises > 0
    ? <span className="font-semibold text-gray-800">{friend.exercises}</span>
    : <span className="text-gray-300">—</span>}
</td>
```

---

## Detail Sheet — `FriendDetailSheet`

Add a 3rd section after the Challenges block:

**Header:** `Exercises ({detail.exercises.length})`

**Empty state:** `"No exercises logged this week."`

**Exercise card** (`bg-gray-50 rounded-xl px-3 py-2.5`):

```
[Name]                          [Reps / Time badge]
3 × 8                           +20 kg
[notes if present]
```

- For `type === 'reps'`: show `{sets} × {reps}` (omit sets/reps if null)
- For `type === 'time'`: show `{sets} × {duration_seconds}s` (omit sets/duration if null)
- Weight: show `+{weight_kg} kg` if set
- Notes: small gray text below if present
- Badge: `bg-gray-200 text-gray-600 rounded-full px-2 py-0.5 text-xs` with label `Reps` or `Time`

---

## Power Rankings — `PowerRankings` component

The grid changes from `grid-cols-3` to `grid-cols-2`.

Add a 4th category:

```ts
{ title: '💪 Exercises', list: byExercises, value: (f) => f.exercises }
```

Where `byExercises = [...activity].sort((a, b) => b.exercises - a.exercises).filter(a => a.exercises > 0).slice(0, 3)`.

---

## What Is Not Changing

- Time range logic — stays at rolling 7 days (`created_at`), consistent with problems/challenges
- Session wisdom (14-day window) — untouched
- Wall announcements — untouched
- No new Supabase tables, RLS policies, or migrations needed (exercises table already exists with `user_id` and `created_at`)
