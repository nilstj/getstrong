import { describe, it, expect } from 'vitest'
import { errorMessage } from './errors'

describe('errorMessage', () => {
  it('reads a real Error', () => {
    expect(errorMessage(new Error('Voting has closed'), 'fallback')).toBe('Voting has closed')
  })

  it('reads a PostgREST failure, which is a plain object and not an Error', () => {
    // What supabase-js actually hands back from `{ data, error }`: it only
    // builds a real PostgrestError under .throwOnError(). This is the case the
    // `e instanceof Error` idiom silently dropped.
    const raised = {
      code: 'P0001',
      details: null,
      hint: null,
      message: 'Awards need at least two climbers in the session',
    }
    expect(errorMessage(raised, 'Could not open awards'))
      .toBe('Awards need at least two climbers in the session')
  })

  it('reads a PostgREST schema failure so a missing function is distinguishable', () => {
    const raised = {
      code: 'PGRST202',
      message: 'Could not find the function public.open_award_round(p_group)',
    }
    expect(errorMessage(raised, 'Could not open awards'))
      .toBe('Could not find the function public.open_award_round(p_group)')
  })

  it('carries a sentinel through, so callers can branch on it', () => {
    expect(errorMessage({ message: 'VERDICT_OUT' })).toBe('VERDICT_OUT')
  })

  it('takes a thrown string as the message', () => {
    expect(errorMessage('boom', 'fallback')).toBe('boom')
  })

  it('falls back when there is no usable message', () => {
    expect(errorMessage(null, 'fallback')).toBe('fallback')
    expect(errorMessage(undefined, 'fallback')).toBe('fallback')
    expect(errorMessage({}, 'fallback')).toBe('fallback')
    expect(errorMessage({ message: '' }, 'fallback')).toBe('fallback')
    expect(errorMessage({ message: '   ' }, 'fallback')).toBe('fallback')
    expect(errorMessage({ message: 42 }, 'fallback')).toBe('fallback')
    expect(errorMessage({ message: null }, 'fallback')).toBe('fallback')
    expect(errorMessage(new Error(''), 'fallback')).toBe('fallback')
  })

  it('trims, so a message padded by the server still reads cleanly', () => {
    expect(errorMessage({ message: '  Voting has closed \n' }, 'x')).toBe('Voting has closed')
  })

  it('defaults to an empty fallback, for callers that test the result themselves', () => {
    expect(errorMessage(null)).toBe('')
  })
})
