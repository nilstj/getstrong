import { Wrench } from 'lucide-react'
import { useSetterUserIds } from '../hooks/useProfile'

/**
 * The role marker shown after the name of any user who has the setter role.
 * Give it the person's `userId` — it consults the app-wide cached setter-id set
 * and renders a small wrench, or nothing. Renders inline; safe to drop next to
 * any name anywhere.
 */
export function SetterBadge({ userId, size = 13, className = '' }: { userId?: string | null; size?: number; className?: string }) {
  const { data: setterIds } = useSetterUserIds()
  if (!userId || !setterIds?.has(userId)) return null
  return (
    <Wrench
      size={size}
      className={`inline-block shrink-0 text-sage-600 ${className}`}
      strokeWidth={2}
      aria-label="Setter"
    />
  )
}
