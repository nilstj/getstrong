import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Play } from 'lucide-react'
import { format } from 'date-fns'
import { useSessionProblems } from '../hooks/useProblems'
import { useProfile } from '../hooks/useProfile'
import { summarizeFriendSessions, type FriendProblemRow } from '../utils/friendSessions'
import { Chip, HoldDot } from '../components/Chip'
import { ImageLightbox } from '../components/ImageLightbox'
import type { Problem } from '../types'

function SendBadge({ p }: { p: Problem }) {
  if (!p.sent) return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-200 text-gray-600">Project</span>
  if (p.attempts === 1) return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-300 text-yellow-900">Flash ⚡</span>
  return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">Sent</span>
}

export function FriendSessionPage() {
  const { sessionId = '' } = useParams<{ sessionId: string }>()
  const { data: problems = [], isLoading } = useSessionProblems(sessionId)
  const { data: profile } = useProfile(problems[0]?.user_id)
  const [lightbox, setLightbox] = useState<string | null>(null)

  if (isLoading) return <div className="p-5 text-sm text-gray-400">Loading session…</div>
  if (problems.length === 0) return <div className="p-5 text-sm text-gray-400">This session has no shared problems.</div>

  const [summary] = summarizeFriendSessions(problems.map((p): FriendProblemRow => ({
    user_id: p.user_id,
    session_id: p.session_id,
    gym: p.gym,
    grade_value: p.grade_value,
    grade_value_font: p.grade_value_font,
    sent: p.sent,
    image_url: p.image_url,
    created_at: p.created_at,
  })))

  const date = (() => {
    try { return format(new Date(summary?.date ?? problems[0].created_at), 'EEEE d MMM') } catch { return '' }
  })()

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

      {summary && (
        <div className="px-4 pb-3 flex items-center gap-2 text-sm text-gray-600">
          <span className="font-semibold text-gray-800">
            {summary.problemCount} {summary.problemCount === 1 ? 'problem' : 'problems'}
          </span>
          <span className="text-gray-300">·</span>
          <span>{summary.sendCount} sent</span>
          {summary.topGrade && (
            <><span className="text-gray-300">·</span><Chip label={`up to ${summary.topGrade}`} variant="grade" /></>
          )}
        </div>
      )}

      <div className="px-4 space-y-2">
        {problems.map(p => (
          <div key={p.id} className="flex gap-3 bg-gray-50 rounded-2xl p-3">
            {p.image_url ? (
              <button type="button" onClick={() => setLightbox(p.image_url!)}
                className="flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 rounded-xl">
                <img src={p.image_url} alt="" className="w-16 h-16 object-cover rounded-xl" />
              </button>
            ) : p.beta_video_url ? (
              <a href={p.beta_video_url} target="_blank" rel="noopener noreferrer"
                className="w-16 h-16 rounded-xl bg-gray-800 grid place-items-center flex-shrink-0">
                <Play size={20} className="text-white" fill="currentColor" />
              </a>
            ) : (
              <div className="w-16 h-16 rounded-xl bg-gray-100 flex-shrink-0" />
            )}
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

      {lightbox && <ImageLightbox url={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}
