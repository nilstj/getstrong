import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Users, Trophy, Play, Send, Plus, Pencil } from 'lucide-react'
import toast from 'react-hot-toast'
import { useGymProblem, useCrew } from '../hooks/useCrew'
import { useGymLeaderboard } from '../hooks/useLeaderboard'
import { useStripGymProblem, useClaimGymProblem } from '../hooks/useGymProblems'
import { useSessions, useCreateSession } from '../hooks/useSessions'
import { useAddProblem } from '../hooks/useProblems'
import { BottomSheet } from '../components/BottomSheet'
import {
  useBoulderBetaThread,
  useAddBoulderBeta,
  useMarkBetaWorked,
  useUnmarkBetaWorked,
  useAddBetaComment,
  useDeleteBetaComment,
  useToggleBetaReaction,
  useToggleBetaCommentReaction,
  type PersonLite,
} from '../hooks/useBoulderBeta'
import {
  useSetBoulderSetter,
  useBoulderReviews,
  useUpsertBoulderReview,
  useBoulderHelp,
  useRequestBetaHelp,
} from '../hooks/useBoulderExtras'
import { daysUntil } from '../utils/gymProblems'
import { cycleMonth } from '../utils/leaderboard'
import { crewTitles } from '../utils/crewTitles'
import { boulderToPrefill } from '../utils/boulderPrefill'
import { todayDateString } from '../utils/dates'
import { useAuth } from '../providers/AuthProvider'
import { Chip, HoldDot } from '../components/Chip'
import { BetaThreadCard } from '../components/BetaThreadCard'
import { CrewTitleBadge } from '../components/CrewTitleBadge'
import { StarRating } from '../components/StarRating'
import { GymThumb } from '../components/GymThumb'
import { ImageLightbox } from '../components/ImageLightbox'
import type { CrewState, BetaSection, BetaBodyType } from '../types'

const STATE_LABEL: Record<CrewState, string> = { projecting: 'Projecting', sent: 'Sent', flashed: 'Flashed' }
// Sendtrain theme: flashers ride the speed train, senders chug in on the coal train.
const STATE_ICON: Record<CrewState, string> = { projecting: '', sent: '🚂', flashed: '🚄' }
const STATE_CLASS: Record<CrewState, string> = {
  projecting: 'bg-gray-100 text-gray-600',
  sent: 'bg-sage-100 text-sage-700',
  flashed: 'bg-amber-100 text-amber-700',
}
type Tab = 'beta' | 'sendtrain' | 'setter'
const SECTIONS: BetaSection[] = ['start', 'crux', 'top']
const SECTION_LABEL: Record<BetaSection, string> = { start: 'Start', crux: 'Crux', top: 'Top-out' }
const BODY_TYPES: BetaBodyType[] = ['tall', 'neutral', 'short']
const BODY_LABEL: Record<BetaBodyType, string> = { tall: 'Tall', neutral: 'Any', short: 'Short' }

function PeopleRow({ people }: { people: PersonLite[] }) {
  return (
    <div className="flex items-center -space-x-1.5">
      {people.slice(0, 8).map(p => (
        p.avatarUrl
          ? <img key={p.user_id} src={p.avatarUrl} alt={p.name ?? ''} title={p.name ?? ''} className="w-6 h-6 rounded-full object-cover border-2 border-gray-50" />
          : <span key={p.user_id} title={p.name ?? ''} className="w-6 h-6 rounded-full bg-sage-100 border-2 border-gray-50 grid place-items-center text-[10px] font-semibold text-sage-700">{(p.name ?? '?').slice(0, 1).toUpperCase()}</span>
      ))}
    </div>
  )
}

export function CrewPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: boulder, isLoading: loadingBoulder } = useGymProblem(id)
  const { data: crew, isLoading: loadingCrew } = useCrew(id)
  const month = cycleMonth(new Date())
  const { data: leaderboard = [] } = useGymLeaderboard(boulder?.gym ?? '', month)
  const { data: betaData } = useBoulderBetaThread(id)
  const { data: reviewsData } = useBoulderReviews(id)
  const { data: help } = useBoulderHelp(id)
  const requestHelp = useRequestBetaHelp()
  const strip = useStripGymProblem()
  const addBeta = useAddBoulderBeta()
  const markWorked = useMarkBetaWorked()
  const unmarkWorked = useUnmarkBetaWorked()
  const addBetaComment = useAddBetaComment()
  const deleteBetaComment = useDeleteBetaComment()
  const toggleBetaReaction = useToggleBetaReaction()
  const toggleBetaCommentReaction = useToggleBetaCommentReaction()
  const setSetter = useSetBoulderSetter()
  const upsertReview = useUpsertBoulderReview()
  const { data: sessions = [] } = useSessions()
  const createSession = useCreateSession()
  const addProblem = useAddProblem()
  const claim = useClaimGymProblem()

  const [tab, setTab] = useState<Tab>('beta')
  const [draft, setDraft] = useState('')
  const [draftVideo, setDraftVideo] = useState('')
  const [draftSection, setDraftSection] = useState<BetaSection | null>(null)
  const [draftBody, setDraftBody] = useState<BetaBodyType | null>(null)
  const [askOpen, setAskOpen] = useState(false)
  const [askNote, setAskNote] = useState('')
  const [askVideo, setAskVideo] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [editingSetter, setEditingSetter] = useState(false)
  const [setterDraft, setSetterDraft] = useState('')
  const [editingReview, setEditingReview] = useState(false)
  const [reviewStars, setReviewStars] = useState(0)
  const [reviewText, setReviewText] = useState('')

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

  const myReview = reviewsData?.myReview ?? null
  const otherReviews = (reviewsData?.reviews ?? []).filter(r => r.user_id !== user?.id)

  const threads = betaData?.threads ?? []
  const asking = betaData?.asking ?? []
  const workedPeople = betaData?.worked ?? []

  const submitBeta = () => {
    const body = draft.trim()
    const videoUrl = draftVideo.trim() || null
    if (!body && !videoUrl) return
    addBeta.mutate(
      { gymProblemId: id, body: body || null, videoUrl, section: draftSection, bodyType: draftBody },
      {
        onSuccess: () => { setDraft(''); setDraftVideo(''); setDraftSection(null); setDraftBody(null); toast.success('Beta shared') },
        onError: () => toast.error('Could not post beta'),
      },
    )
  }

  const toggleWorked = (betaId: string, workedByMe: boolean) => {
    const v = { betaId, gymProblemId: id }
    if (workedByMe) unmarkWorked.mutate(v, { onError: () => toast.error('Could not update') })
    else markWorked.mutate(v, { onError: () => toast.error('Could not update') })
  }

  const submitAsk = () => {
    requestHelp.mutate(
      { gymProblemId: id, note: askNote.trim() || null, videoUrl: askVideo.trim() || null },
      {
        onSuccess: () => { setAskOpen(false); setAskNote(''); setAskVideo(''); toast.success('Asked for beta help') },
        onError: () => toast.error('Could not ask for help'),
      },
    )
  }

  const editSetter = () => { setSetterDraft(boulder.setter ?? ''); setEditingSetter(true) }
  const saveSetter = () => {
    setSetter.mutate(
      { gymProblemId: id, setter: setterDraft },
      { onSuccess: () => { setEditingSetter(false); toast.success('Setter updated') }, onError: () => toast.error('Could not save setter') },
    )
  }

  const editReview = () => { setReviewStars(myReview?.stars ?? 0); setReviewText(myReview?.review ?? ''); setEditingReview(true) }
  const saveReview = () => {
    if (reviewStars < 1) { toast.error('Pick a star rating first'); return }
    upsertReview.mutate(
      { gymProblemId: id, stars: reviewStars, review: reviewText.trim() || null },
      { onSuccess: () => { setEditingReview(false); toast.success('Review saved') }, onError: () => toast.error('Could not save review') },
    )
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
    { key: 'beta', label: 'Beta' },
    { key: 'sendtrain', label: 'Sendtrain' },
    { key: 'setter', label: 'Setter' },
  ]

  return (
    <div className="pb-32 lg:max-w-2xl lg:mx-auto">
      {/* Hero */}
      <div className="relative aspect-[16/10] max-h-80 w-full bg-gradient-to-br from-sage-700 to-sage-900">
        {boulder.image_url ? (
          <button type="button" onClick={() => setLightbox(boulder.image_url!)} aria-label="View photo"
            className="absolute inset-0 w-full h-full focus:outline-none">
            <img src={boulder.image_url} alt={title} className="absolute inset-0 w-full h-full object-cover" />
          </button>
        ) : (
          <GymThumb gym={boulder.gym} className="absolute inset-0 w-full h-full" />
        )}
        {boulder.beta_video_url && !boulder.image_url && (
          <span className="absolute inset-0 grid place-items-center pointer-events-none">
            <Play size={48} className="text-white drop-shadow" fill="currentColor" />
          </span>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent pointer-events-none" />
        <Link to="/dashboard" aria-label="Back"
          className="absolute left-3 top-3 z-10 grid place-items-center w-9 h-9 rounded-full bg-black/35 text-white">
          <ArrowLeft size={18} />
        </Link>
        {boulder.beta_video_url && (
          <a href={boulder.beta_video_url} target="_blank" rel="noopener noreferrer"
            className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
            <Play size={13} fill="currentColor" /> Watch video
          </a>
        )}
        <div className="absolute left-4 bottom-3 right-4 text-white pointer-events-none">
          <h1 className="text-lg font-bold tracking-tight">{title}</h1>
          <div className="mt-1 flex items-center gap-2 text-xs">
            {(boulder.community_grade ?? crew?.communityGrade) && (
              <Chip label={(boulder.community_grade ?? crew?.communityGrade)!} variant="grade" />
            )}
            {boulder.color && <HoldDot color={boulder.color} />}
            {help?.open && (
              <span className="inline-flex items-center rounded-md bg-amber-400 px-1.5 py-0.5 text-[11px] font-bold text-amber-950">🆘 Help wanted</span>
            )}
            <span className="opacity-90">
              {[boulder.gym, summary ? `${summary.sent}/${summary.total} sent` : null].filter(Boolean).join(' · ')}
            </span>
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
        {/* SENDTRAIN (the crew) */}
        {tab === 'sendtrain' && (
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
                      {STATE_ICON[m.state] && <span aria-hidden>{STATE_ICON[m.state]} </span>}{STATE_LABEL[m.state]}
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

        {/* BETA (beta thread + comments + reactions) */}
        {tab === 'beta' && (
          <div className="space-y-4">
            {/* Beta exchange overview */}
            <div className="rounded-2xl bg-gray-50 p-3 space-y-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1.5">🆘 Asking for beta</p>
                {asking.length === 0 ? (
                  <p className="text-xs text-gray-400">no one right now</p>
                ) : (
                  <div className="space-y-1.5">
                    {asking.map(a => (
                      <div key={a.user_id} className="flex items-start gap-2 text-sm">
                        {a.avatarUrl
                          ? <img src={a.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0 mt-0.5" />
                          : <span className="w-6 h-6 rounded-full bg-sage-100 grid place-items-center text-[10px] font-semibold text-sage-700 flex-shrink-0 mt-0.5">{(a.name ?? '?').slice(0, 1).toUpperCase()}</span>}
                        <div className="min-w-0 flex-1">
                          <span className="font-medium">{a.name ?? 'Someone'}</span>
                          {a.note && <span className="text-gray-600"> — {a.note}</span>}
                          {a.videoUrl && (
                            <a href={a.videoUrl} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-sage-700 font-medium">
                              <Play size={11} fill="currentColor" /> video
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500 flex-shrink-0">✅ Found working beta</span>
                {workedPeople.length > 0 ? <PeopleRow people={workedPeople} /> : <span className="text-xs text-gray-400">not yet</span>}
              </div>
              {help?.mineOpen ? (
                <p className="text-xs text-amber-700 font-medium">You’re asking for beta — mark a beta that worked to clear it.</p>
              ) : askOpen ? (
                <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5">
                  <textarea value={askNote} onChange={e => setAskNote(e.target.value)} rows={2}
                    placeholder="What's got you stuck? (optional)"
                    className="w-full resize-none bg-transparent text-sm focus:outline-none placeholder:text-amber-700/50" />
                  <input value={askVideo} onChange={e => setAskVideo(e.target.value)}
                    placeholder="Video of your attempt (optional link)"
                    className="w-full bg-transparent text-xs text-amber-900 focus:outline-none placeholder:text-amber-700/50" />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setAskOpen(false)} className="px-2 py-1.5 text-xs text-gray-500">Cancel</button>
                    <button type="button" onClick={submitAsk} disabled={requestHelp.isPending}
                      className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                      🆘 Ask for beta
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setAskOpen(true)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50">
                  🆘 Ask for beta help
                </button>
              )}
            </div>

            {/* Share beta */}
            <div className="rounded-2xl border border-gray-200 bg-white p-3 space-y-2">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="Share beta — how does the move go?"
                rows={2}
                className="w-full resize-none text-sm focus:outline-none placeholder:text-gray-400"
              />
              <input
                value={draftVideo}
                onChange={e => setDraftVideo(e.target.value)}
                placeholder="Beta video link (optional)"
                className="w-full text-xs text-gray-600 focus:outline-none placeholder:text-gray-400"
              />
              <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2">
                <span className="text-[11px] text-gray-400">Section</span>
                {SECTIONS.map(s => (
                  <button key={s} type="button" onClick={() => setDraftSection(draftSection === s ? null : s)}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${draftSection === s ? 'bg-sage-700 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {SECTION_LABEL[s]}
                  </button>
                ))}
                <span className="text-[11px] text-gray-400 ml-2">For</span>
                {BODY_TYPES.map(bt => (
                  <button key={bt} type="button" onClick={() => setDraftBody(draftBody === bt ? null : bt)}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${draftBody === bt ? 'bg-sage-700 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {BODY_LABEL[bt]}
                  </button>
                ))}
                <span className="flex-1" />
                <button type="button" onClick={submitBeta}
                  disabled={addBeta.isPending || (!draft.trim() && !draftVideo.trim())}
                  className="inline-flex items-center gap-1.5 rounded-full bg-sage-700 px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
                  <Send size={14} /> Post beta
                </button>
              </div>
            </div>

            {threads.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">Be the first to crack it — share your beta.</p>
            ) : (
              threads.map((t, i) => (
                <BetaThreadCard
                  key={t.id}
                  thread={t}
                  best={i === 0 && t.worked_count > 0}
                  currentUserId={user?.id}
                  onToggleWorked={() => toggleWorked(t.id, t.worked_by_me)}
                  onReactBeta={(emoji, mine) => toggleBetaReaction.mutate({ betaId: t.id, gymProblemId: id, emoji, mine })}
                  onAddReply={(body) => addBetaComment.mutate({ betaId: t.id, gymProblemId: id, body }, { onError: () => toast.error('Could not reply') })}
                  onDeleteReply={(commentId) => deleteBetaComment.mutate({ commentId, gymProblemId: id })}
                  onReactReply={(commentId, emoji, mine) => toggleBetaCommentReaction.mutate({ commentId, gymProblemId: id, emoji, mine })}
                />
              ))
            )}
          </div>
        )}

        {/* SETTER (setter name + star reviews) */}
        {tab === 'setter' && (
          <div className="space-y-5">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1.5">Setter</h3>
              {editingSetter ? (
                <div className="flex items-center gap-2">
                  <input autoFocus value={setterDraft} onChange={e => setSetterDraft(e.target.value)}
                    placeholder="Who set it?"
                    className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500" />
                  <button type="button" onClick={saveSetter} disabled={setSetter.isPending}
                    className="rounded-lg bg-sage-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Save</button>
                  <button type="button" onClick={() => setEditingSetter(false)} className="px-2 py-2 text-sm text-gray-500">Cancel</button>
                </div>
              ) : (
                <button type="button" onClick={editSetter}
                  className="inline-flex items-center gap-2 text-sm text-gray-800 hover:text-sage-700">
                  <span className="font-medium">{boulder.setter || 'Add the setter'}</span>
                  <Pencil size={14} className="text-gray-400" />
                </button>
              )}
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1.5">Rating</h3>
              <div className="flex items-center gap-2">
                <StarRating value={reviewsData?.average ?? 0} size={22} />
                <span className="text-sm font-semibold text-gray-800">{reviewsData?.average ? reviewsData.average.toFixed(1) : '—'}</span>
                <span className="text-xs text-gray-400">({reviewsData?.count ?? 0})</span>
              </div>

              {/* Your review */}
              <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-3">
                {myReview && !editingReview ? (
                  <div>
                    <div className="flex items-center justify-between">
                      <StarRating value={myReview.stars} />
                      <button type="button" onClick={editReview} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-sage-700">
                        <Pencil size={12} /> Edit
                      </button>
                    </div>
                    {myReview.review && <p className="mt-1.5 text-sm text-gray-700">{myReview.review}</p>}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Your rating</span>
                      <StarRating value={reviewStars} onChange={setReviewStars} size={24} />
                    </div>
                    <textarea value={reviewText} onChange={e => setReviewText(e.target.value)} rows={2}
                      placeholder="Add a review (optional)…"
                      className="w-full resize-none text-sm border-t border-gray-100 pt-2 focus:outline-none placeholder:text-gray-400" />
                    <div className="flex justify-end gap-2">
                      {myReview && <button type="button" onClick={() => setEditingReview(false)} className="px-2 py-1.5 text-sm text-gray-500">Cancel</button>}
                      <button type="button" onClick={saveReview} disabled={upsertReview.isPending}
                        className="rounded-full bg-sage-700 px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Save review</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Other reviews */}
              <div className="mt-3 space-y-3">
                {otherReviews.map(r => (
                  <div key={r.user_id} className="flex items-start gap-2.5">
                    <span className="w-7 h-7 rounded-full bg-cover bg-center bg-sage-100 flex-shrink-0 mt-0.5"
                      style={r.authorAvatarUrl ? { backgroundImage: `url(${r.authorAvatarUrl})` } : undefined} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{r.authorName ?? 'Someone'}</span>
                        <StarRating value={r.stars} size={13} />
                      </div>
                      {r.review && <p className="text-sm text-gray-700">{r.review}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
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

      {lightbox && <ImageLightbox url={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}
