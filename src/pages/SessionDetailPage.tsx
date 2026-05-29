import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useSession } from '../hooks/useSessions'
import { useSessionProblems, useAddProblem } from '../hooks/useProblems'
import { useSessionExercises, useAddExercise } from '../hooks/useExercises'
import { useSessionStore } from '../store/sessionStore'
import { BottomSheet } from '../components/BottomSheet'
import { FAB } from '../components/FAB'
import { ProblemForm } from '../components/ProblemForm'
import { ExerciseForm } from '../components/ExerciseForm'
import { useForm } from 'react-hook-form'
import { useSessionChallengeAttempts, useAddChallengeAttempt, useChallenges } from '../hooks/useChallenges'
import type { Problem, Exercise, Challenge, ChallengeAttempt } from '../types'

type SheetTab = 'problem' | 'exercise' | 'challenge'

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetTab, setSheetTab] = useState<SheetTab>('problem')

  const { data: session, isLoading } = useSession(id!)
  const { data: problems = [] } = useSessionProblems(id!)
  const { data: exercises = [] } = useSessionExercises(id!)
  const addProblem = useAddProblem()
  const addExercise = useAddExercise()
  const addChallengeAttempt = useAddChallengeAttempt()
  const { data: challengeAttempts = [] } = useSessionChallengeAttempts(id!)
  const { data: challenges = [] } = useChallenges()
  const setActiveSessionId = useSessionStore(s => s.setActiveSessionId)

  useEffect(() => {
    setActiveSessionId(id ?? null)
    return () => setActiveSessionId(null)
  }, [id, setActiveSessionId])

  if (isLoading) return <div className="p-4 text-gray-500">Loading...</div>
  if (!session) return <div className="p-4 text-red-600">Session not found.</div>

  const handleAddProblem = (values: Omit<Problem, 'id' | 'session_id' | 'user_id' | 'created_at'>) => {
    addProblem.mutate(
      { ...values, session_id: id! },
      {
        onSuccess: () => { setSheetOpen(false); toast.success('Problem added') },
        onError: () => toast.error('Failed to save. Try again.'),
      },
    )
  }

  const handleAddExercise = (values: Omit<Exercise, 'id' | 'session_id' | 'user_id' | 'created_at'>) => {
    addExercise.mutate(
      { ...values, session_id: id! },
      {
        onSuccess: () => { setSheetOpen(false); toast.success('Exercise added') },
        onError: () => toast.error('Failed to save. Try again.'),
      },
    )
  }

  const handleAddChallengeAttempt = (values: Omit<ChallengeAttempt, 'id' | 'user_id' | 'created_at'>) => {
    addChallengeAttempt.mutate(
      { ...values, session_id: id! },
      {
        onSuccess: () => { setSheetOpen(false); toast.success('Challenge attempt logged') },
        onError: () => toast.error('Failed to save. Try again.'),
      },
    )
  }

  return (
    <div className="p-4 pb-32 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">{session.location}</h1>
          <p className="text-gray-500 text-sm">{session.date}</p>
          {session.duration_minutes && (
            <p className="text-gray-400 text-sm">{session.duration_minutes} min</p>
          )}
          {session.notes && <p className="text-gray-500 text-sm mt-1">{session.notes}</p>}
        </div>
        <Link to={`/sessions/${id}/edit`} className="text-sm text-indigo-600 font-medium">
          Edit
        </Link>
      </div>

      {problems.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-2">Problems ({problems.length})</h2>
          <div className="space-y-2">
            {problems.map(problem => (
              <div key={problem.id} className="bg-gray-50 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {problem.grade_value ?? '—'}
                    {problem.grade_value && problem.color && (
                      <span className="text-gray-400 text-sm font-normal ml-1">· {problem.color}</span>
                    )}
                    {!problem.grade_value && problem.color && (
                      <span>{problem.color}</span>
                    )}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    problem.sent ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {problem.sent ? 'Sent' : 'Project'}
                  </span>
                </div>
                <p className="text-gray-400 text-sm">
                  {problem.attempts} attempt{problem.attempts !== 1 ? 's' : ''}
                </p>
                {problem.notes && <p className="text-gray-500 text-sm mt-0.5">{problem.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {exercises.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-2">Exercises ({exercises.length})</h2>
          <div className="space-y-2">
            {exercises.map(exercise => (
              <div key={exercise.id} className="bg-gray-50 rounded-xl p-3">
                <p className="font-medium">{exercise.name}</p>
                <p className="text-gray-400 text-sm">
                  {exercise.sets != null && `${exercise.sets} sets × `}
                  {exercise.type === 'reps'
                    ? `${exercise.reps} reps`
                    : `${exercise.duration_seconds}s`}
                </p>
                {exercise.notes && <p className="text-gray-500 text-sm mt-0.5">{exercise.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {challengeAttempts.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-2">Challenges ({challengeAttempts.length})</h2>
          <div className="space-y-2">
            {challengeAttempts.map(attempt => (
              <div key={attempt.id} className="bg-gray-50 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{(attempt as any).challenges?.title ?? 'Challenge'}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    attempt.completed ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {attempt.completed ? 'Completed' : 'Attempted'}
                  </span>
                </div>
                {attempt.notes && <p className="text-gray-500 text-sm mt-0.5">{attempt.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {problems.length === 0 && exercises.length === 0 && challengeAttempts.length === 0 && (
        <p className="text-gray-400 text-sm text-center pt-12">
          Nothing logged yet. Tap + to add a problem or exercise.
        </p>
      )}

      <FAB onClick={() => setSheetOpen(true)} label="Add problem or exercise" />

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Add to Session"
      >
        <div className="flex rounded-lg overflow-hidden border mb-4">
          {(['problem', 'exercise', 'challenge'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setSheetTab(tab)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                sheetTab === tab ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'
              }`}
            >
              {tab === 'problem' ? 'Problem' : tab === 'exercise' ? 'Exercise' : 'Challenge'}
            </button>
          ))}
        </div>
        {sheetTab === 'problem' ? (
          <ProblemForm onSubmit={handleAddProblem} isSubmitting={addProblem.isPending} />
        ) : sheetTab === 'exercise' ? (
          <ExerciseForm onSubmit={handleAddExercise} isSubmitting={addExercise.isPending} />
        ) : (
          <ChallengeAttemptForm
            challenges={challenges}
            onSubmit={handleAddChallengeAttempt}
            isSubmitting={addChallengeAttempt.isPending}
          />
        )}
      </BottomSheet>
    </div>
  )
}

function ChallengeAttemptForm({
  challenges,
  onSubmit,
  isSubmitting,
}: {
  challenges: Challenge[]
  onSubmit: (values: Omit<ChallengeAttempt, 'id' | 'user_id' | 'created_at'>) => void
  isSubmitting: boolean
}) {
  const { register, handleSubmit } = useForm<{ challenge_id: string; completed: boolean; notes: string; video_url: string }>({
    defaultValues: { challenge_id: '', completed: false, notes: '', video_url: '' },
  })

  const submit = (values: { challenge_id: string; completed: boolean; notes: string; video_url: string }) => {
    if (!values.challenge_id) return
    onSubmit({
      challenge_id: values.challenge_id,
      session_id: null,
      completed: values.completed,
      notes: values.notes || null,
      video_url: values.video_url || null,
    })
  }

  if (challenges.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">No challenges yet. Create one in the Challenges tab.</p>
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Challenge</label>
        <select {...register('challenge_id', { required: true })} className="w-full border rounded-lg px-3 py-2.5">
          <option value="">Select a challenge</option>
          {challenges.map(c => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <input {...register('completed')} id="completed" type="checkbox" className="w-5 h-5 accent-indigo-600" />
        <label htmlFor="completed" className="text-sm font-medium text-gray-700">Completed</label>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Proof video (optional)</label>
        <input
          {...register('video_url')}
          type="url"
          placeholder="https://instagram.com/... or https://youtube.com/..."
          className="w-full border rounded-lg px-3 py-2.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
        <textarea {...register('notes')} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" />
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium disabled:opacity-50"
      >
        {isSubmitting ? 'Saving...' : 'Log Attempt'}
      </button>
    </form>
  )
}
