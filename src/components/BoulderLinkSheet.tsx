import toast from 'react-hot-toast'
import { Plus } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import {
  useMatchingGymProblems,
  useCreateGymProblem,
  useClaimGymProblem,
} from '../hooks/useGymProblems'
import { daysUntil } from '../utils/gymProblems'
import type { Problem } from '../types'

export function BoulderLinkSheet({
  problem,
  open,
  onClose,
  onDone,
}: {
  problem: Problem
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const { data: matches = [], isLoading } = useMatchingGymProblems({
    gym: problem.gym,
    color: problem.color,
  })
  const create = useCreateGymProblem()
  const claim = useClaimGymProblem()

  const join = (gymProblemId: string) => {
    claim.mutate(
      { problemId: problem.id, gymProblemId },
      {
        onSuccess: () => onDone(),
        onError: () => toast.error('Could not join'),
      },
    )
  }

  const createNew = () => {
    create.mutate(
      {
        gym: problem.gym!,
        color: problem.color,
        wall_angle: null,
        name: problem.name,
        image_url: problem.image_url,
        beta_video_url: problem.beta_video_url,
      },
      {
        onSuccess: gp => join(gp.id),
        onError: () => toast.error('Could not create boulder'),
      },
    )
  }

  const now = new Date()

  return (
    <BottomSheet open={open} onClose={onClose} title="Publish to the gym">
      <p className="text-sm text-gray-500 mb-4">
        {[problem.color, problem.gym].filter(Boolean).join(' at ') || 'Share this boulder'}. Is it one of these?
      </p>

      {isLoading ? (
        <p className="text-sm text-gray-400">Searching…</p>
      ) : (
        <div className="space-y-2">
          {matches.map(gp => {
            const left = daysUntil(gp.expires_at, now)
            return (
              <button
                key={gp.id}
                onClick={() => join(gp.id)}
                disabled={claim.isPending}
                className="w-full flex items-center gap-3 p-3 border rounded-xl text-left hover:bg-gray-50 disabled:opacity-50"
              >
                {gp.image_url && (
                  <img src={gp.image_url} alt="" className="w-12 h-12 object-cover rounded-lg" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {gp.name || `${gp.color ?? ''} ${gp.wall_angle ?? ''}`.trim() || 'Shared boulder'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {left >= 0 ? `${left} days left` : 'expired'}
                  </p>
                </div>
              </button>
            )
          })}
          {matches.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">
              No matching boulder yet. Be the first to log it.
            </p>
          )}

          <button
            onClick={createNew}
            disabled={create.isPending || claim.isPending}
            className="w-full flex items-center justify-center gap-2 p-3 mt-2 border border-dashed border-sage-300 rounded-xl text-sm font-medium text-sage-700 hover:bg-sage-50 disabled:opacity-50"
          >
            <Plus size={15} strokeWidth={2.2} /> No, it&apos;s new — create it
          </button>
        </div>
      )}
    </BottomSheet>
  )
}
