import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSession, useDeleteSession } from '../hooks/useSessions'
import { useSessionProblems, useAddProblem, useDeleteProblem } from '../hooks/useProblems'
import { useSessionExercises, useAddExercise, useDeleteExercise } from '../hooks/useExercises'
import { useSessionStore } from '../store/sessionStore'
import { BottomSheet } from '../components/BottomSheet'
import { FAB } from '../components/FAB'
import { ProblemForm } from '../components/ProblemForm'
import { ExerciseForm } from '../components/ExerciseForm'
import { useForm } from 'react-hook-form'
import { useSessionChallengeAttempts, useAddChallengeAttempt, useChallenges, useDeleteChallengeAttempt } from '../hooks/useChallenges'
import { useExerciseTemplates } from '../hooks/useExerciseTemplates'
import { useSessionTestResults, useLogTestResult, useDeleteTestResult, useStrengthTests } from '../hooks/useStrengthTests'
import { useProfile } from '../hooks/useProfile'
import type { Problem, Exercise, Challenge, ChallengeAttempt, ExerciseTemplate } from '../types'
import { ReactionBar } from '../components/ReactionBar'

type SheetTab = 'problem' | 'exercise' | 'test' | 'challenge'

function displayGrade(problem: import('../types').Problem, preference: 'font' | 'v_scale'): string {
  if (preference === 'v_scale' && problem.grade_value_vscale) return problem.grade_value_vscale
  if (problem.grade_value_font) return problem.grade_value_font
  return problem.grade_value ?? '—'
}

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetTab, setSheetTab] = useState<SheetTab>('problem')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data: session, isLoading } = useSession(id!)
  const { data: problems = [] } = useSessionProblems(id!)
  const { data: exercises = [] } = useSessionExercises(id!)
  const addProblem = useAddProblem()
  const addExercise = useAddExercise()
  const deleteProblem = useDeleteProblem()
  const deleteExercise = useDeleteExercise()
  const deleteSession = useDeleteSession()
  const addChallengeAttempt = useAddChallengeAttempt()
  const deleteChallengeAttempt = useDeleteChallengeAttempt()
  const { data: challengeAttempts = [] } = useSessionChallengeAttempts(id!)
  const { data: challenges = [] } = useChallenges()
  const { data: testResults = [] } = useSessionTestResults(id!)
  const logTestResult = useLogTestResult()
  const deleteTestResult = useDeleteTestResult()
  const { data: myProfile } = useProfile()
  const setActiveSessionId = useSessionStore(s => s.setActiveSessionId)

  useEffect(() => {
    setActiveSessionId(id ?? null)
    return () => setActiveSessionId(null)
  }, [id, setActiveSessionId])

  if (isLoading) return <div className="p-4 text-gray-500">Loading...</div>
  if (!session) return <div className="p-4 text-red-600">Session not found.</div>

  const handleAddProblem = (values: Omit<Problem, 'id' | 'session_id' | 'user_id' | 'created_at' | 'grade_value_font' | 'grade_value_vscale'>) => {
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
        <div className="flex items-center gap-1">
          <Link
            to={`/sessions/${id}/edit`}
            className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Edit session"
          >
            <Pencil size={16} />
          </Link>
          {confirmDelete ? (
            <div className="flex items-center gap-2 ml-1">
              <button
                onClick={() => deleteSession.mutate(id!, {
                  onSuccess: () => navigate('/sessions'),
                  onError: () => { toast.error('Failed to delete session'); setConfirmDelete(false) },
                })}
                className="text-xs text-red-600 font-semibold"
              >
                Confirm
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              aria-label="Delete session"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {problems.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-2">Problems ({problems.length})</h2>
          <div className="space-y-2">
            {problems.map(problem => (
              <div key={problem.id} className="bg-gray-50 rounded-2xl p-3">
                <div className="flex items-center justify-between">
                  <div>
                    {problem.name && <p className="font-semibold text-gray-900">{problem.name}</p>}
                    <span className={problem.name ? 'text-sm text-gray-500' : 'font-medium'}>
                      {displayGrade(problem, myProfile?.grade_preference ?? 'font')}
                      {problem.color && (
                        <span className="text-gray-400 text-sm font-normal ml-1">· {problem.color}</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      problem.sent ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {problem.sent ? 'Sent' : 'Project'}
                    </span>
                    <button
                      onClick={() => deleteProblem.mutate({ id: problem.id, sessionId: id! }, { onError: () => toast.error('Failed to delete') })}
                      className="text-gray-300 hover:text-red-500 text-lg leading-none"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <p className="text-gray-400 text-sm">
                    {problem.attempts} attempt{problem.attempts !== 1 ? 's' : ''}
                  </p>
                  {problem.board && (
                    <span className="text-xs bg-gray-50 text-black border border-gray-200 rounded-full px-2 py-0.5">
                      {problem.board}{problem.board_angle != null ? ` ${problem.board_angle}°` : ''}
                    </span>
                  )}
                  {problem.gym && <span className="text-xs text-gray-400">· {problem.gym}</span>}
                </div>
                {problem.beta_video_url && (
                  <a href={problem.beta_video_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-gray-500 mt-0.5 inline-block">
                    ▶ Beta video
                  </a>
                )}
                {problem.notes && <p className="text-gray-500 text-sm mt-0.5">{problem.notes}</p>}
                <ReactionBar problemId={problem.id} compact />
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
              <div key={exercise.id} className="bg-gray-50 rounded-2xl p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{exercise.name}</p>
                    <p className="text-gray-400 text-sm">
                      {exercise.sets != null && `${exercise.sets} sets × `}
                      {exercise.type === 'reps'
                        ? `${exercise.reps} reps`
                        : `${exercise.duration_seconds}s`}
                      {exercise.weight_kg != null && ` · ${exercise.weight_kg}kg`}
                    </p>
                    {exercise.notes && <p className="text-gray-500 text-sm mt-0.5">{exercise.notes}</p>}
                  </div>
                  <button
                    onClick={() => deleteExercise.mutate({ id: exercise.id, sessionId: id! }, { onError: () => toast.error('Failed to delete') })}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {testResults.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-2">Tests ({testResults.length})</h2>
          <div className="space-y-2">
            {testResults.map(result => (
              <div key={result.id} className="bg-blue-50 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{result.strength_tests.name}</p>
                    <p className="text-sm text-blue-700 font-semibold mt-0.5">
                      {result.value} {result.strength_tests.unit}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteTestResult.mutate({ id: result.id, sessionId: id! }, { onError: () => toast.error('Failed to delete') })}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
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
              <div key={attempt.id} className="bg-gray-50 rounded-2xl p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{(attempt as any).challenges?.title ?? 'Challenge'}</p>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      attempt.completed ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {attempt.completed ? 'Completed' : 'Attempted'}
                    </span>
                    <button
                      onClick={() => deleteChallengeAttempt.mutate({ id: attempt.id, sessionId: id! }, { onError: () => toast.error('Failed to delete') })}
                      className="text-gray-300 hover:text-red-500 text-lg leading-none"
                    >
                      ×
                    </button>
                  </div>
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
        <div className="flex rounded-lg overflow-hidden border mb-4 text-xs">
          {(['problem', 'exercise', 'test', 'challenge'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setSheetTab(tab)}
              className={`flex-1 py-2 font-medium transition-colors capitalize ${
                sheetTab === tab ? 'bg-black text-white' : 'bg-white text-gray-600'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        {sheetTab === 'problem' ? (
          <ProblemForm
            onSubmit={handleAddProblem}
            isSubmitting={addProblem.isPending}
            initialGradeSystem={myProfile?.grade_preference ?? 'font'}
          />
        ) : sheetTab === 'exercise' ? (
          <ExerciseSelector onSubmit={handleAddExercise} isSubmitting={addExercise.isPending} />
        ) : sheetTab === 'test' ? (
          <TestLogForm
            sessionId={id!}
            onSubmit={(values) => logTestResult.mutate(values, {
              onSuccess: () => { setSheetOpen(false); toast.success('Test logged') },
              onError: () => toast.error('Failed to log test'),
            })}
            isSubmitting={logTestResult.isPending}
          />
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

function TestLogForm({
  sessionId,
  onSubmit,
  isSubmitting,
}: {
  sessionId: string
  onSubmit: (values: { test_id: string; value: number; session_id: string }) => void
  isSubmitting: boolean
}) {
  const { data: tests = [] } = useStrengthTests()
  const [testId, setTestId] = useState('')
  const [value, setValue] = useState('')

  const selectedTest = tests.find(t => t.id === testId)

  if (tests.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">No tests defined yet. Ask your admin to add some.</p>
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Test</label>
        <select
          value={testId}
          onChange={e => setTestId(e.target.value)}
          className="w-full border rounded-lg px-3 py-2.5"
        >
          <option value="">Select a test</option>
          {tests.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      {selectedTest && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Result ({selectedTest.unit})
          </label>
          {selectedTest.description && (
            <p className="text-xs text-gray-400 mb-1">{selectedTest.description}</p>
          )}
          <input
            type="number"
            step="0.5"
            min="0"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={`Enter value in ${selectedTest.unit}`}
            className="w-full border rounded-lg px-3 py-2.5"
          />
        </div>
      )}
      <button
        type="button"
        disabled={!testId || !value || isSubmitting}
        onClick={() => onSubmit({ test_id: testId, value: parseFloat(value), session_id: sessionId })}
        className="w-full bg-black text-white py-3 rounded-xl font-medium disabled:opacity-50"
      >
        {isSubmitting ? 'Saving...' : 'Log Test Result'}
      </button>
    </div>
  )
}

function ExerciseSelector({
  onSubmit,
  isSubmitting,
}: {
  onSubmit: (values: Omit<Exercise, 'id' | 'session_id' | 'user_id' | 'created_at'>) => void
  isSubmitting: boolean
}) {
  const { data: templates = [] } = useExerciseTemplates()
  const [picked, setPicked] = useState<ExerciseTemplate | null | 'custom'>(null)

  if (picked !== null) {
    const initialName = picked === 'custom' ? '' : picked.name
    const initialType = picked === 'custom' ? 'reps' : picked.type
    const initialTestId = picked === 'custom' ? null : picked.test_id
    return (
      <div>
        <button
          type="button"
          onClick={() => setPicked(null)}
          className="text-sm text-black font-medium mb-4 flex items-center gap-1"
        >
          ← Back
        </button>
        <ExerciseForm
          key={picked === 'custom' ? 'custom' : picked.id}
          initialName={initialName}
          initialType={initialType}
          initialTestId={initialTestId}
          onSubmit={onSubmit}
          isSubmitting={isSubmitting}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {templates.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">From Library</p>
          <div className="space-y-2">
            {templates.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setPicked(t)}
                className="w-full text-left bg-gray-50 border rounded-xl px-4 py-3 hover:border-gray-300 transition-colors"
              >
                <p className="font-medium text-gray-900">{t.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-400 capitalize">{t.type}</span>
                  {t.description && <span className="text-xs text-gray-400">· {t.description}</span>}
                  {t.test_id && (
                    <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">% test</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setPicked('custom')}
        className="w-full border-2 border-dashed border-gray-300 rounded-xl py-3 text-sm text-gray-500 hover:border-gray-400 hover:text-black transition-colors"
      >
        + Custom exercise
      </button>
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
        <input {...register('completed')} id="completed" type="checkbox" className="w-5 h-5 accent-black" />
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
        className="w-full bg-black text-white py-3 rounded-xl font-medium disabled:opacity-50"
      >
        {isSubmitting ? 'Saving...' : 'Log Attempt'}
      </button>
    </form>
  )
}
