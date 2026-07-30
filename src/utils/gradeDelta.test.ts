import { describe, it, expect } from 'vitest'
import { gradeDelta } from './gradeDelta'

describe('gradeDelta', () => {
  it('says how much harder a variation is', () => {
    expect(gradeDelta('6C', '7A')).toBe('2 harder than 6C')
  })

  it('says how much softer a variation is', () => {
    expect(gradeDelta('6C', '6B+')).toBe('1 softer than 6C')
  })

  it('says when a variation grades the same', () => {
    expect(gradeDelta('6C', '6C')).toBe('same as 6C')
  })

  it('works on the V scale too', () => {
    expect(gradeDelta('V4', 'V6')).toBe('2 harder than V4')
    expect(gradeDelta('V4', 'V3')).toBe('1 softer than V4')
  })

  it('spans the full width of each scale', () => {
    expect(gradeDelta('3', '9A')).toBe('22 harder than 3')
    expect(gradeDelta('VB', 'V17')).toBe('18 harder than VB')
  })

  it('has nothing to say when either grade is missing', () => {
    expect(gradeDelta(null, '7A')).toBeNull()
    expect(gradeDelta('6C', null)).toBeNull()
    expect(gradeDelta(undefined, undefined)).toBeNull()
    expect(gradeDelta('', '7A')).toBeNull()
  })

  it('refuses to compare across scales', () => {
    expect(gradeDelta('6C', 'V5')).toBeNull()
    expect(gradeDelta('V5', '6C')).toBeNull()
  })

  it('refuses to compare a grade it does not recognise', () => {
    expect(gradeDelta('6C', '7Z')).toBeNull()
    expect(gradeDelta('nonsense', '7A')).toBeNull()
    expect(gradeDelta('V4', 'V99')).toBeNull()
  })
})
