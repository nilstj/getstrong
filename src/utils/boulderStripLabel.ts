/**
 * Caption under a boulder's ring in the Latest Gym Problems strip: the proposed
 * grade, and nothing else.
 *
 * It used to append "· Variation". That marker is now a 🧩 badge on the ring's
 * bottom-right corner instead — the caption is `line-clamp-2` and a two-line
 * caption on a 64px tile pushed the row taller than the rings themselves.
 * StoryRing records that the circle got too busy once already, which is why
 * only the tape colour and this marker sit on it, not the hold colour too.
 */
export function boulderStripLabel(grade: string | null | undefined): string {
  return grade ?? ''
}

/**
 * The ring's accessible name.
 *
 * The tile is a single `<button aria-label=…>`, and an explicit aria-label wins
 * over everything inside it — so the 🆘 and 🧩 badges are announced to nobody.
 * Anything a sighted climber reads off the corners has to be said here instead,
 * which is what keeps "leave out the variation text" from also deleting it for
 * screen-reader users.
 */
export function boulderStripAriaLabel(input: {
  title: string
  grade: string | null | undefined
  hasVariation: boolean
  helpWanted: boolean
}): string {
  const parts = [input.grade ? `${input.title} (${input.grade})` : input.title]
  if (input.hasVariation) parts.push('has a variation')
  if (input.helpWanted) parts.push('help wanted')
  return parts.join(', ')
}
