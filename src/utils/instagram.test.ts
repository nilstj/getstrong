import { describe, it, expect } from 'vitest'
import { parseInstagramHandle, instagramUrl } from './instagram'

describe('parseInstagramHandle', () => {
  it('accepts a bare handle', () => {
    expect(parseInstagramHandle('nils')).toEqual({ status: 'ok', handle: 'nils' })
  })

  it('strips a leading @', () => {
    expect(parseInstagramHandle('@nils.climbs')).toEqual({ status: 'ok', handle: 'nils.climbs' })
  })

  it('trims surrounding whitespace', () => {
    expect(parseInstagramHandle('  @nils  ')).toEqual({ status: 'ok', handle: 'nils' })
  })

  it('reduces a pasted profile URL to the handle, in all the shapes people paste', () => {
    for (const input of [
      'instagram.com/nils',
      'www.instagram.com/nils',
      'https://instagram.com/nils',
      'https://www.instagram.com/nils/',
      'http://m.instagram.com/nils',
      'https://instagram.com/nils?hl=en',
      'https://www.instagram.com/nils/?utm_source=qr',
    ]) {
      expect(parseInstagramHandle(input)).toEqual({ status: 'ok', handle: 'nils' })
    }
  })

  it('preserves the capitalisation the climber typed', () => {
    expect(parseInstagramHandle('@NilsClimbs')).toEqual({ status: 'ok', handle: 'NilsClimbs' })
  })

  it('reads a cleared field as empty rather than invalid', () => {
    expect(parseInstagramHandle('')).toEqual({ status: 'empty' })
    expect(parseInstagramHandle('   ')).toEqual({ status: 'empty' })
    expect(parseInstagramHandle('@')).toEqual({ status: 'empty' })
  })

  it('rejects anything that is not a lone handle', () => {
    for (const input of [
      'nils/photos',
      'nils@x',
      'nils climbs',
      'instagram.com/p/abc123',
      'a'.repeat(31),
    ]) {
      expect(parseInstagramHandle(input)).toEqual({ status: 'invalid' })
    }
  })

  it('accepts a handle at the 30-character boundary', () => {
    const h = 'a'.repeat(30)
    expect(parseInstagramHandle(h)).toEqual({ status: 'ok', handle: h })
  })
})

describe('instagramUrl', () => {
  it('builds the profile URL from the handle alone', () => {
    expect(instagramUrl('nils.climbs')).toBe('https://instagram.com/nils.climbs')
  })
})
