import { describe, it, expect } from 'vitest'
import { todayDateString } from './dates'

describe('todayDateString', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    // new Date(y, mIndex, d) is constructed in local time, so the parts read back unchanged.
    expect(todayDateString(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(todayDateString(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('uses local components, not UTC (late-evening case)', () => {
    // 2026-06-29 23:30 local — UTC may already be the 30th, but local date must stay the 29th.
    expect(todayDateString(new Date(2026, 5, 29, 23, 30))).toBe('2026-06-29')
  })
})
