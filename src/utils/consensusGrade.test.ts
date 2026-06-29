import { describe, it, expect } from 'vitest'
import { consensusGrade } from './consensusGrade'

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
