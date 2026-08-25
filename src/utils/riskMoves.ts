/**
 * The moves a caution can be about. Deliberately about MOVEMENT, never about
 * injuries: no body parts, no severity, no diagnosis. That keeps a caution a
 * piece of beta rather than a health record, and keeps the app clear of
 * special-category personal data entirely.
 *
 * Unlike HOLD_COLORS, which stores its display name, a caution stores the `id`
 * and renders the label through riskMoveLabel. These labels are phrases likely
 * to be reworded, and rewording one must not fork the stored data.
 */
export const RISK_MOVES = [
  { id: 'heel_hook', label: 'Heel-hook / drop-knee' },
  { id: 'big_span', label: 'Big span or gaston' },
  { id: 'crimp', label: 'Crimp or pocket' },
  { id: 'slap', label: 'Slap or dyno' },
  { id: 'top_out', label: 'Top-out' },
  { id: 'swing', label: 'The swing' },
  { id: 'landing', label: 'The landing' },
] as const

/** The label for a stored value, falling back to the value itself. */
export function riskMoveLabel(id: string | null): string {
  if (!id) return ''
  return RISK_MOVES.find(m => m.id === id)?.label ?? id
}
