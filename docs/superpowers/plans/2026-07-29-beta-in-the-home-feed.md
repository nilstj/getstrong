# Beta in the Home Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Interleave gym beta events into the homepage's friends-session feed, so the app's biggest surface carries knowledge rather than only ticks.

**Architecture:** A tested pure function merges two already-existing sources — `useFriendsFeed`'s session summaries and `useCrewFeed`'s gym events — into one newest-first list of tagged items, filtering the events down to beta. `DashboardPage` renders `FriendSessionCard` or `FeedCard` per item. Both the hook and the card already exist and are currently wired to nothing; no migration, no new query, no change to either hook.

**Tech Stack:** React 19, TypeScript, TanStack Query v5 (`useQuery` + `useInfiniteQuery`), Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-29-beta-in-the-home-feed-design.md`

## Global Constraints

- **Only `beta_added` and `beta_worked` events are shown.** `send` would double-report the session cards' "N sent"; `boulder_new` duplicates the Latest Gym Problems strip directly above the feed. The filter lives in the pure merge function so it is covered by tests.
- **Beta events are gym-scoped and deliberately not filtered to people you follow.** `get_crew_feed` derives its gyms from your own problems, so beta from any climber at your gyms appears. Do not add a follow filter.
- **No pagination.** The page reads only the first page of `useCrewFeed` and never calls `fetchNextPage`. Do not add a load-more control.
- **A failing beta query must not break the page.** The session query keeps driving loading and error states exactly as it does today; beta events degrade to an empty list. Do not add a second error branch.
- **The empty state must key on both sources being empty**, not on `sessions.length === 0`. A climber who follows nobody runs no session query at all (`useFriendsFeed` is `enabled: followingIds.length > 0`) but may still have beta events.
- **Timestamps are directly comparable.** `FriendSessionSummary.date` is not a date — it is the maximum `created_at` of the session's problems (`src/utils/friendSessions.ts:66`), a full ISO string, and `FeedEvent.event_at` is an ISO timestamptz. Compare them as strings; do not construct `Date` objects to sort.
- **No migration, no SQL, no new RPC.** If you find yourself writing a `.sql` file you have misread the plan.
- **`npm run build` must pass** (`tsc -b` with `noUnusedLocals`).
- **`npm run lint` must not add problems. Measure the baseline yourself first** and report both numbers.
- **`npx vitest run` was 141 tests across 17 files** before this work; confirm that yourself and report the new counts.
- **Only pure functions in `src/utils/` get tests.** This project has no `@testing-library/react`; do not test the page or the card, and do not add test tooling.
- **Tailwind classes only.** No inline `style` attributes, no CSS files. (`FeedCard` already uses one inline `backgroundImage` for a user avatar URL — that is pre-existing and correct, since a URL cannot be a utility class.)

---

## File Structure

| File | Responsibility |
|---|---|
| `src/utils/homeFeed.ts` | *(create)* `HomeFeedItem` union and `mergeHomeFeed` — the event-type filter and the newest-first ordering. The only logic in this feature. |
| `src/utils/__tests__/homeFeed.test.ts` | *(create)* Tests for ordering, the filter, either side empty, both empty, and the tie-break. |
| `src/components/FeedCard.tsx` | *(modify)* Title from colour + grade instead of the always-null `boulder_name`; drop the duplicated grade from the meta line. |
| `src/pages/DashboardPage.tsx` | *(modify)* Add `useCrewFeed`, merge, render both card types, fix the empty state. |

Task order: the tested util first (nothing depends on it yet), then the card's copy fix in isolation, then the page that composes both.

---

### Task 1: The merge function

**Files:**
- Create: `src/utils/homeFeed.ts`
- Test: `src/utils/__tests__/homeFeed.test.ts`

**Interfaces:**
- Consumes: `FriendSession` from `src/hooks/useFriendsFeed.ts` and `FeedEventEnriched` from `src/hooks/useCrewFeed.ts`, both exported already.
- Produces:
  - `export type HomeFeedItem = { kind: 'session'; at: string; session: FriendSession } | { kind: 'beta'; at: string; event: FeedEventEnriched }`
  - `export function mergeHomeFeed(sessions: FriendSession[], events: FeedEventEnriched[]): HomeFeedItem[]`

  Task 3 renders the result by switching on `kind`.

The two input shapes, already defined — do not redeclare them:

```ts
// src/hooks/useFriendsFeed.ts
type FriendSession = FriendSessionSummary & { authorName: string | null; authorAvatarUrl: string | null }
// FriendSessionSummary: { sessionId, userId, gym, date, problemCount, sendCount,
//                         challengeCount, topGrade, photos, videoCount }

// src/hooks/useCrewFeed.ts
type FeedEventEnriched = FeedEvent & { actorName: string | null; actorAvatarUrl: string | null }
// FeedEvent: { event_type, event_at, actor_id, gym_problem_id, boulder_name,
//              boulder_color, boulder_hold_color, boulder_grade,
//              boulder_image_url, gym, beta_id, beta_snippet, beta_video_url }
// event_type is 'boulder_new' | 'send' | 'beta_added' | 'beta_worked'
```

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/homeFeed.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mergeHomeFeed } from '../homeFeed'
import type { FriendSession } from '../../hooks/useFriendsFeed'
import type { FeedEventEnriched } from '../../hooks/useCrewFeed'

function session(sessionId: string, date: string): FriendSession {
  return {
    sessionId, userId: 'u1', gym: 'Boulders Oslo', date,
    problemCount: 3, sendCount: 2, challengeCount: 0, topGrade: '6C',
    photos: [], videoCount: 0, authorName: 'ola', authorAvatarUrl: null,
  }
}

function event(
  event_type: FeedEventEnriched['event_type'],
  event_at: string,
  gym_problem_id = 'gp1',
): FeedEventEnriched {
  return {
    event_type, event_at, actor_id: 'a1', gym_problem_id,
    boulder_name: null, boulder_color: 'blue', boulder_hold_color: 'Red',
    boulder_grade: '6C', boulder_image_url: null, gym: 'Boulders Oslo',
    beta_id: 'b1', beta_snippet: 'heel hook', beta_video_url: null,
    actorName: 'kari', actorAvatarUrl: null,
  }
}

describe('mergeHomeFeed', () => {
  it('orders both kinds newest first', () => {
    const merged = mergeHomeFeed(
      [session('s1', '2026-07-20T10:00:00Z'), session('s2', '2026-07-18T10:00:00Z')],
      [event('beta_added', '2026-07-19T10:00:00Z')],
    )
    expect(merged.map(i => i.at)).toEqual([
      '2026-07-20T10:00:00Z',
      '2026-07-19T10:00:00Z',
      '2026-07-18T10:00:00Z',
    ])
    expect(merged.map(i => i.kind)).toEqual(['session', 'beta', 'session'])
  })

  it('keeps only beta events', () => {
    const merged = mergeHomeFeed([], [
      event('beta_added', '2026-07-20T10:00:00Z'),
      event('send', '2026-07-19T10:00:00Z'),
      event('boulder_new', '2026-07-18T10:00:00Z'),
      event('beta_worked', '2026-07-17T10:00:00Z'),
    ])
    expect(merged).toHaveLength(2)
    expect(merged.map(i => i.kind === 'beta' && i.event.event_type)).toEqual([
      'beta_added', 'beta_worked',
    ])
  })

  it('carries the session through untouched', () => {
    const s = session('s1', '2026-07-20T10:00:00Z')
    const [item] = mergeHomeFeed([s], [])
    expect(item).toEqual({ kind: 'session', at: '2026-07-20T10:00:00Z', session: s })
  })

  it('carries the event through untouched', () => {
    const e = event('beta_added', '2026-07-20T10:00:00Z')
    const [item] = mergeHomeFeed([], [e])
    expect(item).toEqual({ kind: 'beta', at: '2026-07-20T10:00:00Z', event: e })
  })

  it('works with either side empty', () => {
    expect(mergeHomeFeed([session('s1', '2026-07-20T10:00:00Z')], [])).toHaveLength(1)
    expect(mergeHomeFeed([], [event('beta_added', '2026-07-20T10:00:00Z')])).toHaveLength(1)
  })

  it('returns empty for no input', () => {
    expect(mergeHomeFeed([], [])).toEqual([])
  })

  it('puts the session first on an identical timestamp, deterministically', () => {
    const at = '2026-07-20T10:00:00Z'
    const once = mergeHomeFeed([session('s1', at)], [event('beta_added', at)])
    const twice = mergeHomeFeed([session('s1', at)], [event('beta_added', at)])
    expect(once.map(i => i.kind)).toEqual(['session', 'beta'])
    expect(twice.map(i => i.kind)).toEqual(once.map(i => i.kind))
  })

  it('drops a beta event with no timestamp rather than sorting it to the top', () => {
    const merged = mergeHomeFeed([session('s1', '2026-07-20T10:00:00Z')], [
      { ...event('beta_added', ''), event_at: '' },
    ])
    expect(merged.map(i => i.kind)).toEqual(['session'])
  })
})
```

That last test is the one worth understanding: an empty timestamp string sorts
*above* every real ISO string in a descending string comparison, so a malformed
event would silently pin itself to the top of the homepage. Dropping it is the
safe behaviour.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/homeFeed.test.ts`

Expected: FAIL — the suite cannot resolve `../homeFeed`, reporting something like
`Failed to load url ../homeFeed` or `No "mergeHomeFeed" export is defined`.

- [ ] **Step 3: Implement the merge**

Create `src/utils/homeFeed.ts`:

```ts
import type { FriendSession } from '../hooks/useFriendsFeed'
import type { FeedEventEnriched } from '../hooks/useCrewFeed'

/** One entry in the home feed: a friend's session, or beta at one of your gyms. */
export type HomeFeedItem =
  | { kind: 'session'; at: string; session: FriendSession }
  | { kind: 'beta'; at: string; event: FeedEventEnriched }

/**
 * Newest-first merge of friends' sessions and gym beta events.
 *
 * Only beta events survive the filter: `send` would double-report the session
 * cards, which already say "N sent", and `boulder_new` duplicates the Latest Gym
 * Problems strip directly above the feed.
 *
 * Both timestamps are full ISO strings — `FriendSessionSummary.date` is the max
 * created_at of the session's problems, not a date — so they compare directly and
 * need no Date construction. Items with an empty timestamp are dropped: '' sorts
 * above every real ISO string, so a malformed row would pin itself to the top.
 */
export function mergeHomeFeed(
  sessions: FriendSession[],
  events: FeedEventEnriched[],
): HomeFeedItem[] {
  const items: HomeFeedItem[] = [
    ...sessions
      .filter(s => !!s.date)
      .map((session): HomeFeedItem => ({ kind: 'session', at: session.date, session })),
    ...events
      .filter(e => (e.event_type === 'beta_added' || e.event_type === 'beta_worked') && !!e.event_at)
      .map((event): HomeFeedItem => ({ kind: 'beta', at: event.event_at, event })),
  ]

  // Sessions before beta on an exact tie, so equal timestamps never reorder
  // between renders.
  return items.sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? 1 : -1
    if (a.kind === b.kind) return 0
    return a.kind === 'session' ? -1 : 1
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/homeFeed.test.ts`

Expected: PASS, 8 tests.

- [ ] **Step 5: Run the full suite and the build**

Run: `npx vitest run && npm run build`

Expected: every test file passes (141 pre-existing plus your 8); build clean.

- [ ] **Step 6: Commit**

```bash
git add src/utils/homeFeed.ts src/utils/__tests__/homeFeed.test.ts
git commit -m "Add mergeHomeFeed: sessions and gym beta in one newest-first list"
```

---

### Task 2: FeedCard's title

**Files:**
- Modify: `src/components/FeedCard.tsx:28` and `:39-41`

**Interfaces:**
- Consumes: nothing new.
- Produces: no signature change. `FeedCard`'s props stay `{ event, actorName, actorAvatarUrl, onOpen, children }`.

`FeedCard` was written when shared boulders had names. This app removed problem
names, so `gym_problems.name` is always null, `event.boulder_name` is always null,
and `const title = event.boulder_name || 'a boulder'` makes every card read
"shared beta on **a boulder**".

The card already shows the grade twice — on the meta line (`:40`) and as a `Chip`
over the image (`:57`) — so moving the grade into the title and dropping it from
the meta line adds no information and removes a repetition.

- [ ] **Step 1: Give the title a colour and grade**

In `src/components/FeedCard.tsx`, replace line 28:

```tsx
  const title = event.boulder_name || 'a boulder'
```

with:

```tsx
  // boulder_name is always null since this app dropped problem names, so identify
  // the boulder the way the rest of the app does: by colour and grade.
  const title =
    [event.boulder_color, event.boulder_grade].filter(Boolean).join(' ') || 'a boulder'
```

- [ ] **Step 2: Drop the now-duplicated grade from the meta line**

Replace lines 39-41:

```tsx
          <div className="text-[11px] text-gray-400">
            {[event.boulder_grade, event.gym].filter(Boolean).join(' · ')}
          </div>
```

with:

```tsx
          <div className="text-[11px] text-gray-400">{event.gym}</div>
```

Leave the grade `Chip` and `ProblemColorIcons` over the image (`:56-59`) alone —
they label the photo, which the header text does not.

- [ ] **Step 3: Verify the build and lint**

Run: `npm run build && npm run lint`

Expected: build clean; lint at the baseline you measured, no new problems. The
component is still unused at this point — Task 3 mounts it — and `noUnusedLocals`
does not flag an unused exported component.

- [ ] **Step 4: Commit**

```bash
git add src/components/FeedCard.tsx
git commit -m "Name the boulder by colour and grade in FeedCard"
```

---

### Task 3: Render the merged feed

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

**Interfaces:**
- Consumes: `mergeHomeFeed` and `HomeFeedItem` from Task 1; `FeedCard` from Task 2; the existing `useCrewFeed`, `useFriendsFeed`, `useFollowing`, `FriendSessionCard` and `LatestProblemsStrip`.
- Produces: the feature.

Shapes you need, all already defined:

```ts
useCrewFeed()      // useInfiniteQuery — data?.pages is FeedEventEnriched[][]
useFriendsFeed()   // useQuery — data is FriendSession[]; enabled only when you follow someone
FeedCard           // { event: FeedEvent; actorName: string; actorAvatarUrl?: string | null;
                   //   onOpen: () => void; children?: ReactNode }
FriendSessionCard  // { session: FriendSession; to: string }
```

Note `FeedCard`'s `actorName` is a required `string` while `useCrewFeed` yields
`string | null`, so the call site supplies the fallback.

- [ ] **Step 1: Replace the page**

Replace the whole of `src/pages/DashboardPage.tsx` with:

```tsx
import { useNavigate } from 'react-router-dom'
import { useFriendsFeed } from '../hooks/useFriendsFeed'
import { useCrewFeed } from '../hooks/useCrewFeed'
import { useFollowing } from '../hooks/useFollows'
import { FriendSessionCard } from '../components/FriendSessionCard'
import { FeedCard } from '../components/FeedCard'
import { LatestProblemsStrip } from '../components/LatestProblemsStrip'
import { mergeHomeFeed } from '../utils/homeFeed'

export function DashboardPage() {
  const navigate = useNavigate()
  // useFriendsFeed stays disabled until follows resolve, so fold the follows
  // load into the spinner — otherwise the empty state flashes on every mount.
  const { isLoading: followLoading } = useFollowing()
  const { data: sessions = [], isLoading: feedLoading, isError } = useFriendsFeed()
  // Beta at your gyms, from anyone — first page only, no load-more. Deliberately
  // not gated on the follow list: the climber who worked out the crux is usually
  // someone you haven't met.
  const { data: betaPages } = useCrewFeed()
  const loading = followLoading || feedLoading

  const items = mergeHomeFeed(sessions, betaPages?.pages.flat() ?? [])

  return (
    <div className="pb-32 lg:max-w-2xl lg:mx-auto">
      <LatestProblemsStrip />

      <div className="px-4 py-4 space-y-3">
        {/* Not "Friends feed" any more: beta comes from anyone at your gyms. */}
        <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400">Friends &amp; your gyms</h2>
        {loading ? (
          <p className="py-10 text-center text-sm text-gray-400">Loading your friends' sessions…</p>
        ) : isError && items.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500">Couldn't load the feed. Pull to refresh or try again later.</p>
        ) : items.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-500">Nothing here yet.</p>
            <p className="mt-1 text-xs text-gray-400">
              Follow some climbers, or add beta to a boulder at your gym.
            </p>
          </div>
        ) : (
          items.map(item =>
            item.kind === 'session' ? (
              <FriendSessionCard
                key={`s:${item.session.sessionId}`}
                session={item.session}
                to={`/friends/sessions/${item.session.sessionId}`}
              />
            ) : (
              <FeedCard
                key={`b:${item.event.event_type}:${item.event.beta_id}:${item.at}`}
                event={item.event}
                actorName={item.event.actorName ?? 'Someone'}
                actorAvatarUrl={item.event.actorAvatarUrl}
                onOpen={() => navigate(`/gym-problems/${item.event.gym_problem_id}`)}
              />
            ),
          )
        )}
      </div>
    </div>
  )
}
```

Five details in there are deliberate:

- **The heading is no longer "Friends feed."** Beta events come from anyone at your
  gyms, follow or not, so a heading promising friends would be false. "Friends & your
  gyms" says what the list actually contains.

- **`isError && items.length === 0`** — a failed session query no longer blanks the
  page when beta events loaded fine. The beta query has no error branch at all, so a
  failure there degrades to no beta events, which is the spec's non-fatal rule.
- **The empty state no longer says "No friend activity yet"** — it now covers both
  sources, and its second line names the two ways to fill it. A climber who follows
  nobody previously saw a message about follows while their gym's beta was invisible.
- **`items.length === 0`, not `sessions.length === 0`** — same reason.
- **The beta key includes `event_type` and `at`** because one beta can produce both a
  `beta_added` and a `beta_worked` event, and `beta_worked` can fire repeatedly for
  the same beta as different climbers mark it. Keying on `beta_id` alone would
  collide and React would drop rows.

- [ ] **Step 2: Verify build, lint and tests**

Run: `npm run build && npm run lint && npx vitest run`

Expected: build clean; lint at the baseline with no new problems; all tests pass.

- [ ] **Step 3: Check it in the browser**

Run `npm run dev` and open `http://localhost:5173/dashboard`.

Confirm:
- Session cards and beta cards appear in one list, newest first.
- A beta card shows the actor, "shared beta on" or "nailed the beta on", the boulder
  as colour + grade, the gym, and the quoted beta snippet.
- Tapping a beta card opens that boulder's page.
- The Latest Gym Problems strip above is unchanged.

If you have no beta at your gyms there will be no beta cards — that is not a
failure. Note it in your report rather than trying to manufacture data.

- [ ] **Step 4: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "Interleave gym beta into the home feed"
```

---

## Final verification

- [ ] `npm run build` — clean
- [ ] `npm run lint` — no new problems versus the baseline measured at the start
- [ ] `npx vitest run` — all tests pass, 8 more than before
- [ ] `git log --oneline -3` — three commits, one per task
- [ ] `grep -n "fetchNextPage" src/pages/DashboardPage.tsx` — no matches, confirming
      no pagination was added

## Release gate

**None for this work** — no migration, no SQL, no new RPC. It reads `get_crew_feed`,
which has been live since migration 072.

Note for context, unrelated to this branch: migrations **074** and then **075** are
still pending in Supabase from earlier work, and publishing a boulder fails until 075
is applied.
