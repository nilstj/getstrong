import { describe, it, expect } from 'vitest'
import { betaSort } from './betaSort'
import type { BoulderBeta, BetaKind } from '../types'

const beta = (id: string, worked_count: number, created_at: string, kind: BetaKind = 'beta'): BoulderBeta =>
  ({ id, gym_problem_id: 'g', user_id: 'u', body: 'x', video_url: null, section: null, body_type: null,
     kind, risk_move: kind === 'caution' ? 'heel_hook' : null,
     created_at, worked_count, worked_by_me: false })

describe('betaSort', () => {
  it('ranks higher worked_count first', () => {
    const list = [beta('a', 1, '2026-01-02'), beta('b', 9, '2026-01-01')]
    expect([...list].sort(betaSort).map(b => b.id)).toEqual(['b', 'a'])
  })

  it('breaks ties by most recent', () => {
    const list = [beta('a', 3, '2026-01-01'), beta('b', 3, '2026-01-09')]
    expect([...list].sort(betaSort).map(b => b.id)).toEqual(['b', 'a'])
  })

  it('pins a caution above a tip however well the tip worked', () => {
    const list = [beta('tip', 9, '2026-01-09'), beta('caution', 0, '2026-01-01', 'caution')]
    expect([...list].sort(betaSort).map(b => b.id)).toEqual(['caution', 'tip'])
  })

  it('pins cautions above tips even when tips have higher worked count', () => {
    const list = [
      beta('caution_low', 1, '2026-01-02', 'caution'),
      beta('tip_high', 9, '2026-01-01'),
      beta('caution_mid', 4, '2026-01-03', 'caution')
    ]
    expect([...list].sort(betaSort).map(b => b.id)).toEqual(['caution_mid', 'caution_low', 'tip_high'])
  })
})
