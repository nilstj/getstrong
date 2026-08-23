/**
 * A goat on lucide's 24px grid. Drawn rather than 🐐 so it inherits
 * currentColor and scales like the app's other graphics (see the tape and hold
 * marks in Chip.tsx).
 */
export function GoatIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="goat">
      <path d="M9 6C8 4 6.5 2.8 4.5 2.5" />
      <path d="M15 6c1-2 2.5-3.2 4.5-3.5" />
      <path d="M9 6h6a2 2 0 0 1 2 2v2a5 5 0 0 1-10 0V8a2 2 0 0 1 2-2z" />
      <path d="M7 9.2 4 10.6" />
      <path d="m17 9.2 3 1.4" />
      <path d="M10.6 10h.01" />
      <path d="M13.4 10h.01" />
      <path d="M12 15v2.4c0 1.6-.8 2.7-2.2 3.1" />
    </svg>
  )
}
