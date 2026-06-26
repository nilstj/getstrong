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
      style={{ width: size, height: size, backgroundColor: color }}
      title={color}
    />
  )
}
