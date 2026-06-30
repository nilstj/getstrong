import { useNavigate } from 'react-router-dom'
import { useFriendsFeed } from '../hooks/useFriendsFeed'
import { useFollowing } from '../hooks/useFollows'
import { useDiscoverBoulders } from '../hooks/useDiscoverBoulders'
import { FriendSessionCard } from '../components/FriendSessionCard'
import { StoryRing } from '../components/StoryRing'

export function DashboardPage() {
  const navigate = useNavigate()
  const { data: boulders } = useDiscoverBoulders()
  // "Latest Gym Problems" strip: your crews + nearby boulders, newest first,
  // excluding board climbs (Kilterboard/Moonboard/TB2 aren't gym wall problems).
  // Each circle opens its own crew page.
  const stories = [...(boulders?.yours ?? []), ...(boulders?.discover ?? [])]
    .filter(b => !b.isBoard)
    .sort((a, b) => (a.set_at < b.set_at ? 1 : a.set_at > b.set_at ? -1 : 0))
    .slice(0, 12)
  // useFriendsFeed stays disabled until follows resolve, so fold the follows
  // load into the spinner — otherwise the empty state flashes on every mount.
  const { isLoading: followLoading } = useFollowing()
  const { data: sessions = [], isLoading: feedLoading, isError } = useFriendsFeed()
  const loading = followLoading || feedLoading

  return (
    <div className="pb-32 lg:max-w-2xl lg:mx-auto">
      {stories.length > 0 && (
        <div className="px-4 pt-3 pb-2 border-b border-gray-100">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Latest Gym Problems</h2>
          <div className="flex gap-3 overflow-x-auto -mx-1 px-1">
            {stories.map(b => (
              <StoryRing
                key={b.id}
                label={b.community_grade ? `${b.title} (${b.community_grade})` : b.title}
                imageUrl={b.image_url}
                fallbackGym={b.gym}
                onClick={() => navigate(`/gym-problems/${b.id}`)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="px-4 py-4 space-y-3">
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
