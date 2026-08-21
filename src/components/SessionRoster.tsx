import { useState } from 'react'
import { Plus, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { BottomSheet } from './BottomSheet'
import { useFollowing } from '../hooks/useFollows'
import { useProfile } from '../hooks/useProfile'
import { groupRoster } from '../utils/sessionGroups'
import {
  useGroupRoster, useGroupInvites, useCreateSessionGroup, useInviteToSessionGroup,
} from '../hooks/useSessionGroup'
import { errorMessage } from '../utils/errors'

/**
 * Who was at a session. A solo session has no group yet, so the only thing shown
 * is the affordance that creates one — which is what makes a session shareable.
 */
export function SessionRoster({
  sessionId, groupId, isOwner,
}: { sessionId: string; groupId: string | null; isOwner: boolean }) {
  const [sheetOpen, setSheetOpen] = useState(false)
  // The prop is authoritative. State covers only the gap between creating a group
  // here and the parent's session query refetching with the new group_id, so the
  // prop can never go stale behind us.
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null)
  const effectiveGroupId = groupId ?? createdGroupId
  const { data: members = [] } = useGroupRoster(effectiveGroupId)
  const { data: invites = [] } = useGroupInvites(effectiveGroupId)

  const rows = groupRoster(members, invites)
  const nameOf = (userId: string) =>
    members.find(m => m.user_id === userId)?.username ??
    invites.find(i => i.invited_user === userId)?.username ?? null
  const avatarOf = (userId: string) =>
    members.find(m => m.user_id === userId)?.avatar_url ??
    invites.find(i => i.invited_user === userId)?.avatar_url ?? null

  // Opening the sheet must not create a group by itself -- a curious tap that
  // closes without inviting anyone would otherwise permanently turn a solo
  // session into a shared one. The group is created lazily, inside the invite
  // handler, the first time the owner actually asks someone.
  const openSheet = () => setSheetOpen(true)

  if (rows.length === 0 && !isOwner) return null

  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Who was there</h2>
      <div className="bg-gray-50 rounded-2xl p-3">
        <div className="flex items-start gap-3 flex-wrap">
          {rows.map(r => (
            <div key={r.userId} className="flex flex-col items-center gap-1.5 w-14">
              <span className={`relative w-11 h-11 rounded-full grid place-items-center text-[15px] font-semibold overflow-hidden ${
                r.pending ? 'bg-gray-100 text-gray-400' : 'bg-sage-100 text-sage-700'
              }`}>
                {avatarOf(r.userId)
                  ? <img src={avatarOf(r.userId)!} alt="" className="w-full h-full object-cover" />
                  : (nameOf(r.userId) ?? '?').slice(0, 1).toUpperCase()}
                {r.pending && (
                  <span className="absolute -right-0.5 -bottom-0.5 w-[18px] h-[18px] rounded-full bg-white border border-gray-200 text-gray-400 grid place-items-center">
                    <Clock size={11} strokeWidth={2.5} />
                  </span>
                )}
              </span>
              <span className={`text-[11px] font-semibold text-center truncate max-w-full ${r.pending ? 'text-gray-400' : 'text-gray-800'}`}>
                {nameOf(r.userId) ?? 'Someone'}
              </span>
              {r.pending && <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">Asked</span>}
            </div>
          ))}

          {isOwner && (
            <button
              type="button"
              onClick={openSheet}
              className="flex flex-col items-center gap-1.5 w-14"
            >
              <span className="w-11 h-11 rounded-full border border-dashed border-gray-300 grid place-items-center text-gray-400">
                <Plus size={18} strokeWidth={2} />
              </span>
              <span className="text-[11px] font-semibold text-gray-400">Add</span>
            </button>
          )}
        </div>

        {rows.some(r => r.pending) && (
          <p className="text-[11px] text-gray-400 mt-2.5">
            Faded climbers haven't accepted yet. Everyone else logs their own climbs here.
          </p>
        )}
      </div>

      <AddPeopleSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        sessionId={sessionId}
        groupId={effectiveGroupId}
        onGroupCreated={setCreatedGroupId}
        alreadyIn={new Set([...members.map(m => m.user_id), ...invites.map(i => i.invited_user)])}
      />
    </div>
  )
}

function AddPeopleSheet({
  open, onClose, sessionId, groupId, onGroupCreated, alreadyIn,
}: {
  open: boolean
  onClose: () => void
  sessionId: string
  groupId: string | null
  onGroupCreated: (id: string) => void
  alreadyIn: Set<string>
}) {
  const { data: following = [] } = useFollowing()
  const createGroup = useCreateSessionGroup()
  const invite = useInviteToSessionGroup()
  const candidates = following.filter(f => !alreadyIn.has(f.following_id))

  // The group is created lazily, right here, the first time the owner actually
  // asks someone -- not when the sheet opens. create_session_group is
  // idempotent, but groupId is cached by the parent after the first success so
  // a second invite in the same sitting reuses it instead of calling again.
  const handleInvite = (userId: string) => {
    const askError = (e: unknown) => toast.error(errorMessage(e, 'Could not ask'))
    if (groupId) {
      invite.mutate({ groupId, userId }, {
        onSuccess: () => toast.success('Asked them'),
        onError: askError,
      })
      return
    }
    createGroup.mutate({ sessionId }, {
      onSuccess: id => {
        onGroupCreated(id)
        invite.mutate({ groupId: id, userId }, {
          onSuccess: () => toast.success('Asked them'),
          onError: askError,
        })
      },
      onError: (e: unknown) => toast.error(errorMessage(e, 'Could not share this session')),
    })
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Who was there?">
      <div className="space-y-4">
        <p className="text-xs text-gray-500 leading-relaxed">
          They get the session in their own log to accept, sharing this boulder list.
          Their tries and sends stay their own, and nothing counts toward their stats
          until they accept.
        </p>
        {candidates.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Everyone you follow is already here.</p>
        ) : (
          <div className="space-y-2">
            {candidates.map(f => (
              <CandidateRow
                key={f.following_id}
                userId={f.following_id}
                disabled={createGroup.isPending}
                onInvite={() => handleInvite(f.following_id)}
              />
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  )
}

function CandidateRow({ userId, onInvite, disabled }: { userId: string; onInvite: () => void; disabled?: boolean }) {
  const { data: profile } = useProfile(userId)
  return (
    <div className="flex items-center gap-3 bg-gray-50 rounded-2xl p-3 min-h-14">
      <span className="w-9 h-9 rounded-full bg-sage-100 grid place-items-center text-sm font-semibold text-sage-700 overflow-hidden flex-shrink-0">
        {profile?.avatar_url
          ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
          : profile?.username?.[0]?.toUpperCase() ?? '?'}
      </span>
      <span className="flex-1 text-sm font-medium text-gray-800 truncate">{profile?.username ?? '…'}</span>
      <button
        type="button"
        onClick={onInvite}
        disabled={disabled}
        className="min-h-11 px-4 rounded-full bg-sage-700 text-white text-sm font-semibold disabled:opacity-50"
      >
        Ask
      </button>
    </div>
  )
}
