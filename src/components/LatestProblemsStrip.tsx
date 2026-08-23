import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useDiscoverBoulders } from '../hooks/useDiscoverBoulders'
import { useSeenGymProblems } from '../hooks/useGymProblemViews'
import { useProfile } from '../hooks/useProfile'
import { StoryRing } from './StoryRing'
import { AddGymBoulderSheet } from './AddGymBoulderSheet'
import type { BoulderNavState } from '../utils/boulderNav'
import { boulderStripLabel, boulderStripAriaLabel } from '../utils/boulderStripLabel'

/**
 * The "Latest Gym Problems" story strip: your boulders + the ones in your gyms,
 * newest first. Rings are blue until you open the problem, then grey.
 *
 * The first tile is always the add-a-boulder affordance, so the strip renders
 * even with nothing to show — a climber whose gyms have no active boulders needs
 * the way to publish one more than anyone.
 */
export function LatestProblemsStrip({ heading = 'Latest Gym Problems' }: { heading?: string }) {
  const navigate = useNavigate()
  const { data: boulders } = useDiscoverBoulders()
  const { data: seen } = useSeenGymProblems()
  const [addOpen, setAddOpen] = useState(false)

  const stories = [...(boulders?.yours ?? []), ...(boulders?.discover ?? [])]
    .sort((a, b) => (a.set_at < b.set_at ? 1 : a.set_at > b.set_at ? -1 : 0))
    .slice(0, 12)
  const storyIds = stories.map(b => b.id)

  return (
    <div className="px-4 pt-3 pb-2 border-b border-gray-100">
      <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">{heading}</h2>
      <div className="flex gap-3 overflow-x-auto -mx-1 px-1">
        <AddBoulderTile onClick={() => setAddOpen(true)} />
        {stories.map(b => {
          const label = boulderStripLabel(b.community_grade)
          // The 🧩 on the corner is what drew the tap — honour it and land on
          // that tab. openTab applies on mount, which is always the case
          // arriving from the dashboard.
          const navState: BoulderNavState = b.hasVariation
            ? { boulderIds: storyIds, openTab: 'variations' }
            : { boulderIds: storyIds }
          return (
            <StoryRing
              key={b.id}
              label={label}
              ariaLabel={boulderStripAriaLabel({
                title: b.title,
                grade: b.community_grade,
                hasVariation: b.hasVariation,
                helpWanted: b.helpWanted,
              })}
              imageUrl={b.image_url}
              fallbackGym={b.gym}
              color={b.color}
              helpWanted={b.helpWanted}
              hasVideo={!!b.beta_video_url}
              hasVariation={b.hasVariation}
              seen={seen?.has(b.id) ?? false}
              onClick={() => navigate(`/gym-problems/${b.id}`, { state: navState })}
            />
          )
        })}
      </div>

      {addOpen && <AddGymBoulderSheet open onClose={() => setAddOpen(false)} />}
    </div>
  )
}

/**
 * Your own face with a + on the corner, sized to match StoryRing so the row
 * aligns. Deliberately has no story ring: the blue/grey rings beside it mean
 * unseen/seen, and this tile is neither.
 */
function AddBoulderTile({ onClick }: { onClick: () => void }) {
  const { data: profile } = useProfile()
  // ?.[0] rather than a ?? on the whole name, so an empty username still yields '?'
  const initial = profile?.username?.[0]?.toUpperCase() ?? '?'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Add a gym boulder"
      className="flex flex-col items-center gap-1 w-16 flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 rounded-xl"
    >
      <span className="relative w-14 h-14 rounded-full p-[2.5px]">
        {profile?.avatar_url ? (
          <span
            className="block w-full h-full rounded-full border-2 border-white bg-cover bg-center"
            style={{ backgroundImage: `url(${profile.avatar_url})` }}
          />
        ) : (
          <span className="grid w-full h-full place-items-center rounded-full border-2 border-white bg-sage-100 text-sm font-semibold text-sage-700">
            {initial}
          </span>
        )}
        <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-sage-700 text-white">
          <Plus size={11} strokeWidth={3} />
        </span>
      </span>
      <span className="text-[10px] leading-tight text-gray-600 text-center">Add</span>
    </button>
  )
}
