// Default image for a shared boulder with no uploaded photo: a tile tinted by a
// stable colour derived from the gym name, showing the gym (or its initials).
const GYM_GRADIENTS = [
  'from-emerald-500 to-teal-700',
  'from-sky-500 to-indigo-700',
  'from-rose-500 to-pink-700',
  'from-amber-500 to-orange-700',
  'from-violet-500 to-purple-700',
  'from-lime-500 to-green-700',
  'from-cyan-500 to-blue-700',
  'from-fuchsia-500 to-rose-700',
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
