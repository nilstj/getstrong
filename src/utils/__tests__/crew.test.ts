import { describe, it, expect } from 'vitest'
import { deriveMemberState, buildCrew, summarizeCrew } from '../crew'

describe('deriveMemberState', () => {
  it('is projecting with no sends', () => {
    expect(deriveMemberState([{ sent: false, attempts: 4 }])).toBe('projecting')
  })
  it('is projecting when empty', () => {
    expect(deriveMemberState([])).toBe('projecting')
  })
  it('is sent when sent in more than one attempt', () => {
    expect(deriveMemberState([{ sent: true, attempts: 3 }])).toBe('sent')
  })
  it('is flashed when sent in exactly one attempt', () => {
    expect(deriveMemberState([{ sent: true, attempts: 1 }])).toBe('flashed')
  })
  it('takes the best outcome across multiple problems', () => {
    expect(deriveMemberState([
      { sent: false, attempts: 9 },
      { sent: true, attempts: 1 },
    ])).toBe('flashed')
    expect(deriveMemberState([
      { sent: true, attempts: 5 },
      { sent: false, attempts: 2 },
    ])).toBe('sent')
  })
})

describe('buildCrew', () => {
  const rows = [
    { user_id: 'b', username: 'Bo', avatar_url: null, sent: false, attempts: 2, created_at: '2026-06-12T10:00:00Z' },
    { user_id: 'a', username: 'Ann', avatar_url: 'x', sent: true, attempts: 1, created_at: '2026-06-11T09:00:00Z' },
    { user_id: 'a', username: 'Ann', avatar_url: 'x', sent: false, attempts: 4, created_at: '2026-06-10T09:00:00Z' },
  ]
  it('groups rows by user with earliest joined_at, sorted ascending', () => {
    const crew = buildCrew(rows)
    expect(crew.map(m => m.user_id)).toEqual(['a', 'b'])
    expect(crew[0]).toMatchObject({ user_id: 'a', username: 'Ann', state: 'flashed', joined_at: '2026-06-10T09:00:00Z' })
    expect(crew[1]).toMatchObject({ user_id: 'b', state: 'projecting', joined_at: '2026-06-12T10:00:00Z' })
  })
  it('returns empty for no rows', () => {
    expect(buildCrew([])).toEqual([])
  })
})

describe('summarizeCrew', () => {
  it('counts total, sends (incl. flashes), flashes, and send rate', () => {
    const s = summarizeCrew([
      { state: 'projecting' }, { state: 'sent' }, { state: 'flashed' },
    ])
    expect(s).toEqual({ total: 3, sent: 2, flashed: 1, sendRate: 2 / 3 })
  })
  it('is all-zero with a zero rate for an empty crew', () => {
    expect(summarizeCrew([])).toEqual({ total: 0, sent: 0, flashed: 0, sendRate: 0 })
  })
})
