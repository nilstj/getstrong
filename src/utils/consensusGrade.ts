import { fontGradeToIndex } from './grades'

/**
 * The crowd-consensus grade for a boulder, given how many times each grade was
 * logged on it: the most frequently logged grade wins, and ties break toward
 * the harder grade (Font ranking). Keys are Font-normalized grade strings
 * (`grade_value_font`). Returns null for an empty histogram.
 *
 * This is the shape the database sends back — get_boulder_crew_stats (migration
 * 097) counts the grades server-side so the home page never downloads one row
 * per climber just to rank them. The ladder lives here rather than in SQL so
 * there is only ever one copy of it.
 */
export function consensusGradeFromCounts(counts: Record<string, number>): string | null {
  let best: string | null = null
  let bestCount = -1
  let bestIdx = -1
  for (const [grade, count] of Object.entries(counts)) {
    const idx = fontGradeToIndex(grade)
    if (count > bestCount || (count === bestCount && idx > bestIdx)) {
      best = grade
      bestCount = count
      bestIdx = idx
    }
  }
  return best
}

/**
 * The crowd-consensus grade for a boulder: the most frequently logged grade
 * among its problems. Ties break toward the harder grade (Font ranking).
 * Inputs are Font-normalized grade strings (`grade_value_font`); nulls ignored.
 * Returns null when there are no grades.
 */
export function consensusGrade(grades: (string | null | undefined)[]): string | null {
  const counts: Record<string, number> = {}
  for (const g of grades) {
    if (g) counts[g] = (counts[g] ?? 0) + 1
  }
  return consensusGradeFromCounts(counts)
}
