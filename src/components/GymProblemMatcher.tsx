import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { BottomSheet } from './BottomSheet'
import {
  useMatchingGymProblems,
  useCreateGymProblem,
  useClaimGymProblem,
} from '../hooks/useGymProblems'
import { daysUntil } from '../utils/gymProblems'
import type { Problem } from '../types'

export function GymProblemMatcher({ problem }: { problem: Problem }) {
  const [open, setOpen] = useState(false)
  const criteria = { gym: problem.gym, color: problem.color }
  const { data: matches = [], isLoading } = useMatchingGymProblems(criteria)
  const create = useCreateGymProblem()
  const claim = useClaimGymProblem()

  // Match key is gym + color (indoor). Skip until both are present.
  if (!problem.gym || !problem.color) return null

  // Already claimed onto a shared boulder.
  if (problem.gym_problem_id) {
    return (
      <Link
        to={`/gym-problems/${problem.gym_problem_id}`}
        className="inline-flex items-center gap-1 mt-1.5 text-xs text-sage-700 font-medium hover:underline"
      >
        <Users size={13} strokeWidth={2} /> View the crew
      </Link>
    )
  }

  const join = (gymProblemId: string) => {
    claim.mutate(
      { problemId: problem.id, gymProblemId },
      {
        onSuccess: () => {
          toast.success('Joined the boulder')
          setOpen(false)
        },
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
      },
      {
        onSuccess: gp => join(gp.id),
        onError: () => toast.error('Could not create boulder'),
      },
    )
  }

  const now = new Date()

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 mt-1.5 text-xs text-gray-600 font-medium hover:text-sage-700"
      >
        <Users size={13} strokeWidth={2} /> Find this boulder&apos;s crew
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Find this boulder">
        <p className="text-sm text-gray-500 mb-4">
          {problem.color} at {problem.gym}. Is it one of these?
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
    </>
  )
}
