import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Play, Dumbbell, Trophy } from 'lucide-react'
import { format } from 'date-fns'
import { useSessionProblems } from '../hooks/useProblems'
import { useSessionExercises } from '../hooks/useExercises'
import { useSessionChallengeAttempts } from '../hooks/useChallenges'
import { useProfile } from '../hooks/useProfile'
import { summarizeFriendSessions, type FriendProblemRow, type FriendActivityRow } from '../utils/friendSessions'
import { Chip, HoldDot } from '../components/Chip'
import { BoardThumb } from '../components/BoardThumb'
import { GymThumb } from '../components/GymThumb'
import { ImageLightbox } from '../components/ImageLightbox'
import { VideoBadge } from '../components/VideoBadge'
import type { Problem, Exercise } from '../types'

function SendBadge({ p }: { p: Problem }) {
  if (!p.sent) return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-200 text-gray-600">Project</span>
  if (p.attempts === 1) return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-300 text-yellow-900">Flash ⚡</span>
  return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">Sent</span>
}

function exerciseDetail(e: Exercise): string {
  if (e.type === 'reps' && e.sets != null && e.reps != null) return `${e.sets}×${e.reps}${e.weight_kg != null ? ` · ${e.weight_kg}kg` : ''}`
  if (e.type === 'time' && e.duration_seconds != null) return `${e.sets != null ? `${e.sets}× ` : ''}${e.duration_seconds}s`
  return [e.sets != null ? `${e.sets} sets` : null, e.weight_kg != null ? `${e.weight_kg}kg` : null].filter(Boolean).join(' · ')
}

export function FriendSessionPage() {
  const { sessionId = '' } = useParams<{ sessionId: string }>()
  const { data: problems = [], isLoading: pLoading } = useSessionProblems(sessionId)
  const { data: exercises = [], isLoading: eLoading } = useSessionExercises(sessionId)
  const { data: attempts = [], isLoading: cLoading } = useSessionChallengeAttempts(sessionId)
  const authorId = problems[0]?.user_id ?? exercises[0]?.user_id ?? attempts[0]?.user_id
  const { data: profile } = useProfile(authorId)
  const [lightbox, setLightbox] = useState<string | null>(null)

  if (pLoading || eLoading || cLoading) return <div className="p-5 text-sm text-gray-400">Loading session…</div>
  if (problems.length === 0 && exercises.length === 0 && attempts.length === 0) {
    return <div className="p-5 text-sm text-gray-400">This session has no shared activity.</div>
  }

  const [summary] = summarizeFriendSessions({
    problems: problems.map((p): FriendProblemRow => ({
      user_id: p.user_id, session_id: p.session_id, gym: p.gym,
      grade_value: p.grade_value, grade_value_font: p.grade_value_font,
      sent: p.sent, image_url: p.image_url, beta_video_url: p.beta_video_url, created_at: p.created_at,
    })),
    exercises: exercises.map((e): FriendActivityRow => ({ user_id: e.user_id, session_id: e.session_id, created_at: e.created_at })),
    challenges: attempts.map((a): FriendActivityRow => ({ user_id: a.user_id, session_id: a.session_id, created_at: a.created_at })),
  })

  const firstCreated = problems[0]?.created_at ?? exercises[0]?.created_at ?? attempts[0]?.created_at
  const date = (() => {
    try { return format(new Date(summary?.date ?? firstCreated), 'EEEE d MMM') } catch { return '' }
  })()

  const summaryParts = [
    summary && summary.problemCount > 0 ? `${summary.problemCount} ${summary.problemCount === 1 ? 'problem' : 'problems'} · ${summary.sendCount} sent` : null,
    summary && summary.exerciseCount > 0 ? `${summary.exerciseCount} ${summary.exerciseCount === 1 ? 'exercise' : 'exercises'}` : null,
    summary && summary.challengeCount > 0 ? `${summary.challengeCount} ${summary.challengeCount === 1 ? 'challenge' : 'challenges'}` : null,
  ].filter(Boolean)

  return (
    <div className="pb-32 lg:max-w-2xl lg:mx-auto">
      <div className="flex items-center gap-3 px-4 py-3">
        <Link to="/dashboard" aria-label="Back" className="text-gray-500"><ArrowLeft size={20} /></Link>
        <span className="w-9 h-9 rounded-full bg-cover bg-center bg-sage-100 flex-shrink-0"
          style={profile?.avatar_url ? { backgroundImage: `url(${profile.avatar_url})` } : undefined} />
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight truncate">{profile?.username ?? 'Someone'}</p>
          <p className="text-[11px] text-gray-400">{[summary?.gym, date].filter(Boolean).join(' · ')}</p>
        </div>
      </div>

      <div className="px-4 pb-3 flex items-center flex-wrap gap-2 text-sm text-gray-600">
        <span>{summaryParts.join(' · ')}</span>
        {summary?.topGrade && <Chip label={`up to ${summary.topGrade}`} variant="grade" />}
      </div>

      {problems.length > 0 && (
        <div className="px-4 space-y-2">
          {problems.map(p => (
            <div key={p.id} className="flex gap-3 bg-gray-50 rounded-2xl p-3">
              <div className="relative flex-shrink-0">
                {p.image_url ? (
                  <button type="button" onClick={() => setLightbox(p.image_url!)}
                    className="focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 rounded-xl">
                    <img src={p.image_url} alt="" className="w-16 h-16 object-cover rounded-xl" />
                  </button>
                ) : p.board ? (
                  <BoardThumb board={p.board} angle={p.board_angle} className="w-16 h-16 rounded-xl" />
                ) : p.gym ? (
                  <GymThumb gym={p.gym} compact className="w-16 h-16 rounded-xl" />
                ) : p.beta_video_url ? (
                  <a href={p.beta_video_url} target="_blank" rel="noopener noreferrer"
                    className="w-16 h-16 rounded-xl bg-gray-800 grid place-items-center">
                    <Play size={20} className="text-white" fill="currentColor" />
                  </a>
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-gray-100" />
                )}
                {p.beta_video_url && (p.image_url || p.board || p.gym) && (
                  <VideoBadge href={p.beta_video_url} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {(p.grade_value_font ?? p.grade_value) && (
                    <Chip label={(p.grade_value_font ?? p.grade_value)!} variant="grade" />
                  )}
                  {p.color && <HoldDot color={p.color} />}
                  <SendBadge p={p} />
                  {p.board && (
                    <span className="inline-flex items-center rounded-md bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700">
                      {p.board}{p.board_angle != null ? ` ${p.board_angle}°` : ''}
                    </span>
                  )}
                </div>
                {p.name && <p className="text-sm font-medium text-gray-800 mt-1 truncate">{p.name}</p>}
                {p.notes && <p className="text-xs text-gray-500 mt-0.5">{p.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {exercises.length > 0 && (
        <div className="px-4 mt-4">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
            <Dumbbell size={14} strokeWidth={2} /> Exercises
          </h2>
          <div className="space-y-2">
            {exercises.map(e => (
              <div key={e.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                <span className="text-sm font-medium text-gray-800 truncate">{e.name}</span>
                <span className="text-xs text-gray-500 flex-shrink-0">{exerciseDetail(e)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {attempts.length > 0 && (
        <div className="px-4 mt-4">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
            <Trophy size={14} strokeWidth={2} className="text-amber-500" /> Challenges
          </h2>
          <div className="space-y-2">
            {attempts.map(a => (
              <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                <span className="text-sm font-medium text-gray-800 truncate">{a.challenges?.title ?? 'Challenge'}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${a.completed ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                  {a.completed ? 'Completed' : 'Attempted'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {lightbox && <ImageLightbox url={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}
