import { colorHex } from '../utils/holdColors'

type ChipVariant = 'grade' | 'gym' | 'neutral'

export function Chip({
  label,
  variant = 'neutral',
  className = '',
}: {
  label: string
  variant?: ChipVariant
  className?: string
}) {
  const styles: Record<ChipVariant, string> = {
    grade: 'bg-sage-700 text-white',
    gym: 'bg-white/85 text-gray-800 backdrop-blur-sm',
    neutral: 'bg-black/55 text-white backdrop-blur-sm',
  }
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold tracking-tight ${styles[variant]} ${className}`}>
      {label}
    </span>
  )
}

export function HoldDot({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-block rounded-full border-2 border-white/85 flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: colorHex(color) }}
      title={color}
    />
  )
}

/**
 * A generic climbing-hold silhouette tinted with a problem's hold colour — used
 * as a preview when logging a problem and as the thumbnail for a colour-only
 * problem that has no photo.
 */
export function HoldGraphic({ color, size = 40 }: { color?: string | null; size?: number }) {
  const hex = colorHex(color)
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={color ? `${color} hold` : 'hold'} className="flex-shrink-0">
      <path
        d="M14 8 C26 3 42 8 44 20 C46 31 38 42 25 43 C13 44 3 37 4 25 C5 16 6 12 14 8 Z"
        fill={hex}
        stroke="rgba(0,0,0,0.14)"
        strokeWidth="1"
      />
      {/* bolt hole */}
      <circle cx="27" cy="21" r="3" fill="rgba(0,0,0,0.22)" />
    </svg>
  )
}
