import { Link, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Play, UserPlus, Check, Clock, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { Chip } from './Chip'
import { VideoBadge } from './VideoBadge'
import { SetterBadge } from './SetterBadge'
import { useAuth } from '../providers/AuthProvider'
import { joinAffordance } from '../utils/joinEligibility'
import {
  useSharedCrewUsers, useMyJoinRequests, useJoinSession, useRequestToJoinSession, useCancelJoinRequest,
} from '../hooks/useSessionGroup'
import type { FriendSession } from '../hooks/useFriendsFeed'

function formatDate(iso: string): string {
  try { return format(new Date(iso), 'd MMM') } catch { return '' }
}

export function FriendSessionCard({
  session, to, showJoin = false, alreadyIn = false,
}: { session: FriendSession; to: string; showJoin?: boolean; alreadyIn?: boolean }) {
  const photos = session.photos.slice(0, 4)
  const extra = Math.max(0, session.photos.length - 4)
  // Videos we can't badge on a visible photo tile (problems with no photo, or
  // photos past the 4 shown) get counted into a summary-line marker instead.
  const badgedVideos = photos.filter(p => p.hasVideo).length
  const unbadgedVideos = session.videoCount - badgedVideos

  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  // Gated on `showJoin`: a card rendered without it (the crew feed) has no use
  // for either query, so it must not fire them just because it happens to
  // mount this component.
  const { data: crewPeers } = useSharedCrewUsers(showJoin)
  const { data: myRequests } = useMyJoinRequests(showJoin)
  const join = useJoinSession()
  const ask = useRequestToJoinSession()
  const cancel = useCancelJoinRequest()

  // `session.gym` comes from `problems.gym`, a different column from the
  // `sessions.location` both join RPCs actually require -- the two diverge in
  // practice, so a blank string must count as absent, same as null.
  const hasGym = !!session.gym?.trim()

  // Hardcoded false, and it stays that way: the awards now live on session
  // groups, but reading another group's round requires membership in it, so a
  // client looking at a friend's card cannot know whether the verdict is out.
  // join_session refuses with VERDICT_OUT and onJoinError below says so, which
  // is why offering the button is never a lie.
  const affordance = joinAffordance({
    isMine: session.userId === user?.id,
    alreadyIn,
    requested: myRequests?.has(session.sessionId) ?? false,
    sharesCrew: crewPeers?.has(session.userId) ?? false,
    verdictOut: false,
    hasGym,
  })

  const onJoinError = (e: unknown) => {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('VERDICT_OUT')) { toast.error('The awards for that session are already in'); return }
    if (msg.includes('NEEDS_APPROVAL')) {
      // This means the cached crew set is stale -- without refreshing it the
      // button would keep offering "I was there too" forever.
      qc.invalidateQueries({ queryKey: ['shared_crew_users'] })
      toast.error('Ask to join instead')
      return
    }
    toast.error(msg || 'Could not join')
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden transition-colors">
      <Link to={to}
        className="block hover:bg-gray-50/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500">
        <div className="flex items-center gap-2.5 px-3.5 py-2.5">
          <span className="w-9 h-9 rounded-full bg-cover bg-center bg-sage-100 flex-shrink-0"
            style={session.authorAvatarUrl ? { backgroundImage: `url(${session.authorAvatarUrl})` } : undefined} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight truncate inline-flex items-center gap-1">{session.authorName ?? 'Someone'} <SetterBadge userId={session.userId} /></p>
            <p className="text-[11px] text-gray-400">
              {[session.gym, formatDate(session.date)].filter(Boolean).join(' · ')}
            </p>
          </div>
          {session.topGrade && <Chip label={`up to ${session.topGrade}`} variant="grade" />}
        </div>

        <div className="px-3.5 pb-2.5 flex items-center flex-wrap gap-x-2 gap-y-0.5 text-sm text-gray-600">
          {[
            session.problemCount > 0 ? `${session.problemCount} ${session.problemCount === 1 ? 'problem' : 'problems'} · ${session.sendCount} sent` : null,
            session.challengeCount > 0 ? `${session.challengeCount} ${session.challengeCount === 1 ? 'challenge' : 'challenges'}` : null,
          ].filter(Boolean).map((part, i) => (
            <span key={i} className="inline-flex items-center gap-2">
              {i > 0 && <span className="text-gray-300">·</span>}
              <span className={i === 0 && session.problemCount > 0 ? 'font-semibold text-gray-800' : ''}>{part}</span>
            </span>
          ))}
          {unbadgedVideos > 0 && (
            <span className="inline-flex items-center gap-2">
              <span className="text-gray-300">·</span>
              <span className="inline-flex items-center gap-1">
                <Play size={12} fill="currentColor" /> {unbadgedVideos} video{unbadgedVideos === 1 ? '' : 's'}
              </span>
            </span>
          )}
        </div>

        {photos.length > 0 && (
          <div className={`grid gap-0.5 ${photos.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {photos.map((photo, i) => (
              <div key={photo.url} className="relative aspect-square overflow-hidden">
                <img src={photo.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                {photo.hasVideo && <VideoBadge />}
                {i === photos.length - 1 && extra > 0 && (
                  <span className="absolute inset-0 grid place-items-center bg-black/50 text-white text-lg font-bold">
                    +{extra}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Link>

      {showJoin && affordance !== 'none' && (
        <div className="px-3.5 pb-3 pt-0.5">
          {affordance === 'joined' && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sage-700">
              <Check size={14} strokeWidth={2.5} /> You were there
            </span>
          )}
          {affordance === 'pending' && (
            <button
              type="button"
              onClick={() => cancel.mutate({ sessionId: session.sessionId }, {
                onSuccess: () => toast.success('Request withdrawn'),
                onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not withdraw'),
              })}
              disabled={cancel.isPending}
              title="Withdraw request"
              className="min-h-11 w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white text-gray-400 text-xs font-semibold disabled:opacity-50"
            >
              <Clock size={14} strokeWidth={2.25} /> Asked to join <X size={13} strokeWidth={2.5} className="ml-0.5" />
            </button>
          )}
          {affordance === 'join' && (
            <button
              type="button"
              onClick={() => join.mutate({ sessionId: session.sessionId }, {
                onSuccess: sessionId => { toast.success('Added to your log'); navigate(`/sessions/${sessionId}`) },
                onError: onJoinError,
              })}
              disabled={join.isPending}
              className="min-h-11 w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-sage-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              <UserPlus size={15} strokeWidth={2.25} /> I was there too
            </button>
          )}
          {affordance === 'ask' && (
            <button
              type="button"
              onClick={() => ask.mutate({ sessionId: session.sessionId }, {
                onSuccess: () => toast.success('Asked to join'),
                onError: onJoinError,
              })}
              disabled={ask.isPending}
              className="min-h-11 w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-semibold disabled:opacity-50"
            >
              <UserPlus size={15} strokeWidth={2.25} /> Ask to join
            </button>
          )}
        </div>
      )}
    </div>
  )
}
