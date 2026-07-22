import { describe, it, expect } from 'vitest'
import { normalizeGyms, primaryGym, addGym, removeGym, moveToFront } from '../defaultGyms'

describe('normalizeGyms', () => {
  it('trims entries and drops empties/whitespace', () => {
    expect(normalizeGyms(['  Boulders Oslo ', '', '   '])).toEqual(['Boulders Oslo'])
  })
  it('dedupes case-insensitively, keeping the first occurrence', () => {
    expect(normalizeGyms(['Boulders', 'boulders', 'Klatreverket'])).toEqual(['Boulders', 'Klatreverket'])
  })
  it('preserves order', () => {
    expect(normalizeGyms(['B', 'A', 'C'])).toEqual(['B', 'A', 'C'])
  })
})

describe('primaryGym', () => {
  it('returns the first normalized entry', () => {
    expect(primaryGym(['  ', 'Boulders', 'Klatreverket'])).toBe('Boulders')
  })
  it('returns null for an empty/blank list', () => {
    expect(primaryGym(['', '  '])).toBeNull()
    expect(primaryGym([])).toBeNull()
  })
})

describe('addGym', () => {
  it('appends a new gym', () => {
    expect(addGym(['Boulders'], 'Klatreverket')).toEqual(['Boulders', 'Klatreverket'])
  })
  it('does not add a case-insensitive duplicate', () => {
    expect(addGym(['Boulders'], 'boulders')).toEqual(['Boulders'])
  })
  it('ignores blank input', () => {
    expect(addGym(['Boulders'], '   ')).toEqual(['Boulders'])
  })
})

describe('removeGym', () => {
  it('removes a matching entry case-insensitively', () => {
    expect(removeGym(['Boulders', 'Klatreverket'], 'boulders')).toEqual(['Klatreverket'])
  })
})

describe('moveToFront', () => {
  it('moves the matching entry to the front', () => {
    expect(moveToFront(['A', 'B', 'C'], 'B')).toEqual(['B', 'A', 'C'])
  })
  it('is a no-op when the entry is absent', () => {
    expect(moveToFront(['A', 'B'], 'Z')).toEqual(['A', 'B'])
  })
})
