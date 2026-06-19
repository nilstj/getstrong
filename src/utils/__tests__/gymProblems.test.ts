import { describe, it, expect } from 'vitest'
import { gymProblemMatches, daysUntil } from '../gymProblems'

const base = { gym: 'Boulders Oslo', color: 'Blue', status: 'active' as const }

describe('gymProblemMatches', () => {
  it('matches same gym and color, case- and space-insensitive', () => {
    expect(gymProblemMatches(base, { gym: '  boulders oslo ', color: 'BLUE' })).toBe(true)
  })
  it('does not match a different color', () => {
    expect(gymProblemMatches(base, { gym: 'Boulders Oslo', color: 'Red' })).toBe(false)
  })
  it('does not match a different gym', () => {
    expect(gymProblemMatches(base, { gym: 'Klatreverket', color: 'Blue' })).toBe(false)
  })
  it('does not match archived boulders', () => {
    expect(gymProblemMatches({ ...base, status: 'archived' }, { gym: 'Boulders Oslo', color: 'Blue' })).toBe(false)
  })
  it('does not match when criteria gym or color is null/empty', () => {
    expect(gymProblemMatches(base, { gym: null, color: 'Blue' })).toBe(false)
    expect(gymProblemMatches(base, { gym: 'Boulders Oslo', color: '' })).toBe(false)
  })
})

describe('daysUntil', () => {
  it('counts whole days until a future date', () => {
    expect(daysUntil('2026-06-28', new Date('2026-06-19T10:00:00Z'))).toBe(9)
  })
  it('is zero on the expiry day', () => {
    expect(daysUntil('2026-06-19', new Date('2026-06-19T23:00:00Z'))).toBe(0)
  })
  it('is negative after expiry', () => {
    expect(daysUntil('2026-06-18', new Date('2026-06-19T10:00:00Z'))).toBe(-1)
  })
})
