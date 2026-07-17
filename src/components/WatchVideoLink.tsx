import { Play } from 'lucide-react'

/**
 * Explicit "watch the beta video" action for detail/list rows, where the row's
 * main tap target is something else (a photo lightbox) and the corner VideoBadge
 * is too small to be a reliable target. Pair it with VideoBadge: the badge is the
 * glance cue on the image, this is the thing you actually press.
 */
export function WatchVideoLink({ href, className = '' }: { href: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className={`inline-flex items-center gap-1 text-xs font-medium text-sage-700 hover:text-sage-800 ${className}`}
    >
      <Play size={12} fill="currentColor" /> Watch video
    </a>
  )
}
