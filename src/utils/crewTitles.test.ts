import { describe, it, expect } from 'vitest'
import { crewTitles } from './crewTitles'

const row = (user_id: string, sent: boolean, attempts: number, created_at: string) =>
  ({ user_id, sent, attempts, created_at })

describe('crewTitles', () => {
  it('awards flash to a one-attempt send', () => {
    const t = crewTitles([row('a', true, 1, '2026-01-01')])
    expect(t['a']).toContain('flash')
  })

  it('awards grinder to the sender with the most attempts', () => {
    const t = crewTitles([
      row('a', true, 2, '2026-01-01'),
      row('b', true, 9, '2026-01-02'),
    ])
    expect(t['b']).toContain('grinder')
    expect(t['a'] ?? []).not.toContain('grinder')
  })

  it('awards first_send to the earliest sender', () => {
    const t = crewTitles([
      row('a', true, 3, '2026-01-05'),
      row('b', true, 3, '2026-01-02'),
    ])
    expect(t['b']).toContain('first_send')
  })

  it('ignores non-senders for flash/grinder/first_send', () => {
    const t = crewTitles([row('a', false, 1, '2026-01-01')])
    expect(t['a'] ?? []).toEqual([])
  })

  it('returns an empty map for no rows', () => {
    expect(crewTitles([])).toEqual({})
  })
})
