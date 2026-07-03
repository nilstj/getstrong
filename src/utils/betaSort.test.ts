import { describe, it, expect } from 'vitest'
import { betaSort } from './betaSort'
import type { BoulderBeta } from '../types'

const beta = (id: string, worked_count: number, created_at: string): BoulderBeta =>
  ({ id, gym_problem_id: 'g', user_id: 'u', body: 'x', video_url: null, section: null, body_type: null, created_at, worked_count, worked_by_me: false })

describe('betaSort', () => {
  it('ranks higher worked_count first', () => {
    const list = [beta('a', 1, '2026-01-02'), beta('b', 9, '2026-01-01')]
    expect([...list].sort(betaSort).map(b => b.id)).toEqual(['b', 'a'])
  })

  it('breaks ties by most recent', () => {
    const list = [beta('a', 3, '2026-01-01'), beta('b', 3, '2026-01-09')]
    expect([...list].sort(betaSort).map(b => b.id)).toEqual(['b', 'a'])
  })
})
