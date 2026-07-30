import { FONT_GRADES_ORDERED, V_GRADES, gradeSystemFor } from './grades'

/**
 * How a variation's grade reads against its boulder's, as a phrase for display:
 * "2 harder than 6C". Derived at render time rather than stored, so it stays
 * true if either grade is later changed.
 *
 * Returns null whenever there is no honest comparison to make — a missing grade,
 * two different scales (converting Font↔V needs the gym's own mapping table), or
 * a string that isn't a grade we know. Both columns are free text, so an
 * unrecognised value is a real possibility, and a nonsense number would be worse
 * than saying nothing.
 */
export function gradeDelta(
  boulderGrade: string | null | undefined,
  variationGrade: string | null | undefined,
): string | null {
  if (!boulderGrade || !variationGrade) return null

  const system = gradeSystemFor(boulderGrade)
  if (system !== gradeSystemFor(variationGrade)) return null

  const scale = system === 'v_scale' ? V_GRADES : FONT_GRADES_ORDERED
  const from = scale.indexOf(boulderGrade)
  const to = scale.indexOf(variationGrade)
  if (from === -1 || to === -1) return null

  const steps = to - from
  if (steps === 0) return `same as ${boulderGrade}`
  return `${Math.abs(steps)} ${steps > 0 ? 'harder' : 'softer'} than ${boulderGrade}`
}
