import { describe, it, expect } from 'vitest'
import { consensusGrade, consensusGradeFromCounts } from './consensusGrade'

describe('consensusGrade', () => {
  it('returns the only grade when there is one', () => {
    expect(consensusGrade(['7A'])).toBe('7A')
  })

  it('returns the most frequently logged grade', () => {
    expect(consensusGrade(['6C', '7A', '7A', '6B'])).toBe('7A')
  })

  it('breaks ties toward the harder grade', () => {
    expect(consensusGrade(['6A', '7B'])).toBe('7B')
  })

  it('ignores null/undefined and returns null when empty', () => {
    expect(consensusGrade([null, undefined])).toBeNull()
    expect(consensusGrade([])).toBeNull()
  })
})

// The same ranking, fed by a histogram instead of a flat list. get_boulder_crew_stats
// (migration 097) counts the grades in the database and sends {grade: count}, so the
// client never sees the individual rows.
describe('consensusGradeFromCounts', () => {
  it('returns the only grade when there is one', () => {
    expect(consensusGradeFromCounts({ '7A': 1 })).toBe('7A')
  })

  it('returns the most frequently logged grade', () => {
    expect(consensusGradeFromCounts({ '6C': 1, '7A': 2, '6B': 1 })).toBe('7A')
  })

  it('breaks ties toward the harder grade', () => {
    expect(consensusGradeFromCounts({ '6A': 1, '7B': 1 })).toBe('7B')
  })

  it('returns null for an empty histogram', () => {
    expect(consensusGradeFromCounts({})).toBeNull()
  })

  it('agrees with consensusGrade on the same data', () => {
    const grades = ['6C', '7A', '7A', '6B']
    expect(consensusGradeFromCounts({ '6C': 1, '7A': 2, '6B': 1 })).toBe(consensusGrade(grades))
  })

  it('still returns a grade the Font ladder does not know', () => {
    expect(consensusGradeFromCounts({ 'B2': 3 })).toBe('B2')
  })
})
