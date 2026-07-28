import { useState } from 'react'
import { Info } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import { TapeGraphic } from './Chip'
import type { GymGrading } from '../types'

/**
 * Explains the grade-score board: what each of this gym's grading colours is
 * worth, plus the two rules a climber would otherwise meet by surprise. Renders
 * nothing when the gym has no grading configured — the board itself already says
 * so, and an icon opening an empty table would be worse than no icon.
 */
export function GradeScoreInfo({ gym, gradings }: { gym: string; gradings: GymGrading[] }) {
  const [open, setOpen] = useState(false)
  if (gradings.length === 0) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="How grade score works"
        title="How grade score works"
        className="text-gray-400 hover:text-gray-600 transition-colors"
      >
        <Info size={14} strokeWidth={2} />
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="How grade score works">
        <p className="text-xs font-semibold text-gray-500 mb-3">{gym}</p>
        {/* useGymGradings orders by rank ascending, i.e. easiest first. */}
        <div className="space-y-2">
          {gradings.map(g => (
            <div key={g.color_name} className="flex items-center gap-3">
              <TapeGraphic color={g.color_name} size={18} />
              <span className="flex-1 text-sm text-gray-700">{g.color_name}</span>
              <span className="text-lg font-bold text-sage-700">{g.points}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-5 leading-relaxed">
          Easiest first. Each boulder counts once, in the month you logged the send.
          Your gym's setters choose these colours and points.
        </p>
      </BottomSheet>
    </>
  )
}
