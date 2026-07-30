/**
 * Caption under a boulder's ring in the Latest Gym Problems strip: the proposed
 * grade, with a "Variation" marker after it when the boulder has one.
 *
 * The marker is text rather than another badge on the circle deliberately — the
 * ring already carries help-wanted, video and hold colour, and StoryRing records
 * that it got too busy once already. The caption is `line-clamp-2`, so the longer
 * string wraps to a second line instead of needing new layout.
 */
export function boulderStripLabel(
  grade: string | null | undefined,
  hasVariation: boolean,
): string {
  if (hasVariation) return grade ? `${grade} · Variation` : 'Variation'
  return grade ?? ''
}
