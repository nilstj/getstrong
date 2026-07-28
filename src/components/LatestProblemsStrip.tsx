import { useNavigate } from 'react-router-dom'
import { useDiscoverBoulders } from '../hooks/useDiscoverBoulders'
import { useSeenGymProblems } from '../hooks/useGymProblemViews'
import { StoryRing } from './StoryRing'
import type { BoulderNavState } from '../utils/boulderNav'

/**
 * The "Latest Gym Problems" story strip: your boulders + the ones in your gyms,
 * newest first. Rings are blue until you open the problem, then grey.
 */
export function LatestProblemsStrip({ heading = 'Latest Gym Problems' }: { heading?: string }) {
  const navigate = useNavigate()
  const { data: boulders } = useDiscoverBoulders()
  const { data: seen } = useSeenGymProblems()

  const stories = [...(boulders?.yours ?? []), ...(boulders?.discover ?? [])]
    .sort((a, b) => (a.set_at < b.set_at ? 1 : a.set_at > b.set_at ? -1 : 0))
    .slice(0, 12)
  if (stories.length === 0) return null
  const storyIds = stories.map(b => b.id)

  return (
    <div className="px-4 pt-3 pb-2 border-b border-gray-100">
      <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">{heading}</h2>
      <div className="flex gap-3 overflow-x-auto -mx-1 px-1">
        {stories.map(b => (
          <StoryRing
            key={b.id}
            label={b.community_grade ?? ''}
            ariaLabel={b.community_grade ? `${b.title} (${b.community_grade})` : b.title}
            imageUrl={b.image_url}
            fallbackGym={b.gym}
            color={b.color}
            helpWanted={b.helpWanted}
            hasVideo={!!b.beta_video_url}
            seen={seen?.has(b.id) ?? false}
            onClick={() => navigate(`/gym-problems/${b.id}`, { state: { boulderIds: storyIds } satisfies BoulderNavState })}
          />
        ))}
      </div>
    </div>
  )
}
