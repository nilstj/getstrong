import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Trophy, UserPlus, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../providers/AuthProvider'
import { useProfile } from '../hooks/useProfile'
import { useFollowing } from '../hooks/useFollows'
import {
  useCrewGroup, useCrewMembers, useCrewPendingInvites, useCrewLeaderboard,
  useCrewActivityFeed, useInviteToCrew, useLeaveCrew, useDeleteCrew,
} from '../hooks/useCrews'
import { SetterBadge } from '../components/SetterBadge'
import { FriendSessionCard } from '../components/FriendSessionCard'
import { BottomSheet } from '../components/BottomSheet'
import { cycleMonth } from '../utils/leaderboard'

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
            {members.length} {members.length === 1 ? 'member' : 'members'}{crew.home_gym ? ` · ${crew.home_gym}` : ''}
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
