import { useState, useCallback } from 'react'
import { Bell, ArrowLeft } from 'lucide-react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { BottomSheet } from './BottomSheet'
import { useReceivedFollowRequests, useAcceptFollowRequest, useDeclineFollowRequest, useFollowing } from '../hooks/useFollows'
import { useFriendBetaVideos, useFriendProofVideos } from '../hooks/useVideoNotifications'
import type { FriendBetaVideo, FriendProofVideo } from '../hooks/useVideoNotifications'
import { useReceivedChallenges } from '../hooks/useChallenges'
import { useMyTaggedSessions } from '../hooks/usePartners'
import { useMyHypeCount } from '../hooks/useOnWall'
import { useProfile } from '../hooks/useProfile'
import { useMyProblemCommentNotifs } from '../hooks/useProblemComments'
import type { ProblemCommentNotif } from '../hooks/useProblemComments'
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
  const [dismissedHypeCount, setDismissedHypeCount] = useState(
    () => Number(localStorage.getItem('dismissedHypeCount') ?? 0)
  )
  const unseenHypes = Math.max(0, hypeCount - dismissedHypeCount)
  const dismissHypes = useCallback(() => {
    localStorage.setItem('dismissedHypeCount', String(hypeCount))
    setDismissedHypeCount(hypeCount)
  }, [hypeCount])

  const { data: following = [] } = useFollowing()
  const followingIds = following.map(f => f.following_id)
  const { data: betaVideos = [] } = useFriendBetaVideos(followingIds)
  const { data: proofVideos = [] } = useFriendProofVideos(followingIds)
  const [lastSeenVideosAt, setLastSeenVideosAt] = useState(
    () => localStorage.getItem('lastSeenVideosAt') ?? ''
  )
  const unseenBetaVideos = betaVideos.filter(v => !lastSeenVideosAt || v.created_at > lastSeenVideosAt)
  const unseenProofVideos = proofVideos.filter(v => !lastSeenVideosAt || v.created_at > lastSeenVideosAt)
  const unseenVideoCount = unseenBetaVideos.length + unseenProofVideos.length

  const { data: trashTalkNotifs = [] } = useMyProblemCommentNotifs()
  const [lastSeenTrashTalkAt, setLastSeenTrashTalkAt] = useState(
    () => localStorage.getItem('lastSeenTrashTalkAt') ?? ''
  )
  const unseenTrashTalk = trashTalkNotifs.filter(
    n => !lastSeenTrashTalkAt || n.created_at > lastSeenTrashTalkAt
  )
  const unseenTrashTalkCount = unseenTrashTalk.length

  const total = followRequests.length + challengeInvitations.length + taggedSessions.length + (unseenHypes > 0 ? 1 : 0) + (unseenVideoCount > 0 ? 1 : 0) + (unseenTrashTalkCount > 0 ? 1 : 0)
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
            <ArrowLeft size={20} strokeWidth={1.75} />
          </button>
        ) : (
          <Link to="/dashboard" className="px-2 text-base font-black tracking-tight text-sage-800">GetStrong</Link>
        )}

        <button
          onClick={() => {
            setOpen(true)
            const now = new Date().toISOString()
            localStorage.setItem('lastSeenVideosAt', now)
            localStorage.setItem('lastSeenTrashTalkAt', now)
          }}
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

      <BottomSheet open={open} onClose={() => {
        setOpen(false)
        setLastSeenVideosAt(localStorage.getItem('lastSeenVideosAt') ?? '')
        setLastSeenTrashTalkAt(localStorage.getItem('lastSeenTrashTalkAt') ?? '')
      }} title="Notifications">
        <NotificationList
          followRequests={followRequests}
          challengeInvitations={challengeInvitations}
          taggedSessions={taggedSessions}
          unseenHypes={unseenHypes}
          onDismissHypes={dismissHypes}
          betaVideos={unseenBetaVideos}
          proofVideos={unseenProofVideos}
          trashTalkNotifs={unseenTrashTalk}
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
  unseenHypes,
  onDismissHypes,
  betaVideos,
  proofVideos,
  trashTalkNotifs,
  onClose,
}: {
  followRequests: { id: string; requester_id: string }[]
  challengeInvitations: any[]
  taggedSessions: { sessionId: string; location: string; date: string; ownerUserId: string }[]
  unseenHypes: number
  onDismissHypes: () => void
  betaVideos: FriendBetaVideo[]
  proofVideos: FriendProofVideo[]
  trashTalkNotifs: ProblemCommentNotif[]
  onClose: () => void
}) {
  const acceptRequest = useAcceptFollowRequest()
  const declineRequest = useDeclineFollowRequest()
  const navigate = useNavigate()

  const isEmpty = followRequests.length === 0 && challengeInvitations.length === 0 && taggedSessions.length === 0 && unseenHypes === 0 && betaVideos.length === 0 && proofVideos.length === 0 && trashTalkNotifs.length === 0

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

      {unseenHypes > 0 && (
        <section>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Hype</p>
          <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
            <p className="font-semibold text-sm text-orange-800">
              🔥 You got {unseenHypes} hype{unseenHypes !== 1 ? 's' : ''} while on the wall!
            </p>
            <button
              onClick={onDismissHypes}
              className="text-orange-400 hover:text-orange-600 font-bold text-lg leading-none flex-shrink-0"
            >
              ×
            </button>
          </div>
        </section>
      )}

      {(betaVideos.length > 0 || proofVideos.length > 0) && (
        <section>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Videos</p>
          <div className="space-y-2">
            {betaVideos.map(v => (
              <VideoNotifRow
                key={v.id}
                userId={v.user_id}
                videoUrl={v.beta_video_url}
                label="added a beta video"
              />
            ))}
            {proofVideos.map(v => (
              <VideoNotifRow
                key={v.id}
                userId={v.user_id}
                videoUrl={v.video_url}
                label={`added a proof video for "${v.challenges?.title ?? 'a challenge'}"`}
              />
            ))}
          </div>
        </section>
      )}

      {trashTalkNotifs.length > 0 && (
        <section>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Trash talk 🔥</p>
          <div className="space-y-2">
            {trashTalkNotifs.map(n => (
              <TrashTalkNotifRow key={n.id} notif={n} />
            ))}
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

function VideoNotifRow({ userId, videoUrl, label }: { userId: string; videoUrl: string; label: string }) {
  const { data: profile } = useProfile(userId)
  return (
    <a
      href={videoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3"
    >
      <span className="text-base">🎥</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-700">
          <span className="font-semibold">{profile?.username ?? '…'}</span>{' '}
          {label}
        </p>
      </div>
      <span className="text-xs text-sage-700 font-medium flex-shrink-0">▶ Watch</span>
    </a>
  )
}

function TrashTalkNotifRow({ notif }: { notif: ProblemCommentNotif }) {
  const { data: profile } = useProfile(notif.user_id)
  const grade = notif.problems?.grade_value_font ?? notif.problems?.color ?? '—'
  const location = notif.problems?.sessions?.location ?? 'somewhere'
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3">
      <p className="text-sm text-gray-700">
        <span className="font-semibold">{profile?.username ?? '…'}</span>
        {' said something about your '}
        <span className="font-semibold">{grade}</span>
        {' at '}
        <span className="font-semibold">{location}</span>
      </p>
      <p className="text-xs text-gray-400 mt-0.5 truncate">"{notif.body}"</p>
    </div>
  )
}
