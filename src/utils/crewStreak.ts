import { differenceInCalendarWeeks } from 'date-fns'

/**
 * How many weeks in a row a crew has been active, counting back from now.
 * `dates` are ISO timestamps of crew activity (member sessions). The current
 * week counts as in-progress: if there's activity this week the streak includes
 * it; if not, the streak is measured ending last week (0 if last week was also
 * quiet).
 */
export function weeklyStreak(dates: string[], now: Date): number {
  if (dates.length === 0) return 0
  const weeksAgo = new Set<number>()
  for (const d of dates) {
    const diff = differenceInCalendarWeeks(now, new Date(d))
    if (diff >= 0) weeksAgo.add(diff)
  }
  // Start at this week if active, else last week.
  let i = weeksAgo.has(0) ? 0 : 1
  if (!weeksAgo.has(i)) return 0
  let streak = 0
  while (weeksAgo.has(i)) { streak++; i++ }
  return streak
}
