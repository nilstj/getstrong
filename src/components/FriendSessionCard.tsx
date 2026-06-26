import { format } from 'date-fns'
import { Chip } from './Chip'
import type { FriendSession } from '../hooks/useFriendsFeed'

function formatDate(iso: string): string {
  try { return format(new Date(iso), 'd MMM') } catch { return '' }
}

export function FriendSessionCard({
  session,
  onPhoto,
}: {
  session: FriendSession
  onPhoto: (url: string) => void
}) {
  const photos = session.photos.slice(0, 4)
  const extra = Math.max(0, session.photos.length - 4)

  return (
    <article className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
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

      <div className="px-3.5 pb-2.5 flex items-center gap-2 text-sm text-gray-600">
        <span className="font-semibold text-gray-800">
          {session.problemCount} {session.problemCount === 1 ? 'problem' : 'problems'}
        </span>
        <span className="text-gray-300">·</span>
        <span>{session.sendCount} sent</span>
      </div>

      {photos.length > 0 && (
        <div className={`grid gap-0.5 ${photos.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {photos.map((url, i) => (
            <button key={url} type="button" onClick={() => onPhoto(url)}
              className="relative block aspect-square overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sage-500">
              <img src={url} alt="" className="absolute inset-0 w-full h-full object-cover" />
              {i === photos.length - 1 && extra > 0 && (
                <span className="absolute inset-0 grid place-items-center bg-black/50 text-white text-lg font-bold">
                  +{extra}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </article>
  )
}
