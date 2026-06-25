import { useGymBoulders } from '../hooks/useGymProblems'
import type { GymProblem } from '../types'

export function GymBoulderPicker({
  gym, onPick,
}: { gym: string; onPick: (gp: GymProblem) => void }) {
  const trimmed = gym.trim()
  const { data: boulders = [], isLoading } = useGymBoulders(trimmed)
  const photos = boulders.filter(b => !!b.image_url)

  if (!trimmed) {
    return <p className="text-sm text-gray-400 text-center py-8">Set a gym on this session (Location) to browse its boulders.</p>
  }
  if (isLoading) {
    return <p className="text-sm text-gray-400 text-center py-8">Loading boulders…</p>
  }
  if (photos.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">No shared boulders with photos at {trimmed} yet — log a new one.</p>
  }

  return (
    <div className="grid grid-cols-3 gap-0.5">
      {photos.map(b => (
        <button
          key={b.id}
          type="button"
          onClick={() => onPick(b)}
          className="aspect-square overflow-hidden bg-gray-100"
          title={b.name ?? b.color ?? 'boulder'}
        >
          <img src={b.image_url ?? ''} alt={b.name ?? b.color ?? 'boulder'} className="w-full h-full object-cover" />
        </button>
      ))}
    </div>
  )
}
