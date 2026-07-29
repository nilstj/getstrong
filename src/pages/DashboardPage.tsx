import { useNavigate } from 'react-router-dom'
import { useFriendsFeed } from '../hooks/useFriendsFeed'
import { useCrewFeed } from '../hooks/useCrewFeed'
import { useFollowing } from '../hooks/useFollows'
import { useAuth } from '../providers/AuthProvider'
import { FriendSessionCard } from '../components/FriendSessionCard'
import { FeedCard } from '../components/FeedCard'
import { LatestProblemsStrip } from '../components/LatestProblemsStrip'
import { mergeHomeFeed } from '../utils/homeFeed'

export function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  // useFriendsFeed stays disabled until follows resolve, so fold the follows
  // load into the spinner — otherwise the empty state flashes on every mount.
  const { isLoading: followLoading } = useFollowing()
  const { data: sessions = [], isLoading: feedLoading, isError } = useFriendsFeed()
  // Beta at your gyms, from anyone — first page only, no load-more. Deliberately
  // not gated on the follow list: the climber who worked out the crux is usually
  // someone you haven't met.
  const { data: betaPages } = useCrewFeed()
  const loading = followLoading || feedLoading

  const items = mergeHomeFeed(sessions, betaPages?.pages.flat() ?? [], user?.id)

  return (
    <div className="pb-32 lg:max-w-2xl lg:mx-auto">
      <LatestProblemsStrip />

      <div className="px-4 py-4 space-y-3">
        {/* Not "Friends feed" any more: beta comes from anyone at your gyms. */}
        <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400">Friends &amp; your gyms</h2>
        {loading ? (
          <p className="py-10 text-center text-sm text-gray-400">Loading your feed…</p>
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
                key={`b:${item.event.event_type}:${item.event.beta_id}:${item.event.actor_id}:${item.at}`}
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
