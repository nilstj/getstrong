import { differenceInCalendarWeeks } from 'date-fns'

/**
 * How many weeks in a row a crew has been active, counting back from now.
 * `dates` are ISO timestamps of the activity being counted — the crew's beta
 * posts. The current week counts as in-progress: if there's activity this week
 * the streak includes it; if not, the streak is measured ending last week (0 if
 * last week was also quiet).
 *
 * A timestamp slightly ahead of `now` still counts, because it buckets into the
 * same calendar week; only one a full week or more ahead is dropped. That is
 * fine here — `boulder_beta.created_at` is server-stamped, so only a skewed
 * device clock can produce one.
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
