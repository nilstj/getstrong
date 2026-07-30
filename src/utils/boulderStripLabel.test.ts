import { describe, it, expect } from 'vitest'
import { boulderStripLabel } from './boulderStripLabel'

describe('boulderStripLabel', () => {
  it('is the grade alone when there is no variation', () => {
    expect(boulderStripLabel('6A', false)).toBe('6A')
  })

  it('marks a variation after the grade', () => {
    expect(boulderStripLabel('6A', true)).toBe('6A · Variation')
  })

  it('is the marker alone when the boulder has no grade yet', () => {
    expect(boulderStripLabel(null, true)).toBe('Variation')
    expect(boulderStripLabel(undefined, true)).toBe('Variation')
    expect(boulderStripLabel('', true)).toBe('Variation')
  })

  it('is empty when there is neither a grade nor a variation', () => {
    expect(boulderStripLabel(null, false)).toBe('')
    expect(boulderStripLabel('', false)).toBe('')
  })
})
