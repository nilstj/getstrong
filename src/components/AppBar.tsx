import { useState } from 'react'
import { Bell, ArrowLeft } from 'lucide-react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { BottomSheet } from './BottomSheet'
import { useAcceptFollowRequest, useDeclineFollowRequest } from '../hooks/useFollows'
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkAllNotificationsRead,
  useDeleteNotification,
  useNotificationsRealtime,
} from '../hooks/useNotifications'
import { useProfile } from '../hooks/useProfile'
import type { Notification } from '../types'
import { BADGES } from '../types'
import toast from 'react-hot-toast'

const TOP_LEVEL_PATHS = ['/dashboard', '/sessions', '/challenges', '/profile']

function isTopLevel(pathname: string) {
  return TOP_LEVEL_PATHS.some(p => pathname === p || pathname === p + '/')
}

export function AppBar() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useNotificationsRealtime()
  const { data: notifications = [] } = useNotifications()
  const { data: unreadCount = 0 } = useUnreadNotificationCount()
  const markAllRead = useMarkAllNotificationsRead()

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
            if (unreadCount > 0) markAllRead.mutate()
          }}
          title="Notifications"
          aria-label="Notifications"
          className="relative w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <Bell size={20} strokeWidth={1.75} />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </header>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Notifications">
        <NotificationList notifications={notifications} onClose={() => setOpen(false)} />
      </BottomSheet>
    </>
  )
}

function NotificationList({
  notifications,
  onClose,
}: {
  notifications: Notification[]
  onClose: () => void
}) {
  if (notifications.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-3xl mb-2">🔔</p>
        <p className="text-gray-400 text-sm">All caught up! No new notifications.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {notifications.map(n => (
        <NotificationRow key={n.id} notification={n} onClose={onClose} />
      ))}
    </div>
  )
}

const ICONS: Record<Notification['type'], string> = {
  problem_comment: '💬',
  problem_reaction: '🔥',
  attempt_reaction: '🔥',
  challenge_comment: '💬',
  challenge_invitation: '🎯',
  follow_request: '👋',
  new_follower: '🤝',
  hype: '🔥',
  session_tag: '📍',
  wall_comment: '🗣️',
  beta_video: '🎥',
  proof_video: '🎬',
  help_response: '🆘',
  help_marked_helpful: '🙌',
  badge_earned: '🏅',
  crew_send: '🧗',
}

function describe(n: Notification, username: string): { text: string; detail?: string } {
  const d = n.data as Record<string, string | undefined>
  switch (n.type) {
    case 'problem_comment':
      return { text: `${username} commented on your ${d.grade ?? 'problem'} at ${d.location ?? 'the gym'}`, detail: d.body ? `"${d.body}"` : undefined }
    case 'problem_reaction':
      return { text: `${username} reacted ${d.emoji ?? '🔥'} to your ${d.grade ?? 'problem'} at ${d.location ?? 'the gym'}` }
    case 'attempt_reaction':
      return { text: `${username} reacted ${d.emoji ?? '🔥'} to your attempt on "${d.challenge_title ?? 'a challenge'}"` }
    case 'challenge_comment':
      return { text: `${username} commented on your challenge "${d.challenge_title ?? ''}"`, detail: d.content ? `"${d.content}"` : undefined }
    case 'challenge_invitation':
      return { text: `${username} invited you to "${d.challenge_title ?? 'a challenge'}"` }
    case 'follow_request':
      return { text: `${username} wants to be friends` }
    case 'new_follower':
      return { text: `${username} started following you` }
    case 'hype':
      return { text: `${username} sent you hype while you were on the wall!` }
    case 'session_tag':
      return { text: `${username} tagged you in a session at ${d.location ?? 'the gym'}`, detail: d.date }
    case 'wall_comment':
      return { text: `${username} replied to your wall at ${d.location ?? 'the gym'}`, detail: d.body ? `"${d.body}"` : undefined }
    case 'beta_video':
      return { text: `${username} added a beta video${d.grade ? ` for a ${d.grade}` : ''}${d.location ? ` at ${d.location}` : ''}` }
    case 'proof_video':
      return { text: `${username} added a proof video for "${d.challenge_title ?? 'a challenge'}"` }
    case 'help_response':
      return { text: `${username} responded to your call for help${d.grade ? ` on a ${d.grade}` : ''}`, detail: d.body ? `"${d.body}"` : undefined }
    case 'crew_send': {
      const what = d.name || [d.color, d.grade].filter(Boolean).join(' ') || 'the boulder'
      const isFlashed = String(d.flashed) === 'true'
      return { text: `${username} ${isFlashed ? 'flashed' : 'sent'} ${what} 🧗` }
    }
    case 'help_marked_helpful':
      return { text: `${username} marked your beta helpful 🙌` }
    case 'badge_earned': {
      const badge = BADGES.find(b => b.key === d.badge)
      return { text: `You earned the “${badge?.label ?? 'Helper'}” badge! ${badge?.emoji ?? '🏅'}` }
    }
  }
}

function routeFor(n: Notification): string | null {
  const d = n.data as Record<string, string | undefined>
  switch (n.type) {
    case 'problem_comment':
    case 'problem_reaction':
    case 'session_tag':
      return d.session_id ? `/sessions/${d.session_id}` : null
    case 'attempt_reaction':
    case 'challenge_comment':
    case 'challenge_invitation':
      return '/challenges'
    case 'follow_request':
    case 'new_follower':
    case 'badge_earned':
      return '/profile'
    case 'help_response':
    case 'help_marked_helpful':
      return '/help'
    case 'crew_send':
      return n.entity_id ? `/gym-problems/${n.entity_id}` : null
    default:
      return null
  }
}

function NotificationRow({ notification, onClose }: { notification: Notification; onClose: () => void }) {
  const navigate = useNavigate()
  const { data: profile } = useProfile(notification.actor_id ?? '')
  const username = profile?.username ?? 'Someone'
  const { text, detail } = describe(notification, username)

  const unread = !notification.read_at

  if (notification.type === 'follow_request') {
    return <FollowRequestRow notification={notification} username={username} avatarUrl={profile?.avatar_url ?? null} text={text} unread={unread} />
  }

  const videoUrl = (notification.type === 'beta_video' || notification.type === 'proof_video')
    ? (notification.data as Record<string, string | undefined>).video_url
    : undefined
  const route = routeFor(notification)
  const body = (
    <div className="flex items-start gap-3">
      <Avatar username={username} avatarUrl={profile?.avatar_url ?? null} icon={ICONS[notification.type]} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-700">{text}</p>
        {detail && <p className="text-xs text-gray-400 mt-0.5 truncate">{detail}</p>}
      </div>
      {videoUrl && <span className="text-xs text-sage-700 font-medium flex-shrink-0 self-center">▶ Watch</span>}
    </div>
  )

  const className = `w-full text-left border rounded-2xl px-4 py-3 ${unread ? 'bg-sage-50 border-sage-200' : 'bg-gray-50 border-gray-200'}`

  if (videoUrl) {
    return (
      <a href={videoUrl} target="_blank" rel="noopener noreferrer" className={`block ${className}`}>
        {body}
      </a>
    )
  }
  if (route) {
    return (
      <button onClick={() => { navigate(route); onClose() }} className={className}>
        {body}
      </button>
    )
  }
  return <div className={className}>{body}</div>
}

function FollowRequestRow({
  notification, username, avatarUrl, text, unread,
}: {
  notification: Notification
  username: string
  avatarUrl: string | null
  text: string
  unread: boolean
}) {
  const acceptRequest = useAcceptFollowRequest()
  const declineRequest = useDeclineFollowRequest()
  const deleteNotification = useDeleteNotification()
  const isPending = acceptRequest.isPending || declineRequest.isPending

  return (
    <div className={`flex items-center justify-between border rounded-2xl px-4 py-3 ${unread ? 'bg-sage-50 border-sage-200' : 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-center gap-3 min-w-0">
        <Avatar username={username} avatarUrl={avatarUrl} icon={ICONS.follow_request} />
        <p className="text-sm text-gray-700 truncate">{text}</p>
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        <button
          onClick={() => declineRequest.mutate(notification.entity_id!, {
            onSuccess: () => { deleteNotification.mutate(notification.id); toast.success('Declined') },
            onError: () => toast.error('Failed'),
          })}
          disabled={isPending}
          className="text-xs px-2.5 py-1.5 rounded-full bg-gray-200 text-gray-600 font-medium disabled:opacity-50"
        >
          Decline
        </button>
        <button
          onClick={() => acceptRequest.mutate(
            { requestId: notification.entity_id!, requesterId: notification.actor_id! },
            {
              onSuccess: () => { deleteNotification.mutate(notification.id); toast.success('Friend added!') },
              onError: () => toast.error('Failed'),
            }
          )}
          disabled={isPending}
          className="text-xs px-2.5 py-1.5 rounded-full bg-sage-700 text-white font-medium disabled:opacity-50"
        >
          Accept
        </button>
      </div>
    </div>
  )
}

function Avatar({ username, avatarUrl, icon }: { username: string; avatarUrl: string | null; icon: string }) {
  return (
    <div className="relative flex-shrink-0">
      <div className="w-9 h-9 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-gray-400 font-medium text-sm">
        {avatarUrl
          ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          : username?.[0]?.toUpperCase() ?? '?'}
      </div>
      <span className="absolute -bottom-1 -right-1 text-xs leading-none">{icon}</span>
    </div>
  )
}
