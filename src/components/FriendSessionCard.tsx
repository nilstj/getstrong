import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { Play } from 'lucide-react'
import { Chip } from './Chip'
import { VideoBadge } from './VideoBadge'
import type { FriendSession } from '../hooks/useFriendsFeed'

function formatDate(iso: string): string {
  try { return format(new Date(iso), 'd MMM') } catch { return '' }
}

export function FriendSessionCard({ session, to }: { session: FriendSession; to: string }) {
  const photos = session.photos.slice(0, 4)
  const extra = Math.max(0, session.photos.length - 4)
  // Videos we can't badge on a visible photo tile (problems with no photo, or
  // photos past the 4 shown) get counted into a summary-line marker instead.
  const badgedVideos = photos.filter(p => p.hasVideo).length
  const unbadgedVideos = session.videoCount - badgedVideos

  return (
    <Link to={to}
      className="block bg-white rounded-2xl border border-gray-100 overflow-hidden hover:border-sage-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500">
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <span className="w-9 h-9 rounded-full bg-cover bg-center bg-sage-100 flex-shrink-0"
          style={session.authorAvatarUrl ? { backgroundImage: `url(${session.authorAvatarUrl})` } : undefined} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight truncate">{session.authorName ?? 'Someone'}</p>
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
  )
}
