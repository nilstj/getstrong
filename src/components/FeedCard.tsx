import type { ReactNode } from 'react'
import { Play } from 'lucide-react'
import { Chip, HoldDot } from './Chip'
import type { FeedEvent, FeedEventType } from '../types'

const VERB: Record<FeedEventType, string> = {
  boulder_new: 'put up a boulder',
  send: 'sent',
  beta_added: 'shared beta on',
  beta_worked: 'nailed the beta on',
}

export function FeedCard({
  event,
  actorName,
  actorAvatarUrl,
  onOpen,
  children,
}: {
  event: FeedEvent
  actorName: string
  actorAvatarUrl?: string | null
  onOpen: () => void
  children?: ReactNode
}) {
  const title = event.boulder_name || 'a boulder'
  return (
    <article className="bg-white rounded-2xl overflow-hidden border border-gray-100">
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <span className="w-8 h-8 rounded-full bg-cover bg-center bg-sage-100 flex-shrink-0"
          style={actorAvatarUrl ? { backgroundImage: `url(${actorAvatarUrl})` } : undefined} />
        <div className="min-w-0 text-sm leading-tight">
          <span className="font-semibold">{actorName}</span>{' '}
          <span className="text-gray-500">{VERB[event.event_type]}</span>{' '}
          <span className="font-semibold">{title}</span>
          <div className="text-[11px] text-gray-400">
            {[event.boulder_grade, event.gym].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      <button type="button" onClick={onOpen}
        className="block w-full relative aspect-[4/3] bg-gradient-to-br from-sage-700 to-sage-900 focus:outline-none">
        {event.boulder_image_url && (
          <img src={event.boulder_image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        {event.beta_video_url && !event.boulder_image_url && (
          <span className="absolute inset-0 grid place-items-center">
            <Play size={40} className="text-white/90" fill="currentColor" />
          </span>
        )}
        <span className="absolute left-2.5 bottom-2.5 flex items-center gap-2">
          {event.boulder_grade && <Chip label={event.boulder_grade} variant="grade" />}
          {event.boulder_color && <HoldDot color={event.boulder_color} />}
        </span>
      </button>

      <div className="px-3.5 pt-2.5 pb-1">{children}</div>

      {event.beta_snippet && (
        <p className="px-3.5 pb-3 text-sm text-gray-700 leading-snug">
          <span className="font-medium">"{event.beta_snippet}"</span>
        </p>
      )}
    </article>
  )
}
