import { useGymInstagramHandles } from '../hooks/useGymInstagram'
import { InstagramLink } from './InstagramLink'

/**
 * The Instagram glyph shown after a gym's name — its new-set videos live there.
 * Give it the gym label (the string every gym column stores); it consults the
 * app-wide handle map and renders a link, or nothing.
 *
 * Renders inline; safe to drop next to any gym name anywhere.
 */
export function GymInstagramLink({
  gym,
  size = 13,
  className = '',
}: { gym?: string | null; size?: number; className?: string }) {
  const { data: handles } = useGymInstagramHandles()
  if (!gym) return null
  return <InstagramLink handle={handles?.get(gym) ?? null} size={size} className={className} />
}
