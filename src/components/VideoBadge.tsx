import { Play } from 'lucide-react'

const SIZES = {
  sm: { box: 'p-1', icon: 10 },
  md: { box: 'p-1.5', icon: 14 },
} as const

/**
 * The one canonical "this problem has a beta video" marker. Use everywhere a
 * problem thumbnail can carry a video so the affordance looks identical
 * app-wide.
 *
 * Two variants:
 * - `overlay` (default over pictures) — a large, semi-transparent play button
 *   centered in the middle of the image. Sizes itself as a fraction of the
 *   image (clamped), so it reads right on both a small thumbnail and a large
 *   hero photo.
 * - `corner` — a small filled play badge tucked in a corner. Use over avatars
 *   or tight tiles where a centered button would smother the content (e.g. the
 *   story ring). Position it with `className`.
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
  variant = 'overlay',
  className,
  label = 'Watch beta video',
}: {
  href?: string | null
  size?: keyof typeof SIZES
  variant?: 'overlay' | 'corner'
  className?: string
  label?: string
}) {
  const overlay = variant === 'overlay'

  const wrapper = overlay
    ? `absolute inset-0 z-10 grid place-items-center ${className ?? ''}`
    : `z-10 inline-flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm ${
        SIZES[size].box
      } ${className ?? 'absolute top-1.5 right-1.5'}`

  const play = overlay ? (
    <span className="grid aspect-square w-[28%] min-w-9 max-w-20 place-items-center rounded-full bg-black/40 shadow-md backdrop-blur-sm">
      <Play className="h-1/2 w-1/2 translate-x-[6%] text-white" fill="currentColor" strokeWidth={0} />
    </span>
  ) : (
    <Play size={SIZES[size].icon} className="text-white" fill="currentColor" strokeWidth={0} />
  )

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        onClick={e => e.stopPropagation()}
        className={wrapper}
      >
        {play}
      </a>
    )
  }
  return <span className={wrapper} aria-hidden>{play}</span>
}
