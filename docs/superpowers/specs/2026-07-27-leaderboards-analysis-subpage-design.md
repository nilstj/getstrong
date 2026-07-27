# Leaderboards move to an Analysis subpage

Date: 2026-07-27

## Problem

The shared boulder page (`/gym-problems/:id`, rendered by `CrewPage.tsx`) carries two
gym-wide leaderboards in its crew tab: a monthly beta-points board and an all-time
grade score. Neither is about the boulder you are looking at — they are gym
statistics that happen to be displayed there because the boulder supplied the gym
name. They also make every boulder view pay for `useGymGradeLeaderboard`, which
fetches every sent problem for the gym.

Both boards move to a new subpage under Analysis, where gym-wide stats belong.

## Decisions

| Decision | Choice |
|---|---|
| Location | New route `/analysis/leaderboards`, entered from a nav row on Analysis |
| Gym selection | Chips from `profile.default_gyms`, first preselected; `⌄` opens the full gym list |
| Board order | Beta points first, grade score second — learning is the app's focus |
| Period | Both boards monthly, with a month stepper you can page backwards through |
| Grade-score month source | `problems.created_at` (log time), not the session's climb date |
| Board length | Top 10, tie-inclusive |
| Entry card | Static nav row — no data fetched on Analysis |
| Boulder page | Both blocks deleted outright, no replacement link |

## GUI

### Analysis (`/analysis`)

A nav row directly below the stat card and above the AI Coaching button, reusing
the `/gym-grading` row pattern from `ProfilePage.tsx:319-327`:

```
┌──────────────────────────────────┐
│  61%       128        210        │
│  Rate      Sends      Problems   │
└──────────────────────────────────┘
┌──────────────────────────────────┐
│ 🏆  Leaderboards             ›   │
│     Beta points & grade score    │
└──────────────────────────────────┘
[  ✨ Get AI Coaching  ]
```

The 🏆 is lucide's `Trophy` at `size={18} className="text-sage-700"`, matching the
`Shield` in the row this pattern is copied from. The two section headings on the
subpage keep the `Trophy size={15} className="text-amber-500"` they have today.

### Leaderboards (`/analysis/leaderboards`)

```
←                              🔔     ← AppBar already renders back on subroutes

Leaderboards

┌──────────────┬─────────────┬───────┐
│● Boulders Oslo│ Klatreverket│  ⌄    │
└──────────────┴─────────────┴───────┘
╭──────────────────────────────────╮
│ ‹        July 2026            ›  │   ← › disabled on the current month
╰──────────────────────────────────╯

🏆 Beta points
   helping others through a boulder
┌──────────────────────────────────┐
│  1   ola                      31 │
│ ●2   you                      22 │
│  3   anna 🔧                  14 │
│  4   kari                     12 │
│  4   per                      12 │
│  …  through rank 10              │
└──────────────────────────────────┘
                       top 10 of 14

🏆 Grade score
   colour points for boulders sent this month
┌──────────────────────────────────┐
│  1   anna 🔧                  48 │
│  2   ola                      37 │
│ ●3   you                      31 │
│  …  through rank 10              │
└──────────────────────────────────┘
```

The page has no in-page back chevron: `AppBar` already renders one for every route
outside `TOP_LEVEL_PATHS`, and `/analysis/leaderboards` is not top-level.

Entry rows are the markup currently at `CrewPage.tsx:588-599` — rank, name with
`SetterBadge`, points, `bg-sage-50 border-sage-200` on the signed-in user's row.
No avatars, matching today.

### Boulder page (`/gym-problems/:id`)

The crew tab ends after the member list. `CrewPage.tsx:579-627` is deleted along
with the `useGymLeaderboard` / `useGymGradeLeaderboard` / `cycleMonth` imports, the
two hook calls, and the `month` const. `Trophy` is used only at lines 582 and 607,
both inside the removed block, so it comes out of the lucide import too.

## Data

No migration. No SQL. No RLS change.

`useGymLeaderboard(gym, cycleMonth)` already takes a month and needs no change.

`useGymGradeLeaderboard` gains a month parameter:

```ts
useGymGradeLeaderboard(gym: string, month: string)   // month is 'YYYY-MM'
```

- Query key becomes `['grade_leaderboard', gym, month]`.
- The `problems` select gains `.gte('created_at', <month start>)` and
  `.lt('created_at', <next month start>)`, both UTC ISO timestamps derived from
  `month`.
- The existing `.range(0, 99999)` cap and its comment stay. A month of one gym's
  sends is far below it; keeping the cap keeps any future truncation non-silent.

### Why `created_at` and not the session date

`problems` is readable by every authenticated user
(`015_social_read_policies.sql`), but `sessions` is not — `032_session_wisdom.sql`
restricts it to your own sessions plus shared-wisdom sessions of people you follow.
Joining `sessions` to get the true climb date would silently drop other climbers'
rows and quietly produce a wrong leaderboard, so the month is taken from
`problems.created_at`.

The cost, accepted: a boulder climbed July 31 but logged August 1 counts for
August, and editing a session's date does not move its problems between months.
If this becomes a real complaint, the fix is a security-definer RPC that joins
`sessions` server-side — a migration, deliberately deferred.

Side effect worth noting: the gym-wide problem fetch now runs only when someone
opens the leaderboards page, and covers one month instead of all time. Today it
runs on every gym-problem view over the gym's entire history.

## New pure utils

Both go in `src/utils/leaderboard.ts` beside `cycleMonth` and `rankEntries`, and
both get tests in `src/utils/__tests__/leaderboard.test.ts`:

```ts
/** Shift a 'YYYY-MM' cycle month by whole months. shiftMonth('2026-01', -1) === '2025-12' */
export function shiftMonth(month: string, delta: number): string

/**
 * Entries whose competition rank is within `limit`. Tie-inclusive: three climbers
 * tied at rank 10 all appear, so the result can exceed `limit`. Never cuts one
 * member of a tie while showing another on the same points.
 */
export function topEntries(entries: LeaderboardEntry[], limit: number): LeaderboardEntry[]
```

`topEntries` filters on `rank <= limit` rather than slicing, which is what makes it
tie-inclusive. The `top 10 of N` footer uses the unsliced `entries.length` and only
renders when that exceeds what is shown.

## Components

| File | Change |
|---|---|
| `src/components/LeaderboardList.tsx` | New. Props: `entries`, `currentUserId`, `limit`, `emptyLabel`. Renders the ranked rows, the empty label, and the `top N of M` footer. Used twice. |
| `src/pages/LeaderboardsPage.tsx` | New. Gym chips, month stepper, two `LeaderboardList` sections. |
| `src/App.tsx` | Add `<Route path="/analysis/leaderboards" element={<LeaderboardsPage />} />` inside the protected block. |
| `src/pages/AnalysisPage.tsx` | Add the nav row (`Trophy` from lucide-react, `Link` from react-router-dom). |
| `src/pages/CrewPage.tsx` | Remove lines 579-627 and the imports/hooks/const they were the only consumers of. |
| `src/hooks/useGradeLeaderboard.ts` | Add the `month` parameter and date filter. |
| `src/utils/leaderboard.ts` | Add `shiftMonth` and `topEntries`. |

`LeaderboardsPage` state: `gym` (mirrored to the `?gym=` search param so the page
is linkable and survives reload) and `month` (component state, initialised to
`cycleMonth(new Date())`, not in the URL).

The `⌄` chip toggles a text input with a `datalist` fed by `useGymSuggestions()`,
the same control `GymGradingPage` uses. Choosing a gym that isn't a default adds it
as a temporary chip for that visit.

## States

| Situation | Rendering |
|---|---|
| No `default_gyms` | No chips. The gym input shows expanded, with "Pick a gym to see its leaderboards." in place of both boards. |
| Gym has no `gym_gradings` rows | Grade-score board shows "No grading set up for this gym yet." Today it renders nothing at all. |
| Gym has grading but nobody scored this month | "No sends scored this month." |
| No beta points this month | "No points yet this month." |
| Loading | Section headers stay, a short skeleton fills the list, so switching gym or month doesn't shift the layout. |
| Forward stepper on the current month | `›` disabled and greyed; no future months. |

Each board is independent — one can be empty while the other has entries, and the
page never blanks out entirely.

## Out of scope

- Any migration or RPC. The whole change is client-side.
- Month scoping for beta points beyond what exists — `beta_points.cycle_month` is
  already monthly.
- Avatars in leaderboard rows.
- Medals or podium styling for the top three.
- A rank teaser on the Analysis nav row. It would make Analysis pay for the
  gym-wide grade query on every load, which is the cost this change removes.
- Cross-gym or all-gyms combined leaderboards.

## Verification

- `npm run build` — `tsc -b` runs with `noUnusedLocals`, which will catch any
  import left behind by the `CrewPage` deletion.
- `npm run lint` — must stay at the baseline of 17 problems.
- `npm test` — covers `shiftMonth`, `topEntries`, and the existing ranking utils.
- Manually: open `/analysis/leaderboards`, switch gyms, page a month back, confirm
  a gym with no grading shows the empty label, and confirm the boulder page's crew
  tab ends after the member list.
