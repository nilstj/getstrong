import { describe, it, expect } from 'vitest'
import { boulderStripLabel, boulderStripAriaLabel } from './boulderStripLabel'

describe('boulderStripLabel', () => {
  it('is the grade alone', () => {
    expect(boulderStripLabel('6A')).toBe('6A')
  })

  // The variation marker moved to a badge on the ring, so it must not come back
  // into the caption -- a second line pushes the whole strip taller.
  it('is empty when the boulder has no grade yet', () => {
    expect(boulderStripLabel(null)).toBe('')
    expect(boulderStripLabel(undefined)).toBe('')
    expect(boulderStripLabel('')).toBe('')
  })
})

describe('boulderStripAriaLabel', () => {
  const base = { title: 'Black', grade: '6A', hasVariation: false, helpWanted: false }

  it('names the boulder and its grade', () => {
    expect(boulderStripAriaLabel(base)).toBe('Black (6A)')
  })

  it('drops the parenthetical when there is no grade', () => {
    expect(boulderStripAriaLabel({ ...base, grade: null })).toBe('Black')
    expect(boulderStripAriaLabel({ ...base, grade: '' })).toBe('Black')
  })

  // The corner badges are invisible to screen readers, so this is the only place
  // a variation or an open ask gets announced at all.
  it('announces a variation, which the caption no longer shows', () => {
    expect(boulderStripAriaLabel({ ...base, hasVariation: true }))
      .toBe('Black (6A), has a variation')
  })

  it('announces an open ask for beta', () => {
    expect(boulderStripAriaLabel({ ...base, helpWanted: true }))
      .toBe('Black (6A), help wanted')
  })

  it('announces both, in corner order', () => {
    expect(boulderStripAriaLabel({ ...base, hasVariation: true, helpWanted: true }))
      .toBe('Black (6A), has a variation, help wanted')
  })
})
