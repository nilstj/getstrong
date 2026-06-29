import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Users, Trophy, Play, Send, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { useGymProblem, useCrew } from '../hooks/useCrew'
import { useGymLeaderboard } from '../hooks/useLeaderboard'
import { useStripGymProblem, useClaimGymProblem } from '../hooks/useGymProblems'
import { useSessions, useCreateSession } from '../hooks/useSessions'
import { useAddProblem } from '../hooks/useProblems'
import { BottomSheet } from '../components/BottomSheet'
import {
  useBoulderBetas,
  useAddBoulderBeta,
  useMarkBetaWorked,
  useUnmarkBetaWorked,
  useGymProblemReactions,
  useAddGymProblemReaction,
  useRemoveGymProblemReaction,
} from '../hooks/useBoulderBeta'
import { daysUntil } from '../utils/gymProblems'
import { cycleMonth } from '../utils/leaderboard'
import { crewTitles } from '../utils/crewTitles'
import { boulderToPrefill } from '../utils/boulderPrefill'
import { todayDateString } from '../utils/dates'
import { useAuth } from '../providers/AuthProvider'
import { Chip, HoldDot } from '../components/Chip'
import { BetaCard } from '../components/BetaCard'
import { CrewTitleBadge } from '../components/CrewTitleBadge'
import type { CrewState } from '../types'

const STATE_LABEL: Record<CrewState, string> = { projecting: 'Projecting', sent: 'Sent', flashed: 'Flashed' }
const STATE_CLASS: Record<CrewState, string> = {
  projecting: 'bg-gray-100 text-gray-600',
  sent: 'bg-sage-100 text-sage-700',
  flashed: 'bg-amber-100 text-amber-700',
}
const DIG_EMOJIS = ['🔥', '💪', '😂', '🐒', '🪨']
type Tab = 'beta' | 'crew' | 'banter'

export function CrewPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: boulder, isLoading: loadingBoulder } = useGymProblem(id)
  const { data: crew, isLoading: loadingCrew } = useCrew(id)
  const month = cycleMonth(new Date())
  const { data: leaderboard = [] } = useGymLeaderboard(boulder?.gym ?? '', month)
  const { data: betas = [] } = useBoulderBetas(id)
  const { data: reactions = [] } = useGymProblemReactions(id)
  const strip = useStripGymProblem()
  const addBeta = useAddBoulderBeta()
  const markWorked = useMarkBetaWorked()
  const unmarkWorked = useUnmarkBetaWorked()
  const addReaction = useAddGymProblemReaction()
  const removeReaction = useRemoveGymProblemReaction()
  const { data: sessions = [] } = useSessions()
  const createSession = useCreateSession()
  const addProblem = useAddProblem()
  const claim = useClaimGymProblem()

  const [tab, setTab] = useState<Tab>('beta')
  const [draft, setDraft] = useState('')
  const [draftVideo, setDraftVideo] = useState('')
  const [addOpen, setAddOpen] = useState(false)

  if (loadingBoulder || loadingCrew) {
    return <div className="p-5 text-sm text-gray-400">Loading boulder…</div>
  }
  if (!boulder) {
    return <div className="p-5 text-sm text-gray-400">This boulder no longer exists.</div>
  }

  const left = daysUntil(boulder.expires_at, new Date())
  const summary = crew?.summary
  const members = crew?.members ?? []
  const titles = crewTitles(crew?.problems ?? [])
  const title = boulder.name || `${boulder.color ?? ''} ${boulder.wall_angle ?? ''}`.trim() || 'Shared boulder'

  // Dig tallies from gym_problem_reactions
  const digTally = DIG_EMOJIS.map(emoji => {
    const rs = reactions.filter(r => r.emoji === emoji)
    return { emoji, count: rs.length, mine: rs.some(r => r.user_id === user?.id) }
  })
  const toggleDig = (emoji: string, mine: boolean) => {
    if (mine) removeReaction.mutate({ gymProblemId: id, emoji })
    else addReaction.mutate({ gymProblemId: id, emoji })
  }

  const submitBeta = () => {
    const body = draft.trim()
    const videoUrl = draftVideo.trim() || null
    if (!body && !videoUrl) return
    addBeta.mutate(
      { gymProblemId: id, body: body || null, videoUrl },
      {
        onSuccess: () => { setDraft(''); setDraftVideo(''); toast.success('Beta shared') },
        onError: () => toast.error('Could not post beta'),
      },
    )
  }

  const toggleWorked = (betaId: string, workedByMe: boolean) => {
    const v = { betaId, gymProblemId: id }
    if (workedByMe) unmarkWorked.mutate(v, { onError: () => toast.error('Could not update') })
    else markWorked.mutate(v, { onError: () => toast.error('Could not update') })
  }

  // Log this shared boulder into one of the caller's sessions (and claim it).
  const logBoulderInto = (sessionId: string) => {
    addProblem.mutate(
      {
        session_id: sessionId,
        ...boulderToPrefill(boulder),
        grade_system: 'font',
        attempts: 1,
        sent: false,
        board: null,
        board_angle: null,
        crag: null,
        notes: null,
      },
      {
        onSuccess: (created) => {
          claim.mutate(
            { problemId: created.id, gymProblemId: boulder.id },
            { onError: () => toast.error('Added, but linking to the boulder failed') },
          )
          setAddOpen(false)
          toast.success('Added to your session')
          navigate(`/sessions/${sessionId}`)
        },
        onError: () => toast.error('Could not add to session'),
      },
    )
  }

  const startNewSession = () => {
    createSession.mutate(
      { date: todayDateString(), location: boulder.gym, duration_minutes: null, intensity: null, goal: null, notes: null },
      {
        onSuccess: (s) => logBoulderInto(s.id),
        onError: () => toast.error('Could not start a session'),
      },
    )
  }
  const addBusy = addProblem.isPending || createSession.isPending || claim.isPending

  const TABS: { key: Tab; label: string }[] = [
    { key: 'beta', label: `Beta ${betas.length || ''}`.trim() },
    { key: 'crew', label: `Crew ${summary?.total ?? 0}` },
    { key: 'banter', label: `Banter ${reactions.length || ''}`.trim() },
  ]

  return (
    <div className="pb-32 lg:max-w-2xl lg:mx-auto">
      {/* Hero */}
      <div className="relative">
        <div className="relative aspect-[16/10] max-h-80 w-full bg-gradient-to-br from-sage-700 to-sage-900">
          {boulder.image_url && (
            <img src={boulder.image_url} alt={title} className="absolute inset-0 w-full h-full object-cover" />
          )}
          {boulder.beta_video_url && !boulder.image_url && (
            <span className="absolute inset-0 grid place-items-center">
              <Play size={48} className="text-white/90" fill="currentColor" />
            </span>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent" />
          <Link to="/dashboard" aria-label="Back"
            className="absolute left-3 top-3 z-10 grid place-items-center w-9 h-9 rounded-full bg-black/35 text-white">
            <ArrowLeft size={18} />
          </Link>
          <div className="absolute left-4 bottom-3 right-4 text-white">
            <h1 className="text-lg font-bold tracking-tight">{title}</h1>
            <div className="mt-1 flex items-center gap-2 text-xs">
              {boulder.community_grade && <Chip label={boulder.community_grade} variant="grade" />}
              {boulder.color && <HoldDot color={boulder.color} />}
              <span className="opacity-90">
                {[boulder.gym, summary ? `${summary.sent}/${summary.total} sent` : null].filter(Boolean).join(' · ')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Add to a session (only for active, non-expired boulders) */}
      {boulder.status === 'active' && left >= 0 && (
        <div className="px-4 py-3">
          <button type="button" onClick={() => setAddOpen(true)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sage-700 py-2.5 text-sm font-semibold text-white hover:bg-sage-800">
            <Plus size={16} strokeWidth={2.5} /> Add to a session
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${
              tab === t.key ? 'text-gray-900 shadow-[inset_0_-2px_0] shadow-sage-700' : 'text-gray-400'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 pt-4">
        {/* BETA */}
        {tab === 'beta' && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-3 space-y-2">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="Share beta or call someone out…"
                rows={2}
                className="w-full resize-none text-sm focus:outline-none placeholder:text-gray-400"
              />
              <input
                value={draftVideo}
                onChange={e => setDraftVideo(e.target.value)}
                placeholder="Beta video link (optional)"
                className="w-full text-xs text-gray-600 border-t border-gray-100 pt-2 focus:outline-none placeholder:text-gray-400"
              />
              <div className="flex justify-end">
                <button type="button" onClick={submitBeta}
                  disabled={addBeta.isPending || (!draft.trim() && !draftVideo.trim())}
                  className="inline-flex items-center gap-1.5 rounded-full bg-sage-700 px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
                  <Send size={14} /> Post
                </button>
              </div>
            </div>

            {betas.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">Be the first to crack it — share your beta.</p>
            ) : (
              betas.map((b, i) => (
                <BetaCard
                  key={b.id}
                  beta={b}
                  authorName={b.authorName ?? 'Someone'}
                  authorAvatarUrl={b.authorAvatarUrl}
                  best={i === 0 && b.worked_count > 0}
                  onToggleWorked={() => toggleWorked(b.id, b.worked_by_me)}
                />
              ))
            )}
          </div>
        )}

        {/* CREW */}
        {tab === 'crew' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="inline-flex items-center gap-1 font-semibold text-gray-700">
                <Users size={15} strokeWidth={2} /> {summary?.total ?? 0} {summary?.total === 1 ? 'climber' : 'climbers'}
              </span>
              {summary && summary.flashed > 0 && (
                <><span className="text-gray-400">·</span><span className="text-amber-600">{summary.flashed} flash{summary.flashed === 1 ? '' : 'es'}</span></>
              )}
              <span className="text-gray-400">·</span>
              <span className={left >= 0 ? 'text-sage-700 font-medium' : 'text-gray-400'}>
                {left >= 0 ? `${left} days left` : 'Stripped'}
              </span>
            </div>

            <div className="space-y-2">
              {members.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No one on this boulder yet.</p>
              ) : (
                members.map(m => (
                  <div key={m.user_id} className="flex items-center gap-3 p-3 border rounded-xl">
                    {m.avatar_url
                      ? <img src={m.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                      : <div className="w-9 h-9 rounded-full bg-gray-200 grid place-items-center text-sm font-semibold text-gray-500">
                          {(m.username ?? '?').slice(0, 1).toUpperCase()}
                        </div>}
                    <div className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-gray-800 truncate">{m.username ?? 'Someone'}</span>
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {(titles[m.user_id] ?? []).map(t => <CrewTitleBadge key={t} title={t} />)}
                      </span>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATE_CLASS[m.state]}`}>
                      {STATE_LABEL[m.state]}
                    </span>
                  </div>
                ))
              )}
            </div>

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

            {boulder.gym && leaderboard.length > 0 && (
              <div className="pt-2">
                <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-800 mb-2">
                  <Trophy size={15} strokeWidth={2} className="text-amber-500" />
                  {new Date(`${month}-01T00:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} leaderboard
                  <span className="font-normal text-gray-400">· {boulder.gym}</span>
                </h2>
                <div className="space-y-1">
                  {leaderboard.slice(0, 5).map(entry => (
                    <div key={entry.user_id}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm ${
                        entry.user_id === user?.id ? 'bg-sage-50 border border-sage-200' : 'bg-gray-50'
                      }`}>
                      <span className="w-5 text-center font-bold text-gray-400">{entry.rank}</span>
                      <span className="flex-1 font-medium text-gray-800 truncate">{entry.username ?? 'Someone'}</span>
                      <span className="font-semibold text-sage-700">{entry.points}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* BANTER */}
        {tab === 'banter' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Pile on — react to this boulder.</p>
            <div className="flex flex-wrap gap-2">
              {digTally.map(d => (
                <button key={d.emoji} type="button" onClick={() => toggleDig(d.emoji, d.mine)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    d.mine ? 'bg-sage-100 text-sage-800 ring-1 ring-sage-300' : 'bg-gray-100 text-gray-600'
                  }`}>
                  <span className="text-base" aria-hidden>{d.emoji}</span>
                  {d.count > 0 && <span>{d.count}</span>}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400">Text banter is coming soon — for now, let the emojis do the talking.</p>
          </div>
        )}
      </div>

      <BottomSheet open={addOpen} onClose={() => setAddOpen(false)} title="Add to a session">
        <button type="button" onClick={startNewSession} disabled={addBusy}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-sage-300 py-3 text-sm font-semibold text-sage-700 hover:bg-sage-50 disabled:opacity-50">
          <Plus size={16} strokeWidth={2.5} /> Start a new session{boulder.gym ? ` at ${boulder.gym}` : ''}
        </button>

        <p className="my-3 text-center text-xs text-gray-400">or add to an existing session</p>

        {sessions.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">No sessions yet.</p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {sessions.slice(0, 12).map(s => (
              <button key={s.id} type="button" onClick={() => logBoulderInto(s.id)} disabled={addBusy}
                className="w-full flex items-center justify-between gap-3 p-3 border rounded-xl text-left hover:bg-gray-50 disabled:opacity-50">
                <span className="text-sm font-medium text-gray-800 truncate">{s.location}</span>
                <span className="text-xs text-gray-400 flex-shrink-0">{s.date}</span>
              </button>
            ))}
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
