import { instagramUrl } from '../utils/instagram'

/**
 * The Instagram glyph shown after a beta author's name — you watched their
 * beta, this is where the rest of their clips live. Give it the bare handle
 * from their profile; it renders a link, or nothing.
 *
 * The href is built here from the handle and never stored, so this can only
 * ever point at instagram.com. Renders inline; safe to drop next to any name.
 *
 * The glyph is drawn on lucide's 24px grid rather than imported from
 * lucide-react: this project's pinned lucide-react (1.17.0, and every 1.x
 * release through 1.44.0) dropped brand icons, `Instagram` included, so
 * `import { Instagram } from 'lucide-react'` does not compile. Same situation
 * and same fix as GoatIcon in AwardIcons.tsx. The path data below is lucide's
 * own (last carried in lucide-react@1.0.0), so this renders pixel-identical
 * to what `<Instagram />` would have.
 */
export function InstagramLink({
  handle,
  size = 14,
  className = '',
}: { handle?: string | null; size?: number; className?: string }) {
  if (!handle) return null
  const label = `@${handle} on Instagram`
  return (
    <a
      href={instagramUrl(handle)}
      target="_blank"
      rel="noopener noreferrer"
      // The glyph can sit inside a tappable card; a tap on it is not a tap on that.
      onClick={e => e.stopPropagation()}
      title={label}
      aria-label={label}
      className={`inline-flex shrink-0 text-gray-400 hover:text-sage-700 ${className}`}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
      </svg>
    </a>
  )
}
