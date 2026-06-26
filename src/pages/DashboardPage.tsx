import { useNavigate } from 'react-router-dom'
import { useCrewFeed } from '../hooks/useCrewFeed'
import { useDiscoverBoulders } from '../hooks/useDiscoverBoulders'
import { FeedCard } from '../components/FeedCard'
import { StoryRing } from '../components/StoryRing'

export function DashboardPage() {
  const navigate = useNavigate()
  const { data: boulders } = useDiscoverBoulders()
  // Stories = your active crews first, then nearby boulders to discover; each
  // opens its own crew page rather than the generic /crews index.
  const stories = [...(boulders?.yours ?? []), ...(boulders?.discover ?? [])].slice(0, 12)
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useCrewFeed()
  const events = data?.pages.flat() ?? []

  return (
    <div className="pb-32 lg:max-w-2xl lg:mx-auto">
      {stories.length > 0 && (
        <div className="flex gap-3 overflow-x-auto px-4 py-3 border-b border-gray-100">
          {stories.map(b => (
            <StoryRing key={b.id} label={b.title} imageUrl={b.image_url} onClick={() => navigate(`/gym-problems/${b.id}`)} />
          ))}
        </div>
      )}

      <div className="px-4 py-4 space-y-3">
        {isLoading ? (
          <p className="py-10 text-center text-sm text-gray-400">Loading your crew feed…</p>
        ) : events.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-500">No crew activity yet.</p>
            <p className="mt-1 text-xs text-gray-400">
              Log a problem at a gym or publish a boulder to start your feed.
            </p>
          </div>
        ) : (
          <>
            {events.map((e, i) => (
              <FeedCard
                key={`${e.event_type}-${e.gym_problem_id}-${e.event_at}-${i}`}
                event={e}
                actorName={e.actorName ?? 'Someone'}
                actorAvatarUrl={e.actorAvatarUrl}
                onOpen={() => navigate(`/gym-problems/${e.gym_problem_id}`)}
              >
                <button type="button" onClick={() => navigate(`/gym-problems/${e.gym_problem_id}`)}
                  className="text-sm font-semibold text-sage-700">
                  💬 Beta &amp; banter →
                </button>
              </FeedCard>
            ))}
            {hasNextPage && (
              <button type="button" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}
                className="w-full py-3 text-sm font-medium text-sage-700 disabled:opacity-50">
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
