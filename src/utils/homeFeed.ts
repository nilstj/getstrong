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
 * Direct string comparison also depends on both sides sharing the same offset
 * style: they arrive from PostgREST as `timestamptz` with a `+00:00` suffix, not
 * `Z` — `'Z'` (0x5A) sorts above `'+'` (0x2B), so a future source that emits
 * `Z`-suffixed timestamps would silently break the ordering here.
 *
 * The session half is follow-only and so can never contain the viewer, but beta
 * events include the viewer's own — pass `currentUserId` to drop those so
 * posting beta doesn't show you reporting on yourself in the third person.
 * Sessions are never filtered by it, since that half can't contain the viewer.
 */
export function mergeHomeFeed(
  sessions: FriendSession[],
  events: FeedEventEnriched[],
  currentUserId?: string,
): HomeFeedItem[] {
  const items: HomeFeedItem[] = [
    ...sessions
      .filter(s => !!s.date)
      .map((session): HomeFeedItem => ({ kind: 'session', at: session.date, session })),
    ...events
      .filter(e =>
        (e.event_type === 'beta_added' || e.event_type === 'beta_worked') &&
        !!e.event_at &&
        e.actor_id !== currentUserId,
      )
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
