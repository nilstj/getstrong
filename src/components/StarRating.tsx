import { Star } from 'lucide-react'

export function StarRating({
  value,
  onChange,
  size = 20,
}: {
  value: number
  onChange?: (v: number) => void
  size?: number
}) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => {
        const filled = n <= Math.round(value)
        const color = filled ? 'text-amber-400' : 'text-gray-300'
        if (!onChange) {
          return <Star key={n} size={size} className={color} fill={filled ? 'currentColor' : 'none'} strokeWidth={1.75} />
        }
        return (
          <button key={n} type="button" onClick={() => onChange(n)}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className={`${color} hover:scale-110 transition-transform`}>
            <Star size={size} fill={filled ? 'currentColor' : 'none'} strokeWidth={1.75} />
          </button>
        )
      })}
    </span>
  )
}
