import { useFriendsFeed } from '../hooks/useFriendsFeed'
import { useFollowing } from '../hooks/useFollows'
import { FriendSessionCard } from '../components/FriendSessionCard'
import { LatestProblemsStrip } from '../components/LatestProblemsStrip'

export function DashboardPage() {
  // useFriendsFeed stays disabled until follows resolve, so fold the follows
  // load into the spinner — otherwise the empty state flashes on every mount.
  const { isLoading: followLoading } = useFollowing()
  const { data: sessions = [], isLoading: feedLoading, isError } = useFriendsFeed()
  const loading = followLoading || feedLoading

  return (
    <div className="pb-32 lg:max-w-2xl lg:mx-auto">
      <LatestProblemsStrip />

      <div className="px-4 py-4 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400">Friends feed</h2>
        {loading ? (
          <p className="py-10 text-center text-sm text-gray-400">Loading your friends' sessions…</p>
        ) : isError ? (
          <p className="py-10 text-center text-sm text-gray-500">Couldn't load the feed. Pull to refresh or try again later.</p>
        ) : sessions.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-500">No friend activity yet.</p>
            <p className="mt-1 text-xs text-gray-400">
              Follow some climbers — their sessions will show up here.
            </p>
          </div>
        ) : (
          sessions.map(s => (
            <FriendSessionCard key={s.sessionId} session={s} to={`/friends/sessions/${s.sessionId}`} />
          ))
        )}
      </div>
    </div>
  )
}
