import { fontGradeToIndex } from './grades'

/**
 * The crowd-consensus grade for a boulder: the most frequently logged grade
 * among its problems. Ties break toward the harder grade (Font ranking).
 * Inputs are Font-normalized grade strings (`grade_value_font`); nulls ignored.
 * Returns null when there are no grades.
 */
export function consensusGrade(grades: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>()
  for (const g of grades) {
    if (g) counts.set(g, (counts.get(g) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = -1
  let bestIdx = -1
  for (const [grade, count] of counts) {
    const idx = fontGradeToIndex(grade)
    if (count > bestCount || (count === bestCount && idx > bestIdx)) {
      best = grade
      bestCount = count
      bestIdx = idx
    }
  }
  return best
}
