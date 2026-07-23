import { Play } from 'lucide-react'
import { useGymBoulders } from '../hooks/useGymProblems'
import { GymThumb } from './GymThumb'
import { VideoBadge } from './VideoBadge'
import type { GymProblem } from '../types'

export function GymBoulderPicker({
  gym, onPick,
}: { gym: string; onPick: (gp: GymProblem) => void }) {
  const trimmed = gym.trim()
  const { data: boulders = [], isLoading } = useGymBoulders(trimmed)

  if (!trimmed) {
    return <p className="text-sm text-gray-400 text-center py-8">Set a gym on this session (Location) to browse its boulders.</p>
  }
  if (isLoading) {
    return <p className="text-sm text-gray-400 text-center py-8">Loading boulders…</p>
  }
  if (boulders.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">No shared boulders at {trimmed} yet — log a new one.</p>
  }

  return (
    <div className="grid grid-cols-3 gap-0.5">
      {boulders.map(b => (
        <button
          key={b.id}
          type="button"
          onClick={() => onPick(b)}
          className="relative aspect-square overflow-hidden bg-gray-800"
          title={b.name ?? b.color ?? 'boulder'}
        >
          {b.image_url ? (
            <img src={b.image_url} alt={b.name ?? b.color ?? 'boulder'} className="w-full h-full object-cover" />
          ) : b.beta_video_url ? (
            <div className="w-full h-full flex items-center justify-center">
              <Play className="w-7 h-7 text-white fill-white" />
            </div>
          ) : (
            <GymThumb gym={b.gym} className="w-full h-full" />
          )}

          {b.image_url && b.beta_video_url && <VideoBadge />}

          {(b.community_grade || b.color) && (
            <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1.5 px-1.5 py-1 bg-gradient-to-t from-black/70 to-transparent">
              {b.community_grade && <span className="text-[11px] font-semibold text-white leading-none">{b.community_grade}</span>}
              {b.color && <span className="text-[10px] text-white/80 leading-none truncate">{b.color}</span>}
            </div>
          )}
        </button>
      ))}
    </div>
  )
}
