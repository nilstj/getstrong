import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Pencil, Trash2, Play } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSession, useDeleteSession, useUpdateSession } from '../hooks/useSessions'
import { useSessionProblems, useAddProblem, useUpdateProblem, useDeleteProblem } from '../hooks/useProblems'
import { useSessionExercises, useAddExercise, useUpdateExercise, useDeleteExercise } from '../hooks/useExercises'
import { useSessionStore } from '../store/sessionStore'
import { BottomSheet } from '../components/BottomSheet'
import { FAB } from '../components/FAB'
import { ProblemForm } from '../components/ProblemForm'
import { ExerciseForm } from '../components/ExerciseForm'
import { useForm } from 'react-hook-form'
import { useSessionChallengeAttempts, useAddChallengeAttempt, useUpdateChallengeAttempt, useChallenges, useDeleteChallengeAttempt } from '../hooks/useChallenges'
import { useProblemTags } from '../hooks/useProblemTags'
import { useExerciseTemplates } from '../hooks/useExerciseTemplates'
import { useSessionTestResults, useLogTestResult, useDeleteTestResult, useStrengthTests } from '../hooks/useStrengthTests'
import { useProfile } from '../hooks/useProfile'
import { useSessionProblemTags } from '../hooks/useProblemTags'
import { INTENSITY_OPTIONS } from '../types'
import { isPlannedSession } from '../components/SessionCard'
import { CalendarClock } from 'lucide-react'
import {
  useSessionPartners, useSetSessionPartners,
  useProblemPartners, useSetProblemPartners,
  useExercisePartners, useSetExercisePartners,
} from '../hooks/usePartners'
import { PartnerPicker, PartnerAvatars } from '../components/PartnerPicker'
import type { Problem, Exercise, Challenge, ChallengeAttempt, ExerciseTemplate } from '../types'
import { ReactionBar } from '../components/ReactionBar'
import { ProblemCommentThread } from '../components/ProblemCommentThread'
import { VideoBadge } from '../components/VideoBadge'
import { CallForHelp } from '../components/CallForHelp'
import { BoulderLinkSheet } from '../components/BoulderLinkSheet'
import { useProblemCommentCounts } from '../hooks/useProblemComments'
import { GymBoulderPicker } from '../components/GymBoulderPicker'
import { boulderToPrefill } from '../utils/boulderPrefill'
import { useClaimGymProblem } from '../hooks/useGymProblems'
import type { GymProblem } from '../types'
import { ImageLightbox } from '../components/ImageLightbox'
import { BoardThumb } from '../components/BoardThumb'
import { GymThumb } from '../components/GymThumb'

type SheetTab = 'problem' | 'exercise' | 'test' | 'challenge'

function SendBadge({ sent, attempts }: { sent: boolean; attempts: number }) {
  if (!sent) return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-200 text-gray-600">Project</span>
  if (attempts === 1) return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-300 text-yellow-900">Flash ⚡</span>
  return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">Sent</span>
}

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
  const [editingProblem, setEditingProblem] = useState<Problem | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null)
  const [editingAttempt, setEditingAttempt] = useState<ChallengeAttempt | null>(null)
  const [problemMode, setProblemMode] = useState<'new' | 'from-gym'>('new')
  const [pickedBoulder, setPickedBoulder] = useState<GymProblem | null>(null)

  const { data: session, isLoading } = useSession(id!)
  const { data: problems = [] } = useSessionProblems(id!)
  const problemIds = problems.map(p => p.id)
  const { data: commentCounts = {} } = useProblemCommentCounts(problemIds)
  const [openCommentProblemId, setOpenCommentProblemId] = useState<string | null>(null)
  const [linkProblem, setLinkProblem] = useState<Problem | null>(null)
  const { data: exercises = [] } = useSessionExercises(id!)
  const addProblem = useAddProblem()
  const updateProblem = useUpdateProblem()
  const addExercise = useAddExercise()
  const updateExercise = useUpdateExercise()
  const deleteProblem = useDeleteProblem()
  const deleteExercise = useDeleteExercise()
  const deleteSession = useDeleteSession()
  const addChallengeAttempt = useAddChallengeAttempt()
  const updateChallengeAttempt = useUpdateChallengeAttempt()
  const deleteChallengeAttempt = useDeleteChallengeAttempt()
  const { data: challengeAttempts = [] } = useSessionChallengeAttempts(id!)
  const { data: challenges = [] } = useChallenges()
  const { data: testResults = [] } = useSessionTestResults(id!)
  const logTestResult = useLogTestResult()
  const deleteTestResult = useDeleteTestResult()
  const { data: myProfile } = useProfile()
  const { data: templates = [] } = useExerciseTemplates()
  const { data: problemTagsMap = {} } = useSessionProblemTags(problems.map(p => p.id))
  const { data: sessionPartners = [] } = useSessionPartners(id!)
  const setSessionPartners = useSetSessionPartners(id!)
  const setActiveSessionId = useSessionStore(s => s.setActiveSessionId)
  const claimGymProblem = useClaimGymProblem()

  useEffect(() => {
    setActiveSessionId(id ?? null)
    return () => setActiveSessionId(null)
  }, [id, setActiveSessionId])

  if (isLoading) return <div className="p-4 text-gray-500">Loading...</div>
  if (!session) return <div className="p-4 text-red-600">Session not found.</div>

  const handleAddProblem = ({ makePublic, ...values }: Omit<Problem, 'id' | 'session_id' | 'user_id' | 'created_at' | 'grade_value_font' | 'grade_value_vscale' | 'gym_problem_id'> & { tagIds?: string[]; makePublic?: boolean }) => {
    addProblem.mutate(
      { ...values, session_id: id! },
      {
        onSuccess: (created) => {
          setSheetOpen(false); setProblemMode('new'); setPickedBoulder(null)
          if (makePublic) {
            setLinkProblem(created)
          } else {
            toast.success('Problem added')
          }
        },
        onError: () => toast.error('Failed to save. Try again.'),
      },
    )
  }

  const handleAddFromBoulder = (values: Omit<Problem, 'id' | 'session_id' | 'user_id' | 'created_at' | 'grade_value_font' | 'grade_value_vscale' | 'gym_problem_id'> & { tagIds?: string[] }) => {
    addProblem.mutate(
      { ...values, session_id: id! },
      {
        onSuccess: (created) => {
          if (pickedBoulder) {
            claimGymProblem.mutate(
              { problemId: created.id, gymProblemId: pickedBoulder.id },
              { onError: () => toast.error('Problem added, but linking to the boulder failed') },
            )
          }
          setSheetOpen(false)
          setProblemMode('new')
          setPickedBoulder(null)
          toast.success('Problem added')
        },
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

  const planned = isPlannedSession(session.date)

  return (
    <div className="p-4 pb-32 space-y-4">
      {/* Planned session banner */}
      {planned && (
        <div className="bg-sage-50 border border-sage-200 rounded-2xl px-4 py-3 flex items-center gap-3">
          <CalendarClock size={20} strokeWidth={1.75} className="text-sage-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-sage-800">Planned Session</p>
            <p className="text-xs text-sage-600">Invite friends to join you</p>
          </div>
          <PartnerPicker
            currentPartnerIds={sessionPartners}
            onSave={ids => setSessionPartners.mutate(ids)}
            isSaving={setSessionPartners.isPending}
            label={sessionPartners.length > 0 ? `${sessionPartners.length} invited` : 'Invite'}
          />
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">{session.location}</h1>
          {session.goal && (
            <p className="text-sm font-medium text-sage-700 mt-0.5">🎯 {session.goal}</p>
          )}
          <p className="text-gray-500 text-sm">{session.date}</p>
          {session.duration_minutes && (
            <p className="text-gray-400 text-sm">{session.duration_minutes} min</p>
          )}
          {session.intensity && (() => {
            const opt = INTENSITY_OPTIONS.find(o => o.value === session.intensity)
            return opt ? (
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium mt-1 ${opt.badge}`}>
                {opt.emoji} {opt.label}
              </span>
            ) : null
          })()}
          {session.notes && <p className="text-gray-500 text-sm mt-1">{session.notes}</p>}
          {!planned && (
            <div className="flex items-center gap-2 mt-2">
              <PartnerAvatars partnerIds={sessionPartners} />
              <PartnerPicker
                currentPartnerIds={sessionPartners}
                onSave={ids => setSessionPartners.mutate(ids)}
                isSaving={setSessionPartners.isPending}
                label={sessionPartners.length > 0 ? 'Edit partners' : 'Tag friends'}
              />
            </div>
          )}
        </div>
        <Link
          to={`/sessions/${id}/edit`}
          className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
          title="Edit session"
          aria-label="Edit session"
        >
          <Pencil size={16} strokeWidth={1.75} />
        </Link>
      </div>

      {problems.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-2">Problems ({problems.length})</h2>
          <div className="space-y-2">
            {problems.map(problem => (
              <div key={problem.id} className="bg-gray-50 rounded-2xl p-3">
                <div className="flex items-start gap-2">
                {(problem.image_url || problem.board || problem.gym || problem.beta_video_url) && (
                  <div className="relative flex-shrink-0">
                    {problem.image_url ? (
                      <button type="button" onClick={() => setLightboxUrl(problem.image_url!)}>
                        <img src={problem.image_url} alt="" className="w-16 h-16 object-cover rounded-xl" />
                      </button>
                    ) : problem.board ? (
                      <BoardThumb board={problem.board} angle={problem.board_angle} className="w-16 h-16 rounded-xl" />
                    ) : problem.gym ? (
                      <GymThumb gym={problem.gym} compact className="w-16 h-16 rounded-xl" />
                    ) : (
                      <a href={problem.beta_video_url!} target="_blank" rel="noopener noreferrer"
                        className="w-16 h-16 rounded-xl bg-gray-800 flex items-center justify-center">
                        <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                      </a>
                    )}
                    {problem.beta_video_url && (problem.image_url || problem.board || problem.gym) && (
                      <VideoBadge href={problem.beta_video_url} />
                    )}
                  </div>
                )}
                <div className="flex-1 min-w-0">
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
                  <div className="flex items-center gap-1">
                    <SendBadge sent={problem.sent} attempts={problem.attempts} />
                    <button
                      onClick={() => setEditingProblem(problem)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      <Pencil size={14} strokeWidth={1.75} />
                    </button>
                    <button
                      onClick={() => deleteProblem.mutate({ id: problem.id, sessionId: id! }, { onError: () => toast.error('Failed to delete') })}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <p className="text-gray-400 text-sm">
                    {problem.attempts} attempt{problem.attempts !== 1 ? 's' : ''}
                  </p>
                  {problem.board && (
                    <span className="text-xs bg-gray-50 text-sage-800 border border-gray-200 rounded-full px-2 py-0.5">
                      {problem.board}{problem.board_angle != null ? ` ${problem.board_angle}°` : ''}
                    </span>
                  )}
                  {problem.gym && <span className="text-xs text-gray-400">· {problem.gym}</span>}
                  {problem.crag && <span className="text-xs text-gray-400">🌲 {problem.crag}</span>}
                </div>
                {problem.notes && <p className="text-gray-500 text-sm mt-0.5">{problem.notes}</p>}
                {(problemTagsMap[problem.id] ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {(problemTagsMap[problem.id] ?? []).map(tag => (
                      <span key={tag.id} className="text-[10px] bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 font-medium">
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
                <ProblemPartnerRow problemId={problem.id} />
                <ReactionBar problemId={problem.id} compact />
                <div className="flex items-center mt-1.5">
                  <button
                    onClick={() => setOpenCommentProblemId(
                      openCommentProblemId === problem.id ? null : problem.id
                    )}
                    className="text-sm text-gray-500 hover:text-sage-700 transition-colors font-medium flex items-center gap-1"
                  >
                    <span className="text-base">💬</span>{(commentCounts[problem.id] ?? 0) > 0 ? <span>{commentCounts[problem.id]}</span> : null}
                  </button>
                </div>
                {openCommentProblemId === problem.id && (
                  <ProblemCommentThread problemId={problem.id} />
                )}
                <CallForHelp problem={problem} />
                {problem.gym_problem_id && (
                  <Link
                    to={`/gym-problems/${problem.gym_problem_id}`}
                    className="inline-flex items-center gap-1 mt-1.5 text-xs text-sage-700 font-medium hover:underline"
                  >
                    🌐 On a shared boulder · View the sendtrain
                  </Link>
                )}
                </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {exercises.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-2">Exercises ({exercises.length})</h2>
          <div className="space-y-2">
            {exercises.map(exercise => {
              const template = templates.find(t => t.name === exercise.name)
              return (
              <div key={exercise.id} className="bg-gray-50 rounded-2xl p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{exercise.name}</p>
                    {template?.video_url && (
                      <a
                        href={template.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-sage-800 font-medium mt-0.5 inline-block"
                      >
                        ▶ Video
                      </a>
                    )}
                    <p className="text-gray-400 text-sm">
                      {exercise.sets != null && `${exercise.sets} sets × `}
                      {exercise.type === 'reps'
                        ? `${exercise.reps} reps`
                        : `${exercise.duration_seconds}s`}
                      {exercise.weight_kg != null && ` · ${exercise.weight_kg}kg`}
                    </p>
                    {exercise.notes && <p className="text-gray-500 text-sm mt-0.5">{exercise.notes}</p>}
                    <ExercisePartnerRow exerciseId={exercise.id} />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingExercise(exercise)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      <Pencil size={14} strokeWidth={1.75} />
                    </button>
                    <button
                      onClick={() => deleteExercise.mutate({ id: exercise.id, sessionId: id! }, { onError: () => toast.error('Failed to delete') })}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              </div>
              )
            })}
          </div>
        </div>
      )}

      {testResults.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-2">Tests ({testResults.length})</h2>
          <div className="space-y-2">
            {testResults.map(result => (
              <div key={result.id} className="bg-sage-50 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{result.strength_tests.name}</p>
                    <p className="text-sm text-sage-700 font-semibold mt-0.5">
                      {result.value} {result.strength_tests.unit}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteTestResult.mutate({ id: result.id, sessionId: id! }, { onError: () => toast.error('Failed to delete') })}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={16} strokeWidth={1.75} />
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
                  <div className="flex items-center gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      attempt.completed ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {attempt.completed ? 'Completed' : 'Attempted'}
                    </span>
                    <button
                      onClick={() => setEditingAttempt(attempt)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      <Pencil size={14} strokeWidth={1.75} />
                    </button>
                    <button
                      onClick={() => deleteChallengeAttempt.mutate({ id: attempt.id, sessionId: id! }, { onError: () => toast.error('Failed to delete') })}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
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

      {/* Wisdom */}
      {!planned && <WisdomSection session={session} />}

      {/* Delete session — low prominence, at the bottom */}
      <div className="pt-4 pb-2 flex justify-center">
        {confirmDelete ? (
          <div className="flex items-center gap-3">
            <button
              onClick={() => deleteSession.mutate(id!, {
                onSuccess: () => navigate('/sessions'),
                onError: () => { toast.error('Failed to delete'); setConfirmDelete(false) },
              })}
              disabled={deleteSession.isPending}
              className="text-sm text-red-600 font-semibold disabled:opacity-50"
            >
              {deleteSession.isPending ? 'Deleting…' : 'Confirm delete'}
            </button>
            <button onClick={() => setConfirmDelete(false)} className="text-sm text-gray-400">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2 size={14} strokeWidth={1.75} />
            Delete session
          </button>
        )}
      </div>

      <FAB onClick={() => setSheetOpen(true)} label="Add problem or exercise" />

      <BottomSheet
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setProblemMode('new'); setPickedBoulder(null) }}
        title="Add to Session"
      >
        <div className="flex rounded-lg overflow-hidden border mb-4 text-xs">
          {(['problem', 'exercise', 'test', 'challenge'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setSheetTab(tab)}
              className={`flex-1 py-2 font-medium transition-colors capitalize ${
                sheetTab === tab ? 'bg-sage-700 text-white' : 'bg-white text-gray-600'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        {sheetTab === 'problem' ? (
          <div>
            {/* New · From gym toggle */}
            <div className="flex rounded-lg overflow-hidden border mb-4 text-xs">
              {(['new', 'from-gym'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => { setProblemMode(mode); setPickedBoulder(null) }}
                  className={`flex-1 py-2 font-medium transition-colors ${
                    problemMode === mode ? 'bg-sage-700 text-white' : 'bg-white text-gray-600'
                  }`}
                >
                  {mode === 'new' ? 'New' : 'From gym'}
                </button>
              ))}
            </div>
            {problemMode === 'new' ? (
              <ProblemForm
                onSubmit={handleAddProblem}
                isSubmitting={addProblem.isPending}
                initialGradeSystem={myProfile?.grade_preference ?? 'font'}
                defaultGym={session.location}
              />
            ) : pickedBoulder ? (
              <div>
                <button
                  type="button"
                  onClick={() => setPickedBoulder(null)}
                  className="text-sm text-sage-800 font-medium mb-4 flex items-center gap-1"
                >
                  ← Back
                </button>
                <ProblemForm
                  onSubmit={handleAddFromBoulder}
                  isSubmitting={addProblem.isPending}
                  initialGradeSystem={myProfile?.grade_preference ?? 'font'}
                  defaultGym={session.location}
                  prefill={boulderToPrefill(pickedBoulder)}
                />
              </div>
            ) : (
              <GymBoulderPicker
                gym={session.location}
                onPick={setPickedBoulder}
              />
            )}
          </div>
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

      {/* Edit problem */}
      {editingProblem && (
        <EditProblemSheet
          problem={editingProblem}
          sessionId={id!}
          gradeSystem={myProfile?.grade_preference ?? 'font'}
          onClose={() => setEditingProblem(null)}
          onSave={(values, tagIds, makePublic) => updateProblem.mutate(
            { id: editingProblem.id, sessionId: id!, tagIds, ...values },
            {
              onSuccess: () => {
                const isLinked = !!editingProblem.gym_problem_id
                if (makePublic && !isLinked) {
                  // Private → Public: pick/create a boulder for the just-saved problem.
                  setLinkProblem({ ...editingProblem, ...values })
                  setEditingProblem(null)
                } else if (!makePublic && isLinked) {
                  // Public → Private: unclaim (the boulder stays for others).
                  claimGymProblem.mutate(
                    { problemId: editingProblem.id, gymProblemId: null },
                    {
                      onSuccess: () => toast.success('Made private'),
                      onError: () => toast.error('Could not make private'),
                    },
                  )
                  setEditingProblem(null)
                } else {
                  setEditingProblem(null)
                  toast.success('Problem updated')
                }
              },
              onError: () => toast.error('Failed to update'),
            },
          )}
          isSaving={updateProblem.isPending}
        />
      )}

      {/* Edit exercise */}
      {editingExercise && (
        <BottomSheet open onClose={() => setEditingExercise(null)} title="Edit Exercise">
          <ExerciseForm
            existing={editingExercise}
            onSubmit={vals => updateExercise.mutate(
              { id: editingExercise.id, sessionId: id!, ...vals },
              { onSuccess: () => { setEditingExercise(null); toast.success('Exercise updated') }, onError: () => toast.error('Failed to update') },
            )}
            isSubmitting={updateExercise.isPending}
          />
        </BottomSheet>
      )}

      {/* Edit challenge attempt */}
      {editingAttempt && (
        <EditAttemptSheet
          attempt={editingAttempt}
          sessionId={id!}
          onClose={() => setEditingAttempt(null)}
          onSave={vals => updateChallengeAttempt.mutate(
            { id: editingAttempt.id, sessionId: id!, ...vals },
            { onSuccess: () => { setEditingAttempt(null); toast.success('Attempt updated') }, onError: () => toast.error('Failed to update') },
          )}
          isSaving={updateChallengeAttempt.isPending}
        />
      )}
      {linkProblem && (
        <BoulderLinkSheet
          problem={linkProblem}
          open
          onClose={() => setLinkProblem(null)}
          onDone={() => { setLinkProblem(null); toast.success('Published to the gym') }}
        />
      )}
      {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  )
}

function EditProblemSheet({
  problem, gradeSystem, onClose, onSave, isSaving,
}: {
  problem: Problem
  sessionId?: string
  gradeSystem: 'font' | 'v_scale'
  onClose: () => void
  onSave: (values: Omit<Problem, 'id' | 'session_id' | 'user_id' | 'created_at' | 'grade_value_font' | 'grade_value_vscale' | 'gym_problem_id'>, tagIds: string[], makePublic?: boolean) => void
  isSaving: boolean
}) {
  const { data: currentTags, isLoading: tagsLoading } = useProblemTags(problem.id)
  return (
    <BottomSheet open onClose={onClose} title="Edit Problem">
      {tagsLoading || currentTags === undefined ? (
        <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
      ) : (
      <ProblemForm
        key={problem.id + '-' + currentTags.map(t => t.id).join(',')}
        existing={problem}
        existingTagIds={currentTags.map(t => t.id)}
        initialGradeSystem={gradeSystem}
        onSubmit={(payload) => {
          const { tagIds = [], makePublic, ...vals } = payload
          onSave(vals, tagIds, makePublic)
        }}
        isSubmitting={isSaving}
      />
      )}
    </BottomSheet>
  )
}

function EditAttemptSheet({
  attempt, onClose, onSave, isSaving,
}: {
  attempt: ChallengeAttempt
  sessionId?: string
  onClose: () => void
  onSave: (vals: { completed: boolean; notes: string | null; video_url: string | null }) => void
  isSaving: boolean
}) {
  const [completed, setCompleted] = useState(attempt.completed)
  const [notes, setNotes] = useState(attempt.notes ?? '')
  const [videoUrl, setVideoUrl] = useState(attempt.video_url ?? '')
  return (
    <BottomSheet open onClose={onClose} title="Edit Challenge Attempt">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <input
            id="edit-completed"
            type="checkbox"
            checked={completed}
            onChange={e => setCompleted(e.target.checked)}
            className="w-5 h-5 accent-sage-700"
          />
          <label htmlFor="edit-completed" className="text-sm font-medium text-gray-700">Completed</label>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Proof video (optional)</label>
          <input
            type="url"
            value={videoUrl}
            onChange={e => setVideoUrl(e.target.value)}
            placeholder="https://..."
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="w-full border rounded-xl px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={() => onSave({ completed, notes: notes || null, video_url: videoUrl || null })}
          disabled={isSaving}
          className="w-full bg-sage-700 text-white py-3 rounded-xl font-semibold disabled:opacity-50"
        >
          {isSaving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </BottomSheet>
  )
}

function ProblemPartnerRow({ problemId }: { problemId: string }) {
  const { data: partners = [] } = useProblemPartners(problemId)
  const setPartners = useSetProblemPartners(problemId)
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <PartnerAvatars partnerIds={partners} size="xs" />
      <PartnerPicker
        currentPartnerIds={partners}
        onSave={ids => setPartners.mutate(ids)}
        isSaving={setPartners.isPending}
        label={partners.length > 0 ? 'Edit' : '+ friend'}
      />
    </div>
  )
}

function ExercisePartnerRow({ exerciseId }: { exerciseId: string }) {
  const { data: partners = [] } = useExercisePartners(exerciseId)
  const setPartners = useSetExercisePartners(exerciseId)
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <PartnerAvatars partnerIds={partners} size="xs" />
      <PartnerPicker
        currentPartnerIds={partners}
        onSave={ids => setPartners.mutate(ids)}
        isSaving={setPartners.isPending}
        label={partners.length > 0 ? 'Edit' : '+ friend'}
      />
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
        className="w-full bg-sage-700 text-white py-3 rounded-xl font-medium disabled:opacity-50"
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
    const initialSets = picked === 'custom' ? undefined : picked.preset_sets ?? undefined
    const initialReps = picked === 'custom' ? undefined : picked.preset_reps ?? undefined
    const videoUrl = picked === 'custom' ? undefined : picked.video_url ?? undefined
    return (
      <div>
        <button
          type="button"
          onClick={() => setPicked(null)}
          className="text-sm text-sage-800 font-medium mb-4 flex items-center gap-1"
        >
          ← Back
        </button>
        <ExerciseForm
          key={picked === 'custom' ? 'custom' : picked.id}
          initialName={initialName}
          initialType={initialType}
          initialTestId={initialTestId}
          initialSets={initialSets}
          initialReps={initialReps}
          videoUrl={videoUrl}
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
            {templates.map(t => {
              const presetParts = [
                t.preset_sets ? `${t.preset_sets} sets` : null,
                t.preset_reps && t.type === 'reps' ? `${t.preset_reps} reps` : null,
                t.preset_pause_seconds ? `${t.preset_pause_seconds}s pause` : null,
                t.preset_rest_seconds ? `${t.preset_rest_seconds}s rest` : null,
              ].filter(Boolean)

              return (
                <div
                  key={t.id}
                  onClick={() => setPicked(t)}
                  className="w-full text-left bg-gray-50 border rounded-xl px-4 py-3 hover:border-gray-300 transition-colors cursor-pointer"
                >
                  <p className="font-medium text-gray-900">{t.name}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                    <span className="text-xs text-gray-400 capitalize">{t.type}</span>
                    {t.description && <span className="text-xs text-gray-400">· {t.description}</span>}
                    {t.device && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{t.device}</span>
                    )}
                    {t.test_id && (
                      <span className="text-xs bg-sage-50 text-sage-600 px-1.5 py-0.5 rounded-full">% test</span>
                    )}
                  </div>
                  {presetParts.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1">{presetParts.join(' · ')}</p>
                  )}
                  {t.video_url && (
                    <a
                      href={t.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-xs text-sage-800 font-medium mt-1 inline-block"
                    >
                      ▶ Video
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setPicked('custom')}
        className="w-full border-2 border-dashed border-gray-300 rounded-xl py-3 text-sm text-gray-500 hover:border-gray-400 hover:text-sage-800 transition-colors"
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
        <input {...register('completed')} id="completed" type="checkbox" className="w-5 h-5 accent-sage-700" />
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
        className="w-full bg-sage-700 text-white py-3 rounded-xl font-medium disabled:opacity-50"
      >
        {isSubmitting ? 'Saving...' : 'Log Attempt'}
      </button>
    </form>
  )
}

function WisdomSection({ session }: { session: import('../types').Session }) {
  const updateSession = useUpdateSession()
  const [editing, setEditing] = useState(!session.wisdom)
  const [text, setText] = useState(session.wisdom ?? '')
  const [shared, setShared] = useState(session.wisdom_shared ?? false)

  const hasExisting = !!session.wisdom

  const handleSave = () => {
    updateSession.mutate(
      { id: session.id, wisdom: text.trim() || null, wisdom_shared: text.trim() ? shared : false },
      {
        onSuccess: () => { setEditing(false); toast.success('Wisdom sprayed! 🧠') },
        onError: () => toast.error('Failed to save'),
      },
    )
  }

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-2xl px-4 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-amber-800">🧠 Spraying Wisdom</p>
        {hasExisting && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-amber-600 hover:text-amber-800 font-medium"
          >
            Edit
          </button>
        )}
      </div>

      {hasExisting && !editing ? (
        <div>
          <p className="text-sm text-amber-900 italic">"{session.wisdom}"</p>
          {session.wisdom_shared && (
            <p className="text-xs text-amber-600 mt-1">Shared with friends 🌟</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={3}
            placeholder="Spray some wisdom… beta tips, banter, lessons learned."
            className="w-full border border-amber-200 bg-white rounded-xl px-3 py-2 text-sm placeholder-amber-300 focus:outline-none focus:border-amber-400"
          />
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <div
              onClick={() => setShared(s => !s)}
              className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${shared ? 'bg-sage-700' : 'bg-gray-200'}`}
            >
              <div className={`w-5 h-5 m-0.5 bg-white rounded-full shadow transition-transform ${shared ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
            <span className="text-sm text-amber-800">Share with friends 🌟</span>
          </label>
          <div className="flex gap-2">
            {hasExisting && (
              <button
                onClick={() => { setEditing(false); setText(session.wisdom ?? ''); setShared(session.wisdom_shared) }}
                className="flex-1 py-2.5 rounded-xl border border-amber-200 text-sm text-amber-700 font-medium"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={updateSession.isPending}
              className="flex-1 bg-sage-700 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {updateSession.isPending ? 'Saving…' : 'Spray wisdom'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
