/**
 * A goat and a donkey on lucide's 24px grid. Drawn rather than 🐐/🫏 so they
 * inherit currentColor and scale like the app's other graphics (see the tape
 * and hold marks in Chip.tsx).
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

export function DonkeyIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="donkey">
      <path d="M9 7.5C7.8 5 7.3 3 8.4 2c1-1 2 .6 2.4 2.6" />
      <path d="M15 7.5c1.2-2.5 1.7-4.5.6-5.5-1-1-2 .6-2.4 2.6" />
      <path d="M9.2 7.5h5.6a2 2 0 0 1 2 2 4 4 0 0 1-2.1 3.5l-.3 3.6a2.4 2.4 0 0 1-4.8 0l-.3-3.6A4 4 0 0 1 7.2 9.5a2 2 0 0 1 2-2z" />
      <path d="M10.7 10.4h.01" />
      <path d="M13.3 10.4h.01" />
      <path d="M10.8 16.4h2.4" />
    </svg>
  )
}
