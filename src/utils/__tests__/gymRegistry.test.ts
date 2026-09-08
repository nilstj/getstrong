import { describe, it, expect } from 'vitest'
import { foldGymText, canonicalGymKey, gymLabel, isPlausibleGymName } from '../gymRegistry'

describe('foldGymText', () => {
  it('lowercases and trims', () => {
    expect(foldGymText('  Klatreverket ')).toBe('klatreverket')
  })
  it('collapses internal whitespace', () => {
    expect(foldGymText('Boulders   Oslo')).toBe('boulders oslo')
  })
  it('turns punctuation into a single space', () => {
    expect(foldGymText('Klatreverket - Torshov')).toBe('klatreverket torshov')
    expect(foldGymText('Klatreverket, Torshov')).toBe('klatreverket torshov')
    expect(foldGymText('St. Hanshaugen')).toBe('st hanshaugen')
  })
  it('folds Nordic characters', () => {
    expect(foldGymText('Bålerud')).toBe('balerud')
    expect(foldGymText('Tøyen')).toBe('toyen')
    expect(foldGymText('Færder')).toBe('faerder')
  })
  it('folds other common diacritics', () => {
    expect(foldGymText('Café Blocs')).toBe('cafe blocs')
    expect(foldGymText('Múnchen')).toBe('munchen')
  })
  it('keeps digits', () => {
    expect(foldGymText('Blocs 24')).toBe('blocs 24')
  })
  it('falls back to the collapsed original when folding would empty the string', () => {
    // A non-latin name must not fold to '' — every such gym would share one key.
    expect(foldGymText('Скала')).toBe('скала')
    expect(foldGymText('  Скала   Юг ')).toBe('скала юг')
  })
})

describe('canonicalGymKey', () => {
  it('folds name and city into one key with no boundary', () => {
    expect(canonicalGymKey('Klatreverket', 'Torshov')).toBe('klatreverket torshov')
  })
  it('gives a legacy single-string name the same key as the split form', () => {
    expect(canonicalGymKey('Klatreverket, Torshov', null)).toBe(canonicalGymKey('Klatreverket', 'Torshov'))
  })
  it('treats a missing city as an empty one', () => {
    expect(canonicalGymKey('Klatreverket')).toBe('klatreverket')
    expect(canonicalGymKey('Klatreverket', '')).toBe('klatreverket')
    expect(canonicalGymKey('Klatreverket', '  ')).toBe('klatreverket')
  })
  it('is case- and whitespace-insensitive', () => {
    expect(canonicalGymKey(' KLATREVERKET ', ' torshov ')).toBe('klatreverket torshov')
  })
})

describe('gymLabel', () => {
  it('joins name and city with a comma', () => {
    expect(gymLabel('Klatreverket', 'Torshov')).toBe('Klatreverket, Torshov')
  })
  it('is the trimmed name alone when there is no city', () => {
    expect(gymLabel('  Klatreverket ', null)).toBe('Klatreverket')
    expect(gymLabel('Klatreverket', '   ')).toBe('Klatreverket')
    expect(gymLabel('Klatreverket')).toBe('Klatreverket')
  })
})

describe('isPlausibleGymName', () => {
  it('accepts a normal gym name', () => {
    expect(isPlausibleGymName('Klatreverket')).toBe(true)
    expect(isPlausibleGymName('Blocs 24')).toBe(true)
    expect(isPlausibleGymName('Скала')).toBe(true)
  })
  it('rejects too short and too long', () => {
    expect(isPlausibleGymName('K')).toBe(false)
    expect(isPlausibleGymName(' ')).toBe(false)
    expect(isPlausibleGymName('ab'.repeat(30))).toBe(true)  // exactly 60
    expect(isPlausibleGymName('ab'.repeat(31))).toBe(false) // 62
  })
  it('rejects a string with no letters', () => {
    expect(isPlausibleGymName('1234')).toBe(false)
    expect(isPlausibleGymName('!!!!')).toBe(false)
  })
  it('rejects four or more identical characters in a row', () => {
    expect(isPlausibleGymName('aaaa')).toBe(false)
    expect(isPlausibleGymName('Boulderssss')).toBe(false)
    expect(isPlausibleGymName('Boulders')).toBe(true) // 'ss' is fine
  })
})
