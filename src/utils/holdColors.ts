// The standard gym hold-colour set. `color` on a problem stores the name; this
// maps it to a hex for swatches, dots, and the generic hold graphic. Keeping the
// name as the stored value means old free-text colours still render.
export const HOLD_COLORS = [
  { name: 'Red', hex: '#e23b3b' },
  { name: 'Orange', hex: '#ef8b2c' },
  { name: 'Yellow', hex: '#f2c400' },
  { name: 'Green', hex: '#3ea653' },
  { name: 'Blue', hex: '#2f6fe0' },
  { name: 'Purple', hex: '#8a4fd0' },
  { name: 'Pink', hex: '#e368a8' },
  { name: 'Black', hex: '#2b2b2b' },
  { name: 'White', hex: '#e8e8e8' },
  { name: 'Grey', hex: '#8a8f96' },
  { name: 'Wood/Tan', hex: '#c8a06a' },
] as const

/**
 * Hex for a stored colour name. Falls back to the raw value (so a legacy
 * free-text CSS colour like "red" still renders) and finally a neutral grey.
 */
export function colorHex(name?: string | null): string {
  if (!name) return '#9aa398'
  const match = HOLD_COLORS.find(c => c.name.toLowerCase() === name.toLowerCase())
  return match?.hex ?? name
}
