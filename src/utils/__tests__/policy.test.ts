import { describe, it, expect } from 'vitest'
import {
  UNSET, unresolvedControllerFacts, hasAcceptedCurrentPolicy, POLICY_VERSION,
} from '../policy'

describe('unresolvedControllerFacts', () => {
  it('names every fact still unfilled', () => {
    expect(unresolvedControllerFacts({ name: UNSET, email: UNSET, supabaseRegion: UNSET }))
      .toEqual(['controller name', 'contact address', 'Supabase region'])
  })

  it('names only what is missing', () => {
    expect(unresolvedControllerFacts({ name: 'A Climber', email: UNSET, supabaseRegion: 'eu-north-1' }))
      .toEqual(['contact address'])
  })

  it('is empty once all three are filled', () => {
    expect(unresolvedControllerFacts({ name: 'A Climber', email: 'a@b.no', supabaseRegion: 'eu-north-1' }))
      .toEqual([])
  })

  it('treats blank as unfilled, so whitespace cannot pass for an answer', () => {
    expect(unresolvedControllerFacts({ name: '  ', email: '', supabaseRegion: 'eu-north-1' }))
      .toEqual(['controller name', 'contact address'])
  })
})

describe('hasAcceptedCurrentPolicy', () => {
  it('accepts a profile on the current version', () => {
    expect(hasAcceptedCurrentPolicy({ policy_version: POLICY_VERSION })).toBe(true)
  })

  it('rejects a profile on an older version', () => {
    expect(hasAcceptedCurrentPolicy({ policy_version: '1970-01-01' })).toBe(false)
  })

  it('rejects a profile that never accepted', () => {
    expect(hasAcceptedCurrentPolicy({ policy_version: null })).toBe(false)
  })

  it('rejects a missing profile, so the gate fails closed', () => {
    expect(hasAcceptedCurrentPolicy(undefined)).toBe(false)
  })
})
