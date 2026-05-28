import { describe, it, expect } from 'vitest'
import { totalSessions, totalProblems, totalSends, sendRate } from '../stats'
import type { Session, Problem } from '../../types'

const SESSIONS: Session[] = [
  { id: 's1', user_id: 'u1', date: '2026-05-20', location: 'Gym', duration_minutes: 90, notes: null, created_at: '' },
  { id: 's2', user_id: 'u1', date: '2026-05-22', location: 'Kilter', duration_minutes: 60, notes: null, created_at: '' },
]

const PROBLEMS: Problem[] = [
  { id: 'p1', session_id: 's1', user_id: 'u1', grade_system: 'font', grade_value: '7A', color: null, attempts: 3, sent: true, notes: null, created_at: '' },
  { id: 'p2', session_id: 's1', user_id: 'u1', grade_system: 'v_scale', grade_value: 'V5', color: null, attempts: 1, sent: false, notes: null, created_at: '' },
  { id: 'p3', session_id: 's2', user_id: 'u1', grade_system: 'font', grade_value: '6B+', color: null, attempts: 2, sent: true, notes: null, created_at: '' },
]

describe('totalSessions', () => {
  it('returns session count', () => {
    expect(totalSessions(SESSIONS)).toBe(2)
  })
  it('returns 0 for empty array', () => {
    expect(totalSessions([])).toBe(0)
  })
})

describe('totalProblems', () => {
  it('returns problem count', () => {
    expect(totalProblems(PROBLEMS)).toBe(3)
  })
})

describe('totalSends', () => {
  it('counts only sent problems', () => {
    expect(totalSends(PROBLEMS)).toBe(2)
  })
  it('returns 0 when nothing sent', () => {
    const unsent = PROBLEMS.map(p => ({ ...p, sent: false }))
    expect(totalSends(unsent)).toBe(0)
  })
})

describe('sendRate', () => {
  it('returns send rate as integer percentage', () => {
    expect(sendRate(PROBLEMS)).toBe(67)
  })
  it('returns 0 when no problems', () => {
    expect(sendRate([])).toBe(0)
  })
  it('returns 100 when all sent', () => {
    const allSent = PROBLEMS.map(p => ({ ...p, sent: true }))
    expect(sendRate(allSent)).toBe(100)
  })
})
