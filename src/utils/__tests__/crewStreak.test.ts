import { describe, it, expect } from 'vitest'
import { weeklyStreak } from '../crewStreak'

// A fixed "now" (a Thursday) so week math is deterministic.
const now = new Date('2026-07-23T12:00:00Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString()

describe('weeklyStreak', () => {
  it('is 0 with no activity', () => {
    expect(weeklyStreak([], now)).toBe(0)
  })

  it('counts the current week when active', () => {
    expect(weeklyStreak([daysAgo(1)], now)).toBe(1)
  })

  it('counts consecutive weeks back from this week', () => {
    // this week, last week, two weeks ago
    expect(weeklyStreak([daysAgo(1), daysAgo(8), daysAgo(15)], now)).toBe(3)
  })

  it('still counts a streak ending last week when this week is quiet', () => {
    expect(weeklyStreak([daysAgo(8), daysAgo(15)], now)).toBe(2)
  })

  it('breaks the streak on a gap', () => {
    // this week + three weeks ago (last week and two-weeks-ago missing)
    expect(weeklyStreak([daysAgo(1), daysAgo(22)], now)).toBe(1)
  })

  it('is 0 when the most recent activity is older than last week', () => {
    expect(weeklyStreak([daysAgo(22)], now)).toBe(0)
  })

  it('does not double-count multiple sessions in the same week', () => {
    expect(weeklyStreak([daysAgo(1), daysAgo(2), daysAgo(3)], now)).toBe(1)
  })
})
