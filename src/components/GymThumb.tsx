// Default image for a shared boulder with no uploaded photo: a tile tinted by a
// stable colour derived from the gym name, showing the gym (or its initials).
// On-palette (sage / khaki) gradients; varied by light/dark and green/tan mix so
// gyms still read as distinct while staying in the app's colour scheme.
const GYM_GRADIENTS = [
  'from-sage-600 to-sage-800',
  'from-khaki-600 to-khaki-800',
  'from-sage-700 to-khaki-700',
  'from-khaki-700 to-sage-800',
  'from-sage-700 to-sage-900',
  'from-khaki-700 to-khaki-900',
  'from-sage-600 to-khaki-800',
  'from-khaki-600 to-sage-900',
]

function gymIndex(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h % GYM_GRADIENTS.length
}

function initials(s: string): string {
  const parts = s.split(/\s+/).filter(Boolean)
  return (parts.slice(0, 2).map(w => w[0]).join('') || '?').toUpperCase()
}

export function GymThumb({
  gym,
  compact = false,
  className = '',
}: {
  gym: string
  compact?: boolean
  className?: string
}) {
  const grad = GYM_GRADIENTS[gymIndex(gym || 'gym')]
  return (
    <div className={`relative overflow-hidden grid place-items-center bg-gradient-to-br ${grad} text-white ${className}`}>
      <div className="absolute inset-0 opacity-20"
        style={{ backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.6) 0 2px, transparent 2px 14px)' }} />
      {compact ? (
        <span className="relative text-base font-extrabold tracking-tight">{initials(gym)}</span>
      ) : (
        <span className="relative px-3 text-center text-xl font-extrabold leading-tight line-clamp-3">{gym || 'Gym'}</span>
      )}
    </div>
  )
}
