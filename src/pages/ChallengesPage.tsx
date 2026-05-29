import { useState } from 'react'
import { useChallenges, useCreateChallenge, useChallengeAttempts } from '../hooks/useChallenges'
import { BottomSheet } from '../components/BottomSheet'
import { FAB } from '../components/FAB'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import type { Challenge } from '../types'

export function ChallengesPage() {
  const { data: challenges = [], isLoading } = useChallenges()
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<Challenge | null>(null)

  if (isLoading) return <div className="p-4 text-gray-500">Loading...</div>

  return (
    <div className="p-4 space-y-3 pb-24">
      <h1 className="text-2xl font-bold">Challenges</h1>

      {challenges.length === 0 && (
        <p className="text-gray-400 text-sm text-center pt-12">
          No challenges yet. Tap + to create the first one.
        </p>
      )}

      {challenges.map(challenge => (
        <button
          key={challenge.id}
          onClick={() => setSelected(challenge)}
          className="w-full text-left bg-white border rounded-xl p-4 hover:border-indigo-300 transition-colors"
        >
          <p className="font-semibold text-gray-900">{challenge.title}</p>
          {challenge.description && (
            <p className="text-sm text-gray-500 mt-1">{challenge.description}</p>
          )}
          <AttemptCount challengeId={challenge.id} />
        </button>
      ))}

      <FAB onClick={() => setCreateOpen(true)} label="Create challenge" />

      <BottomSheet open={createOpen} onClose={() => setCreateOpen(false)} title="New Challenge">
        <CreateChallengeForm onClose={() => setCreateOpen(false)} />
      </BottomSheet>

      {selected && (
        <BottomSheet open={!!selected} onClose={() => setSelected(null)} title={selected.title}>
          <ChallengeDetail challenge={selected} />
        </BottomSheet>
      )}
    </div>
  )
}

function AttemptCount({ challengeId }: { challengeId: string }) {
  const { data: attempts = [] } = useChallengeAttempts(challengeId)
  if (attempts.length === 0) return null
  const completed = attempts.filter(a => a.completed).length
  return (
    <p className="text-xs text-gray-400 mt-2">
      {attempts.length} attempt{attempts.length !== 1 ? 's' : ''} · {completed} completed
    </p>
  )
}

function CreateChallengeForm({ onClose }: { onClose: () => void }) {
  const createChallenge = useCreateChallenge()
  const { register, handleSubmit } = useForm<{ title: string; description: string }>()

  const onSubmit = (values: { title: string; description: string }) => {
    createChallenge.mutate(
      { title: values.title, description: values.description || null },
      {
        onSuccess: () => { toast.success('Challenge created'); onClose() },
        onError: () => toast.error('Failed to create challenge'),
      },
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
        <input
          {...register('title', { required: true })}
          type="text"
          placeholder="e.g. 10 sec front lever"
          className="w-full border rounded-lg px-3 py-2.5"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
        <textarea
          {...register('description')}
          rows={3}
          placeholder="Rules, context, tips..."
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={createChallenge.isPending}
        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium disabled:opacity-50"
      >
        {createChallenge.isPending ? 'Creating...' : 'Create Challenge'}
      </button>
    </form>
  )
}

function ChallengeDetail({ challenge }: { challenge: Challenge }) {
  const { data: attempts = [] } = useChallengeAttempts(challenge.id)
  const completed = attempts.filter(a => a.completed).length

  return (
    <div className="space-y-4">
      {challenge.description && (
        <p className="text-gray-600 text-sm">{challenge.description}</p>
      )}
      <div className="flex gap-6">
        <div className="text-center">
          <p className="text-2xl font-bold">{attempts.length}</p>
          <p className="text-xs text-gray-500">Attempts</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold">{completed}</p>
          <p className="text-xs text-gray-500">Completed</p>
        </div>
        {attempts.length > 0 && (
          <div className="text-center">
            <p className="text-2xl font-bold">{Math.round((completed / attempts.length) * 100)}%</p>
            <p className="text-xs text-gray-500">Success rate</p>
          </div>
        )}
      </div>
      <p className="text-sm text-gray-400">Add this challenge to a session via the + button on the session detail page.</p>
    </div>
  )
}
