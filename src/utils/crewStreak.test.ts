import { describe, it, expect } from 'vitest'
import { subWeeks, addWeeks } from 'date-fns'
import { weeklyStreak } from './crewStreak'

// Fixed reference point so the assertions never depend on the day the suite runs.
// subWeeks keeps the same weekday, so differenceInCalendarWeeks is exactly n.
const NOW = new Date('2026-07-31T12:00:00Z')
const weeksAgo = (n: number) => subWeeks(NOW, n).toISOString()

describe('weeklyStreak', () => {
  it('is zero with nothing to count', () => {
    expect(weeklyStreak([], NOW)).toBe(0)
  })

  it('counts this week alone as one', () => {
    expect(weeklyStreak([weeksAgo(0)], NOW)).toBe(1)
  })

  it('counts consecutive weeks back from this one', () => {
    expect(weeklyStreak([weeksAgo(0), weeksAgo(1), weeksAgo(2)], NOW)).toBe(3)
  })

  it('treats the current week as in progress rather than a break', () => {
    // Nothing yet this week, but last week and the one before were active.
    expect(weeklyStreak([weeksAgo(1), weeksAgo(2)], NOW)).toBe(2)
  })

  it('is zero when the most recent activity is too old to be in progress', () => {
    expect(weeklyStreak([weeksAgo(2), weeksAgo(3)], NOW)).toBe(0)
  })

  it('stops at the first gap', () => {
    expect(weeklyStreak([weeksAgo(0), weeksAgo(2), weeksAgo(3)], NOW)).toBe(1)
  })

  it('counts a week once however many dates land in it', () => {
    expect(weeklyStreak([weeksAgo(0), weeksAgo(0), weeksAgo(0)], NOW)).toBe(1)
  })

  it('ignores dates in the future', () => {
    expect(weeklyStreak([addWeeks(NOW, 1).toISOString()], NOW)).toBe(0)
  })
})
