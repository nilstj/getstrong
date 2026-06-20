import { useParams, Link } from 'react-router-dom'
import { Users, ArrowLeft, Trophy } from 'lucide-react'
import toast from 'react-hot-toast'
import { useGymProblem, useCrew } from '../hooks/useCrew'
import { useGymLeaderboard } from '../hooks/useLeaderboard'
import { useStripGymProblem } from '../hooks/useGymProblems'
import { daysUntil } from '../utils/gymProblems'
import { cycleMonth } from '../utils/leaderboard'
import { useAuth } from '../providers/AuthProvider'
import type { CrewState } from '../types'

const STATE_LABEL: Record<CrewState, string> = {
  projecting: 'Projecting',
  sent: 'Sent',
  flashed: 'Flashed',
}
const STATE_CLASS: Record<CrewState, string> = {
  projecting: 'bg-gray-100 text-gray-600',
  sent: 'bg-sage-100 text-sage-700',
  flashed: 'bg-amber-100 text-amber-700',
}

export function CrewPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { data: boulder, isLoading: loadingBoulder } = useGymProblem(id)
  const { data: crew, isLoading: loadingCrew } = useCrew(id)
  const { user } = useAuth()
  const strip = useStripGymProblem()
  const month = cycleMonth(new Date())
  const { data: leaderboard = [] } = useGymLeaderboard(boulder?.gym ?? '', month)

  if (loadingBoulder || loadingCrew) {
    return <div className="p-5 text-sm text-gray-400">Loading crew…</div>
  }
  if (!boulder) {
    return <div className="p-5 text-sm text-gray-400">This boulder no longer exists.</div>
  }

  const left = daysUntil(boulder.expires_at, new Date())
  const summary = crew?.summary
  const members = crew?.members ?? []
  const title = boulder.name || `${boulder.color ?? ''} ${boulder.wall_angle ?? ''}`.trim() || 'Shared boulder'

  return (
    <div className="pb-10">
      <div className="flex items-center gap-2 px-5 py-4">
        <Link to="/dashboard" className="text-gray-500"><ArrowLeft size={20} /></Link>
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      </div>

      {boulder.image_url && (
        <img src={boulder.image_url} alt={title} className="w-full max-h-72 object-cover" />
      )}

      <div className="px-5 mt-4 space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
          {boulder.community_grade && <span className="font-semibold">{boulder.community_grade}</span>}
          {boulder.gym && <span>{boulder.gym}</span>}
          <span className={left >= 0 ? 'text-sage-700 font-medium' : 'text-gray-400'}>
            {left >= 0 ? `${left} days left` : 'Stripped'}
          </span>
        </div>

        {summary && (
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1 font-semibold text-gray-700">
              <Users size={15} strokeWidth={2} /> {summary.total} {summary.total === 1 ? 'climber' : 'climbers'}
            </span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-600">{summary.sent} sent ({Math.round(summary.sendRate * 100)}%)</span>
            {summary.flashed > 0 && (
              <>
                <span className="text-gray-400">·</span>
                <span className="text-amber-600">{summary.flashed} flash{summary.flashed === 1 ? '' : 'es'}</span>
              </>
            )}
          </div>
        )}

        {boulder.status === 'active' && left >= 0 && members.some(m => m.user_id === user?.id) && (
          <button
            onClick={() => {
              if (!confirm('Mark this boulder as stripped? It will be archived for everyone.')) return
              strip.mutate(boulder.id, {
                onSuccess: () => toast.success('Marked as stripped'),
                onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
              })
            }}
            disabled={strip.isPending}
            className="text-xs text-gray-400 hover:text-red-600 underline disabled:opacity-50"
          >
            This got stripped
          </button>
        )}

        <div className="space-y-2">
          {members.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No one on this boulder yet.</p>
          ) : (
            members.map(m => (
              <div key={m.user_id} className="flex items-center gap-3 p-3 border rounded-xl">
                {m.avatar_url
                  ? <img src={m.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                  : <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-500">
                      {(m.username ?? '?').slice(0, 1).toUpperCase()}
                    </div>}
                <span className="flex-1 text-sm font-medium text-gray-800 truncate">{m.username ?? 'Someone'}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATE_CLASS[m.state]}`}>
                  {STATE_LABEL[m.state]}
                </span>
              </div>
            ))
          )}
        </div>

        {boulder.gym && leaderboard.length > 0 && (
          <div className="pt-2">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-800 mb-2">
              <Trophy size={15} strokeWidth={2} className="text-amber-500" />
              {new Date(`${month}-01T00:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} leaderboard
              <span className="font-normal text-gray-400">· {boulder.gym}</span>
            </h2>
            <div className="space-y-1">
              {leaderboard.slice(0, 5).map(entry => (
                <div
                  key={entry.user_id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm ${
                    entry.user_id === user?.id ? 'bg-sage-50 border border-sage-200' : 'bg-gray-50'
                  }`}
                >
                  <span className="w-5 text-center font-bold text-gray-400">{entry.rank}</span>
                  <span className="flex-1 font-medium text-gray-800 truncate">{entry.username ?? 'Someone'}</span>
                  <span className="font-semibold text-sage-700">{entry.points}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
