import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Trophy, UserPlus, Check, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../providers/AuthProvider'
import { useProfile } from '../hooks/useProfile'
import { useFollowing } from '../hooks/useFollows'
import {
  useCrewGroup, useCrewMembers, useCrewPendingInvites, useCrewLeaderboard,
  useCrewActivityFeed, useInviteToCrew, useLeaveCrew, useDeleteCrew,
  useCrewBattles, useCrewBattleScore, useRespondCrewBattle, type CrewBattle,
  useCrewMessages, usePostCrewMessage, useDeleteCrewMessage,
} from '../hooks/useCrews'
import { SetterBadge } from '../components/SetterBadge'
import { FriendSessionCard } from '../components/FriendSessionCard'
import { BottomSheet } from '../components/BottomSheet'
import { cycleMonth } from '../utils/leaderboard'
import { weeklyStreak } from '../utils/crewStreak'

export function CrewGroupPage() {
  const { crewId = '' } = useParams<{ crewId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: crew, isLoading } = useCrewGroup(crewId)
  const { data: members = [] } = useCrewMembers(crewId)
  const { data: pending = [] } = useCrewPendingInvites(crewId)
  const month = cycleMonth(new Date())
  const memberIds = members.map(m => m.user_id)
  const { data: standings = [] } = useCrewLeaderboard(memberIds, month)
  const { data: feed = [] } = useCrewActivityFeed(memberIds)
  const { data: battles = [] } = useCrewBattles(crewId)
  const leaveCrew = useLeaveCrew()
  const deleteCrew = useDeleteCrew()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)

  const myRole = members.find(m => m.user_id === user?.id)?.role
  const amMember = !!myRole
  const amOwner = myRole === 'owner'

  if (isLoading) return <div className="p-5 text-sm text-gray-400">Loading crew…</div>
  if (!crew) return <div className="p-5 text-sm text-gray-400">This crew no longer exists.</div>

  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
  const streak = weeklyStreak(feed.map(f => f.date), new Date())

  const leave = () => {
    leaveCrew.mutate(crewId, {
      onSuccess: () => { toast.success('Left the crew'); navigate('/crews') },
      onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to leave'),
    })
  }
  const remove = () => {
    deleteCrew.mutate(crewId, {
      onSuccess: () => { toast.success('Crew deleted'); navigate('/crews') },
      onError: () => toast.error('Failed to delete'),
    })
  }

  return (
    <div className="p-4 pb-32 lg:max-w-2xl lg:mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/crews')} aria-label="Back" className="text-gray-400 hover:text-gray-700"><ArrowLeft size={20} /></button>
        <div className="w-11 h-11 rounded-xl bg-sage-50 grid place-items-center text-2xl flex-shrink-0">{crew.emoji ?? '🧗'}</div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate leading-tight">{crew.name}</h1>
          <p className="text-xs text-gray-500 truncate">
            {members.length} {members.length === 1 ? 'member' : 'members'}{crew.home_gym ? ` · ${crew.home_gym}` : ''}{streak > 0 ? ` · 🔥 ${streak}-week streak` : ''}
          </p>
        </div>
        {amMember && (
          <button onClick={() => setInviteOpen(true)} className="inline-flex items-center gap-1.5 rounded-full bg-sage-700 text-white px-3 py-2 text-sm font-semibold">
            <UserPlus size={15} strokeWidth={2.25} /> Invite
          </button>
        )}
      </div>

      {/* Standings */}
      <div>
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-800 mb-2">
          <Trophy size={15} strokeWidth={2} className="text-amber-500" /> {monthLabel} standings
        </h2>
        <div className="bg-white border border-gray-100 rounded-2xl p-2">
          {standings.map((row, i) => (
            <div key={row.user_id}
              className={`flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm ${row.user_id === user?.id ? 'bg-sage-50' : ''}`}>
              <span className="w-5 text-center font-bold text-gray-400 tabular-nums">{i + 1}</span>
              <span className="w-7 h-7 rounded-full bg-sage-100 grid place-items-center text-[11px] font-semibold text-sage-700 overflow-hidden flex-shrink-0">
                {row.avatar_url ? <img src={row.avatar_url} alt="" className="w-full h-full object-cover" /> : (row.username ?? '?').slice(0, 1).toUpperCase()}
              </span>
              <span className="flex-1 font-medium text-gray-800 truncate inline-flex items-center gap-1">
                {row.username ?? 'Someone'} <SetterBadge userId={row.user_id} />
              </span>
              <span className="font-bold text-sage-700 tabular-nums">{row.points}</span>
            </div>
          ))}
          <p className="text-[11px] text-gray-400 text-center px-2 py-1.5">Points earned this month across your gyms.</p>
        </div>
      </div>

      {/* Members */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Members</h2>
        <div className="space-y-2">
          {members.map(m => (
            <div key={m.user_id} className="flex items-center gap-3 bg-gray-50 rounded-2xl p-3">
              <span className="w-9 h-9 rounded-full bg-sage-100 grid place-items-center text-sm font-semibold text-sage-700 overflow-hidden flex-shrink-0">
                {m.avatar_url ? <img src={m.avatar_url} alt="" className="w-full h-full object-cover" /> : (m.username ?? '?').slice(0, 1).toUpperCase()}
              </span>
              <span className="flex-1 font-medium text-sm text-gray-800 truncate inline-flex items-center gap-1">
                {m.username ?? 'Someone'} <SetterBadge userId={m.user_id} />
              </span>
              {m.role === 'owner' && <span className="text-[10px] font-semibold uppercase tracking-wide text-sage-600 bg-sage-50 rounded-full px-2 py-0.5">Owner</span>}
            </div>
          ))}
          {pending.map(p => (
            <div key={p.user_id} className="flex items-center gap-3 bg-gray-50/60 rounded-2xl p-3 opacity-70">
              <span className="w-9 h-9 rounded-full bg-gray-200 grid place-items-center text-sm font-semibold text-gray-500 overflow-hidden flex-shrink-0">
                {p.avatar_url ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" /> : (p.username ?? '?').slice(0, 1).toUpperCase()}
              </span>
              <span className="flex-1 font-medium text-sm text-gray-500 truncate">{p.username ?? 'Someone'}</span>
              <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Invited</span>
            </div>
          ))}
        </div>
      </div>

      {/* Battles */}
      {battles.length > 0 && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Battles</h2>
          <div className="space-y-2">
            {battles.map(b => <BattleCard key={b.id} battle={b} thisCrewId={crewId} amMember={amMember} />)}
          </div>
        </div>
      )}

      {/* Crew feed */}
      {feed.length > 0 && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Crew feed</h2>
          <div className="space-y-3">
            {feed.slice(0, 15).map(s => (
              <FriendSessionCard key={s.sessionId} session={s} to={`/friends/sessions/${s.sessionId}`} />
            ))}
          </div>
        </div>
      )}

      {/* Banter */}
      {amMember && <CrewBanter crewId={crewId} />}

      {/* Leave / delete */}
      {amMember && (
        <div className="pt-2 flex justify-center">
          {amOwner ? (
            confirmLeave ? (
              <div className="flex items-center gap-3">
                <button onClick={remove} disabled={deleteCrew.isPending} className="text-sm text-red-600 font-semibold disabled:opacity-50">
                  {deleteCrew.isPending ? 'Deleting…' : 'Delete crew'}
                </button>
                <button onClick={() => setConfirmLeave(false)} className="text-sm text-gray-400">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmLeave(true)} className="text-xs text-gray-400 hover:text-red-500">Delete crew</button>
            )
          ) : (
            confirmLeave ? (
              <div className="flex items-center gap-3">
                <button onClick={leave} disabled={leaveCrew.isPending} className="text-sm text-red-600 font-semibold disabled:opacity-50">
                  {leaveCrew.isPending ? 'Leaving…' : 'Leave crew'}
                </button>
                <button onClick={() => setConfirmLeave(false)} className="text-sm text-gray-400">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmLeave(true)} className="text-xs text-gray-400 hover:text-red-500">Leave crew</button>
            )
          )}
        </div>
      )}

      <InviteSheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        crewId={crewId}
        excludeIds={new Set([...memberIds, ...pending.map(p => p.user_id)])}
      />
    </div>
  )
}

function CrewBanter({ crewId }: { crewId: string }) {
  const { user } = useAuth()
  const { data: messages = [] } = useCrewMessages(crewId)
  const post = usePostCrewMessage()
  const del = useDeleteCrewMessage()
  const [text, setText] = useState('')
  const send = () => {
    const body = text.trim()
    if (!body) return
    post.mutate({ crewId, body }, { onSuccess: () => setText(''), onError: () => toast.error('Failed to send') })
  }
  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Banter</h2>
      <div className="bg-gray-50 rounded-2xl p-3 space-y-2.5">
        {messages.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-2">No banter yet. Say something. 🔥</p>
        ) : messages.map(m => (
          <div key={m.id} className="flex items-start gap-2">
            <span className="w-6 h-6 rounded-full bg-sage-100 grid place-items-center text-[10px] font-semibold text-sage-700 overflow-hidden flex-shrink-0 mt-0.5">
              {m.avatar_url ? <img src={m.avatar_url} alt="" className="w-full h-full object-cover" /> : (m.username ?? '?').slice(0, 1).toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-tight"><span className="font-semibold">{m.username ?? 'Someone'}</span> <SetterBadge userId={m.user_id} className="align-text-bottom" /></p>
              <p className="text-sm text-gray-700 break-words">{m.body}</p>
            </div>
            {m.user_id === user?.id && (
              <button onClick={() => del.mutate({ id: m.id, crewId }, { onError: () => toast.error('Failed') })} aria-label="Delete message" className="text-gray-300 hover:text-red-500 mt-0.5"><Trash2 size={13} /></button>
            )}
          </div>
        ))}
        <div className="flex gap-1.5 pt-1">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Say something…"
            className="flex-1 text-sm border rounded-lg px-2.5 py-1.5"
          />
          <button onClick={send} disabled={!text.trim() || post.isPending} className="text-sm px-3 py-1.5 bg-sage-700 text-white rounded-lg font-medium disabled:opacity-50">Send</button>
        </div>
      </div>
    </div>
  )
}

function ScoreRow({ name, emoji, score, total, pct, highlight }: { name: string; emoji: string | null | undefined; score: number; total?: number; pct: number; highlight?: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className={`truncate ${highlight ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>{emoji ?? '🧗'} {name}</span>
        <span className="tabular-nums font-bold text-gray-700">{score}{total != null ? `/${total}` : ''}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden mt-0.5">
        <span className={`block h-full rounded-full ${highlight ? 'bg-sage-500' : 'bg-gray-300'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function BattleCard({ battle, thisCrewId, amMember }: { battle: CrewBattle; thisCrewId: string; amMember: boolean }) {
  const respond = useRespondCrewBattle()
  const [now] = useState(() => Date.now())
  const { data: score } = useCrewBattleScore(battle.id, battle.status === 'active')
  const isChallenger = battle.challenger_crew === thisCrewId
  const isOpponent = battle.opponent_crew === thisCrewId
  const thisMeta = isChallenger ? battle.challenger : battle.opponent
  const otherMeta = isChallenger ? battle.opponent : battle.challenger
  const s = score ?? { challenger_score: 0, challenger_total: 0, opponent_score: 0, opponent_total: 0 }
  const thisScore = isChallenger ? s.challenger_score : s.opponent_score
  const thisTotal = isChallenger ? s.challenger_total : s.opponent_total
  const otherScore = isChallenger ? s.opponent_score : s.challenger_score
  const otherTotal = isChallenger ? s.opponent_total : s.challenger_total
  const isBoulder = battle.battle_type === 'boulder'
  const typeLabel = isBoulder ? `Boulder all-clear · ${battle.boulder?.name ?? 'boulder'}` : 'Most sends'

  const endsMs = battle.ends_at ? new Date(battle.ends_at).getTime() : null
  const expired = endsMs != null && now > endsMs
  const daysLeft = endsMs != null ? Math.max(0, Math.ceil((endsMs - now) / 86400000)) : null

  let outcome: { done: boolean; winnerIsThis: boolean | null } = { done: false, winnerIsThis: null }
  if (battle.status === 'active') {
    const thisAll = isBoulder && thisTotal > 0 && thisScore === thisTotal
    const otherAll = isBoulder && otherTotal > 0 && otherScore === otherTotal
    if (thisAll && !otherAll) outcome = { done: true, winnerIsThis: true }
    else if (otherAll && !thisAll) outcome = { done: true, winnerIsThis: false }
    else if (thisAll && otherAll) outcome = { done: true, winnerIsThis: null }
    else if (expired) {
      if (thisScore > otherScore) outcome = { done: true, winnerIsThis: true }
      else if (otherScore > thisScore) outcome = { done: true, winnerIsThis: false }
      else outcome = { done: true, winnerIsThis: null }
    }
  }

  const thisDenom = isBoulder ? Math.max(thisTotal, 1) : Math.max(thisScore, otherScore, 1)
  const otherDenom = isBoulder ? Math.max(otherTotal, 1) : Math.max(thisScore, otherScore, 1)

  return (
    <div className="rounded-2xl border border-amber-200 bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 min-w-0"><span className="truncate">⚔️ {typeLabel}</span></span>
        <span className="text-[11px] font-medium text-gray-400 flex-shrink-0 ml-2">
          {battle.status === 'pending' ? 'Pending' : outcome.done ? 'Final' : expired ? 'Ended' : `${daysLeft}d left`}
        </span>
      </div>

      {battle.status === 'pending' ? (
        <div>
          <p className="text-sm text-gray-600 mb-2">
            {isChallenger ? <>Waiting for <b>{otherMeta?.name}</b> to accept.</> : <><b>{otherMeta?.name}</b> challenged your crew.</>}
          </p>
          {isOpponent && amMember && (
            <div className="flex gap-2">
              <button onClick={() => respond.mutate({ battleId: battle.id, accept: false }, { onError: () => toast.error('Failed') })} className="flex-1 py-2 rounded-lg border text-sm text-gray-600">Decline</button>
              <button onClick={() => respond.mutate({ battleId: battle.id, accept: true }, { onSuccess: () => toast.success('Battle on! ⚔️'), onError: () => toast.error('Failed') })} className="flex-1 py-2 rounded-lg bg-sage-700 text-white text-sm font-semibold">Accept</button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <ScoreRow name={thisMeta?.name ?? 'Your crew'} emoji={thisMeta?.emoji} score={thisScore} total={isBoulder ? thisTotal : undefined} pct={Math.round((thisScore / thisDenom) * 100)} highlight />
          <ScoreRow name={otherMeta?.name ?? 'Crew'} emoji={otherMeta?.emoji} score={otherScore} total={isBoulder ? otherTotal : undefined} pct={Math.round((otherScore / otherDenom) * 100)} />
          {outcome.done && (
            <p className={`text-sm font-semibold pt-1 ${outcome.winnerIsThis === true ? 'text-green-600' : 'text-gray-500'}`}>
              {outcome.winnerIsThis === true ? '🏆 Your crew won!' : outcome.winnerIsThis === false ? `${otherMeta?.name} won` : "It's a draw"}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function InviteSheet({ open, onClose, crewId, excludeIds }: { open: boolean; onClose: () => void; crewId: string; excludeIds: Set<string> }) {
  const { data: following = [] } = useFollowing()
  const invite = useInviteToCrew()
  const [invited, setInvited] = useState<Set<string>>(new Set())
  const candidates = following.map(f => f.following_id).filter(id => !excludeIds.has(id))

  return (
    <BottomSheet open={open} onClose={onClose} title="Invite friends">
      {candidates.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Everyone you follow is already in this crew — follow more climbers to invite them.</p>
      ) : (
        <div className="space-y-2">
          {candidates.map(id => (
            <CandidateRow
              key={id}
              userId={id}
              invited={invited.has(id)}
              onInvite={() => invite.mutate(
                { crewId, userId: id },
                { onSuccess: () => { setInvited(prev => new Set(prev).add(id)); toast.success('Invite sent') }, onError: () => toast.error('Failed') },
              )}
            />
          ))}
        </div>
      )}
    </BottomSheet>
  )
}

function CandidateRow({ userId, invited, onInvite }: { userId: string; invited: boolean; onInvite: () => void }) {
  const { data: profile } = useProfile(userId)
  if (!profile) return null
  return (
    <div className="flex items-center justify-between bg-gray-50 rounded-2xl p-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-9 h-9 rounded-full bg-sage-100 grid place-items-center text-sm font-semibold text-sage-700 overflow-hidden flex-shrink-0">
          {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> : profile.username?.[0]?.toUpperCase() ?? '?'}
        </span>
        <span className="font-medium text-sm truncate inline-flex items-center gap-1">{profile.username ?? 'Someone'} <SetterBadge userId={userId} /></span>
      </div>
      <button
        onClick={onInvite}
        disabled={invited}
        className={`text-xs font-medium px-3 py-1.5 rounded-full inline-flex items-center gap-1 ${invited ? 'bg-sage-100 text-sage-700' : 'bg-sage-700 text-white'}`}
      >
        {invited ? <><Check size={13} /> Invited</> : 'Invite'}
      </button>
    </div>
  )
}
