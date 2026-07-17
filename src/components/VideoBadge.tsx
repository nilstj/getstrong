import { Play } from 'lucide-react'

const SIZES = {
  sm: { box: 'p-1', icon: 10 },
  md: { box: 'p-1.5', icon: 14 },
} as const

/**
 * The one canonical "this problem has a beta video" marker — a filled play
 * badge overlaid in the corner of a problem's image. Use everywhere a problem
 * thumbnail can carry a video so the affordance looks identical app-wide.
 *
 * Pass `href` when the badge sits over a non-navigating image (session/help/
 * crew/feed views): it renders a link that opens the video. Omit `href` when
 * the whole tile is already a button or link (boulder picker, feed card, story
 * ring) — nesting an interactive element there is invalid HTML, so the badge
 * degrades to a plain indicator and the video opens once you tap through.
 *
 * The parent must be `position: relative`.
 */
export function VideoBadge({
  href,
  size = 'sm',
  className = 'absolute top-1.5 right-1.5',
  label = 'Watch beta video',
}: {
  href?: string | null
  size?: keyof typeof SIZES
  className?: string
  label?: string
}) {
  const { box, icon } = SIZES[size]
  const base = `z-10 inline-flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm ${box} ${className}`
  const play = <Play size={icon} className="text-white" fill="currentColor" strokeWidth={0} />

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        onClick={e => e.stopPropagation()}
        className={base}
      >
        {play}
      </a>
    )
  }
  return <span className={base} aria-hidden>{play}</span>
}
