import { FONT_GRADES_ORDERED, V_GRADES, gradeSystemFor } from './grades'

/**
 * Which grade scale to offer in a variation's grade `<select>`. Naively using
 * the viewer's `grade_preference` breaks two ways: a V-scale climber grading a
 * Font-graded boulder is offered V grades, gets a comparison phrase that can
 * never appear (gradeDelta refuses to cross scales), and nothing explains why;
 * and a setter who graded a variation in one scale sees a blank `<select>` the
 * moment they switch their own preference to the other.
 *
 * Precedence: a stored grade's own scale wins first (an editor must always be
 * able to show what it holds), then the boulder's scale (so the picked grade
 * is comparable with it — the whole point of the phrase), then the viewer's
 * preference, defaulting to Font when that's absent too.
 */
export function gradeOptions(
  existingGrade: string | null | undefined,
  boulderGrade: string | null | undefined,
  preference: 'font' | 'v_scale' | undefined,
): string[] {
  const system = existingGrade ? gradeSystemFor(existingGrade)
    : boulderGrade ? gradeSystemFor(boulderGrade)
    : preference

  return system === 'v_scale' ? V_GRADES : FONT_GRADES_ORDERED
}
