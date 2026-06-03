import { useState } from 'react'
import { Bell, ArrowLeft } from 'lucide-react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { BottomSheet } from './BottomSheet'
import { useReceivedFollowRequests, useAcceptFollowRequest, useDeclineFollowRequest } from '../hooks/useFollows'
import { useReceivedChallenges } from '../hooks/useChallenges'
import { useMyTaggedSessions } from '../hooks/usePartners'
import { useMyHypeCount } from '../hooks/useOnWall'
import { useProfile } from '../hooks/useProfile'
import toast from 'react-hot-toast'

const TOP_LEVEL_PATHS = ['/dashboard', '/sessions', '/challenges', '/profile']

function isTopLevel(pathname: string) {
  return TOP_LEVEL_PATHS.some(p => pathname === p || pathname === p + '/')
}

export function AppBar() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const { data: followRequests = [] } = useReceivedFollowRequests()
  const { data: challengeInvitations = [] } = useReceivedChallenges()
  const { data: taggedSessions = [] } = useMyTaggedSessions()
  const { data: hypeCount = 0 } = useMyHypeCount()

  const total = followRequests.length + challengeInvitations.length + taggedSessions.length + (hypeCount > 0 ? 1 : 0)
  const onSubPage = !isTopLevel(location.pathname)

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-40 bg-[#f7f5f0] border-b border-gray-200 h-12 flex items-center px-2 justify-between">
        {onSubPage ? (
          <button
            onClick={() => navigate(-1)}
            title="Go back"
            aria-label="Go back"
            className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
        ) : (
          <Link to="/dashboard" className="px-2 text-base font-black tracking-tight text-sage-800">GetStrong</Link>
        )}

        <button
          onClick={() => setOpen(true)}
          title="Notifications"
          aria-label="Notifications"
          className="relative w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <Bell size={20} strokeWidth={1.75} />
          {total > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
              {total > 9 ? '9+' : total}
            </span>
          )}
        </button>
      </header>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Notifications">
        <NotificationList
          followRequests={followRequests}
          challengeInvitations={challengeInvitations}
          taggedSessions={taggedSessions}
          hypeCount={hypeCount}
          onClose={() => setOpen(false)}
        />
      </BottomSheet>
    </>
  )
}

function NotificationList({
  followRequests,
  challengeInvitations,
  taggedSessions,
  hypeCount,
  onClose,
}: {
  followRequests: { id: string; requester_id: string }[]
  challengeInvitations: any[]
  taggedSessions: { sessionId: string; location: string; date: string; ownerUserId: string }[]
  hypeCount: number
  onClose: () => void
}) {
  const acceptRequest = useAcceptFollowRequest()
  const declineRequest = useDeclineFollowRequest()
  const navigate = useNavigate()

  const isEmpty = followRequests.length === 0 && challengeInvitations.length === 0 && taggedSessions.length === 0 && hypeCount === 0

  if (isEmpty) {
    return (
      <div className="py-12 text-center">
        <p className="text-3xl mb-2">🔔</p>
        <p className="text-gray-400 text-sm">All caught up! No new notifications.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {followRequests.length > 0 && (
        <section>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Friend Requests</p>
          <div className="space-y-2">
            {followRequests.map(req => (
              <FriendRequestNotif
                key={req.id}
                requesterId={req.requester_id}
                onAccept={() => acceptRequest.mutate(
                  { requestId: req.id, requesterId: req.requester_id },
                  { onSuccess: () => toast.success('Friend added!'), onError: () => toast.error('Failed') }
                )}
                onDecline={() => declineRequest.mutate(req.id, { onSuccess: () => toast.success('Declined'), onError: () => toast.error('Failed') })}
                isPending={acceptRequest.isPending || declineRequest.isPending}
              />
            ))}
          </div>
        </section>
      )}

      {challengeInvitations.length > 0 && (
        <section>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Challenge Invitations</p>
          <div className="space-y-2">
            {challengeInvitations.map(inv => (
              <button
                key={inv.id}
                onClick={() => { navigate('/challenges'); onClose() }}
                className="w-full text-left bg-sage-50 border border-sage-200 rounded-2xl px-4 py-3"
              >
                <p className="font-semibold text-sm text-sage-900">{inv.challenges?.title ?? 'Challenge'}</p>
                <p className="text-xs text-sage-600 mt-0.5">from {inv.profiles?.username ?? 'someone'} · tap to view</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {taggedSessions.length > 0 && (
        <section>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Sessions</p>
          <div className="space-y-2">
            {taggedSessions.map(s => (
              <TaggedSessionNotif key={s.sessionId} ownerUserId={s.ownerUserId} location={s.location} date={s.date} isPlanned={(s as any).isPlanned} />
            ))}
          </div>
        </section>
      )}

      {hypeCount > 0 && (
        <section>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Hype</p>
          <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3">
            <p className="font-semibold text-sm text-orange-800">
              🔥 You got {hypeCount} hype{hypeCount !== 1 ? 's' : ''} while on the wall!
            </p>
          </div>
        </section>
      )}
    </div>
  )
}

function FriendRequestNotif({
  requesterId, onAccept, onDecline, isPending,
}: {
  requesterId: string
  onAccept: () => void; onDecline: () => void; isPending: boolean
}) {
  const { data: profile } = useProfile(requesterId)
  if (!profile) return null
  return (
    <div className="flex items-center justify-between bg-sage-50 border border-sage-200 rounded-2xl px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-gray-400 font-medium text-sm">
          {profile.avatar_url
            ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            : profile.username?.[0]?.toUpperCase() ?? '?'}
        </div>
        <div>
          <p className="font-semibold text-sm text-gray-900">{profile.username}</p>
          <p className="text-xs text-gray-400">wants to be friends</p>
        </div>
      </div>
      <div className="flex gap-1.5">
        <button onClick={onDecline} disabled={isPending} className="text-xs px-2.5 py-1.5 rounded-full bg-gray-200 text-gray-600 font-medium disabled:opacity-50">Decline</button>
        <button onClick={onAccept} disabled={isPending} className="text-xs px-2.5 py-1.5 rounded-full bg-sage-700 text-white font-medium disabled:opacity-50">Accept</button>
      </div>
    </div>
  )
}

function TaggedSessionNotif({ ownerUserId, location, date, isPlanned }: { ownerUserId: string; location: string; date: string; isPlanned?: boolean }) {
  const { data: profile } = useProfile(ownerUserId)
  return (
    <div className={`border rounded-2xl px-4 py-3 ${isPlanned ? 'bg-sage-50 border-sage-200' : 'bg-gray-50 border-gray-200'}`}>
      <p className="text-sm text-gray-700">
        <span className="font-semibold">{profile?.username ?? '…'}</span>{' '}
        {isPlanned ? 'invited you to a session at' : 'tagged you at'}{' '}
        <span className="font-semibold">{location}</span>
      </p>
      <p className="text-xs text-gray-400 mt-0.5">{date}{isPlanned ? ' · Planned' : ''}</p>
    </div>
  )
}
