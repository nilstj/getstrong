// Default thumbnail for a board climb (Kilterboard / Moonboard / TB2) that has
// no uploaded photo. A board-tinted tile with a hold-dot grid motif.
// On-palette (sage / khaki) tints, kept distinct per board.
const BOARD_STYLE: Record<string, { bg: string; label: string }> = {
  Kilterboard: { bg: 'from-sage-600 to-sage-800', label: 'Kilter' },
  Moonboard: { bg: 'from-khaki-600 to-khaki-800', label: 'Moon' },
  TB2: { bg: 'from-sage-800 to-khaki-800', label: 'TB2' },
}

export function BoardThumb({
  board,
  angle,
  className = '',
}: {
  board: string
  angle?: number | null
  className?: string
}) {
  const style = BOARD_STYLE[board] ?? { bg: 'from-sage-700 to-sage-900', label: board }
  return (
    <div className={`relative overflow-hidden grid place-items-center bg-gradient-to-br ${style.bg} text-white ${className}`}>
      <div className="absolute inset-0 opacity-25"
        style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.95) 1.4px, transparent 1.6px)', backgroundSize: '11px 11px' }} />
      <div className="relative text-center leading-tight">
        <div className="text-[11px] font-extrabold tracking-tight">{style.label}</div>
        {angle != null && <div className="text-[9px] font-semibold opacity-90">{angle}°</div>}
      </div>
    </div>
  )
}
