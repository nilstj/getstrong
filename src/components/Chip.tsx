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
 * The two colour markers for a problem/boulder — the gym grading tape and the
 * physical hold colour — shown wherever a problem is listed. Each icon renders
 * only when its colour is set; no text label follows the icons. Renders nothing
 * when both colours are absent.
 */
export function ProblemColorIcons({
  color,
  holdColor,
  size = 16,
  className = '',
}: {
  color?: string | null
  holdColor?: string | null
  size?: number
  className?: string
}) {
  if (!color && !holdColor) return null
  return (
    <span className={`inline-flex items-center gap-1 align-middle ${className}`}>
      {color && <TapeGraphic color={color} size={size} />}
      {holdColor && <HoldGraphic color={holdColor} size={size} />}
    </span>
  )
}

/**
 * A generic climbing-hold silhouette tinted with a problem's hold colour — used
 * as a preview when logging a problem and as the thumbnail for a colour-only
 * problem that has no photo.
 */
export function HoldGraphic({ color, size = 40 }: { color?: string | null; size?: number }) {
  const hex = colorHex(color)
  const outline = '#1c1c1c'
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label={color ? `${color} hold` : 'hold'} className="flex-shrink-0">
      {/* organic hold silhouette, filled with the hold colour */}
      <path
        d="M30 16 C46 6 66 10 77 24 C85 35 84 45 76 53 C88 60 92 74 81 84 C70 93 54 88 47 79 C37 90 18 88 11 73 C4 58 9 33 21 24 C24 21 27 18 30 16 Z"
        fill={hex}
        stroke={outline}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      {/* bolt hole */}
      <circle cx="41" cy="44" r="9" fill="none" stroke={outline} strokeWidth="4" />
      <circle cx="41" cy="44" r="3.5" fill={outline} />
    </svg>
  )
}

export function TapeDot({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-block rounded-sm border border-black/25 flex-shrink-0"
      style={{ width: size * 1.6, height: size * 0.72, backgroundColor: colorHex(color) }}
      title={color}
    />
  )
}

/**
 * A strip of climbing tape tinted with a gym's grading colour — the gym-grade
 * analogue of HoldGraphic. Used in the grade-colour picker and as a swatch
 * wherever a problem's gym grading colour is shown.
 */
export function TapeGraphic({ color, size = 40 }: { color?: string | null; size?: number }) {
  const hex = colorHex(color)
  const outline = '#1c1c1c'
  const w = Math.round(size * 1.7)
  const h = Math.round(size * 0.8)
  return (
    <svg width={w} height={h} viewBox="0 0 68 32" role="img" aria-label={color ? `${color} tape` : 'tape'} className="flex-shrink-0">
      <rect x="3" y="3" width="62" height="26" rx="4" fill={hex} stroke={outline} strokeWidth="3" strokeLinejoin="round" />
    </svg>
  )
}
