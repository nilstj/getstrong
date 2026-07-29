# Beta in the home feed

Date: 2026-07-29

## Problem

The homepage is the app's biggest surface and it measures ticks. `FriendSessionCard`
shows an avatar, gym, date, an `up to 6C` chip, **`N problems · N sent`** in bold, a
video count and a photo grid. Not one element carries beta, a question, or anything
learned. For an app whose stated purpose is helping climbers learn movement — "make
the beta the hero, not the tick" — the first screen is a scoreboard.

The fix is mostly already built and wired to nothing:

- `src/hooks/useCrewFeed.ts` (43 lines) and `src/components/FeedCard.tsx` (75 lines)
  are referenced by **no** file in `src/`.
- `get_crew_feed` (migration 072, live) already returns `beta_id`, `beta_snippet`
  and `beta_video_url` beside the actor and boulder, and `FeedCard` already has the
  copy — `beta_added: 'shared beta on'`, `beta_worked: 'nailed the beta on'`.

The homepage previously *was* this crew feed and was deliberately replaced with
friends' sessions. So this work **interleaves** beta events into the session feed
rather than swapping back — the sessions stay.

## Decisions

| Decision | Choice |
|---|---|
| Which events | **`beta_added` and `beta_worked` only.** `send` duplicates the session cards' "N sent"; `boulder_new` duplicates the Latest Gym Problems strip directly above. |
| Scope | **Gym-scoped, unfiltered.** `get_crew_feed` derives `my_gyms` from the gyms on your own problems, so beta from any climber at your gyms appears, follow or not. That is how beta actually spreads. Session cards stay follow-only, so the homepage reads as "my people's sessions + my gyms' knowledge". |
| Ordering | One merged stream, newest first, by timestamp. |
| Pagination | **None**, matching today's homepage. One page of `useCrewFeed` (20 events) merged with the session list. |
| Beta query failure | **Non-fatal.** Beta events degrade to none; the session query keeps driving the page's loading and error states, as it does today. Same treatment `useDiscoverBoulders` gives its help query. |
| Empty state | "No friend activity yet" shows only when **both** sources are empty. |

### Why the timestamps merge cleanly

`FriendSessionSummary.date` looks like a date but is the **maximum `created_at`** of
the session's problems (`friendSessions.ts:66`) — a full ISO timestamp. `FeedEvent.
event_at` is a timestamptz rendered as ISO. Both compare lexically, so a single
descending sort is correct with no date/timestamp coercion.

### Two states that need care

**A user with no follows still gets beta.** `useFriendsFeed` is
`enabled: followingIds.length > 0`, so a climber who follows nobody runs no session
query at all — but they may well have beta events at their gym. The empty state must
therefore key on both sources being empty, not on `sessions.length === 0`.

**A user who has logged nothing gets no beta.** `my_gyms` comes from
`problems.gym where user_id = auth.uid()`, so someone who has not yet logged a
problem has no gyms and sees no beta events, however busy their gym is. Accepted for
v1; the fix is to union `profiles.default_gyms` into `my_gyms`, which is a migration
and therefore a release gate — deliberately not bundled here.

## The merge is a pure function

The only logic worth testing is the merge, so it goes in `src/utils/homeFeed.ts` and
is unit-tested — the project's convention, and the reason it isn't inlined into the
page:

```ts
export type HomeFeedItem =
  | { kind: 'session'; at: string; session: FriendSession }
  | { kind: 'beta'; at: string; event: FeedEventEnriched }

/**
 * Newest-first merge of friends' sessions and gym beta events. Filters the feed
 * down to beta: `send` would double-report the session cards and `boulder_new`
 * duplicates the story strip above.
 */
export function mergeHomeFeed(
  sessions: FriendSession[],
  events: FeedEventEnriched[],
): HomeFeedItem[]
```

Ties break deterministically — a session before a beta event at the same instant —
so the list never reorders between renders on equal timestamps.

## Rendering

`DashboardPage` gains `useCrewFeed()` beside `useFriendsFeed()`, merges, and renders
one list: `FriendSessionCard` for `kind: 'session'`, `FeedCard` for `kind: 'beta'`.

`useCrewFeed` is an `useInfiniteQuery`; the page reads `data?.pages.flat() ?? []` and
never calls `fetchNextPage`. Reusing it unchanged beats adding a second hook against
the same RPC.

`FeedCard` needs two things from the call site: `actorName` is typed `string` while
`useCrewFeed` yields `string | null`, so pass `?? 'Someone'` — the fallback the rest
of the app uses; and `onOpen` navigates to `/gym-problems/:gym_problem_id`, the same
destination the story strip uses. Its optional `children` slot stays empty.

### One copy decision inside FeedCard

`FeedCard`'s title is `event.boulder_name || 'a boulder'`, written when boulders had
names. Names were removed from this app, so `boulder_name` is now **always null** and
every card reads "shared beta on **a boulder**". The card already shows the grade and
gym on its meta line and the grade and colour over the image, so the information is
present — the title is just weak.

Change it to the colour and grade when available ("shared beta on the **blue 6C**"),
and drop the now-duplicated grade from the meta line, leaving the gym. This is a copy
change to a component this work is reviving rather than scope creep; it is called out
here so it can be vetoed.

## Files

| File | Change |
|---|---|
| `src/utils/homeFeed.ts` | New. `HomeFeedItem` and `mergeHomeFeed`. |
| `src/utils/__tests__/homeFeed.test.ts` | New. Covers ordering, the event-type filter, either side empty, both empty, and the tie-break. |
| `src/pages/DashboardPage.tsx` | Add `useCrewFeed`, merge, render both card types, fix the empty state. |
| `src/components/FeedCard.tsx` | Title from colour + grade; drop the duplicated grade from the meta line. |

No migration. No new RPC. No change to `useCrewFeed`, `useFriendsFeed` or
`FriendSessionCard`.

## Out of scope

- Pagination or infinite scroll on the merged feed.
- Reactions or comments inline on a feed card — engagement stays on the boulder page,
  as decided when the feed was first built.
- Extending `my_gyms` to `default_gyms` (a migration).
- `boulder_new` and `send` events, per the decisions table.
- The asking-for-beta row, considered alongside this and not chosen.

## Verification

- `npm run build`, `npm run lint` (measure the baseline first), `npx vitest run`.
- `mergeHomeFeed`'s tests are the real coverage; the page itself is verified by build
  and a manual pass.
- Manually: a homepage showing both card types in date order; a beta card opening the
  right boulder; a beta event from a climber you don't follow appearing; and — with
  the beta query forced to fail — the session feed still rendering.
