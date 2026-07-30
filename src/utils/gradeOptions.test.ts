import { describe, it, expect } from 'vitest'
import { gradeOptions } from './gradeOptions'
import { FONT_GRADES_ORDERED, V_GRADES } from './grades'

describe('gradeOptions', () => {
  it('picks the scale of an existing grade over a differing boulder grade', () => {
    expect(gradeOptions('V5', '6C', 'font')).toBe(V_GRADES)
  })

  it('picks the scale of the boulder grade over a differing preference, when there is no existing grade', () => {
    expect(gradeOptions(null, '6C', 'v_scale')).toBe(FONT_GRADES_ORDERED)
  })

  it('falls back to preference when both existing and boulder grade are absent', () => {
    expect(gradeOptions(null, null, 'v_scale')).toBe(V_GRADES)
    expect(gradeOptions(undefined, undefined, 'font')).toBe(FONT_GRADES_ORDERED)
  })

  it('falls back to Font when preference is undefined and nothing else decides it', () => {
    expect(gradeOptions(null, null, undefined)).toBe(FONT_GRADES_ORDERED)
    expect(gradeOptions(undefined, undefined, undefined)).toBe(FONT_GRADES_ORDERED)
  })

  it('yields a usable array rather than throwing for an unrecognised grade string', () => {
    expect(gradeOptions('nonsense', '6C', 'v_scale')).toBe(FONT_GRADES_ORDERED)
    expect(() => gradeOptions('nonsense', null, undefined)).not.toThrow()
  })

  it('treats an empty-string existing grade as absent, falling through to boulder grade', () => {
    expect(gradeOptions('', 'V5', 'font')).toBe(V_GRADES)
  })
})
