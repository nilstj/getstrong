import { describe, it, expect } from 'vitest'
import { boulderToPrefill } from '../boulderPrefill'
import type { GymProblem } from '../../types'

const boulder: GymProblem = {
  id: 'gp1', gym: 'Boulders Oslo', wall_angle: 'overhang', color: 'Blue', hold_color: 'Yellow',
  community_grade: '6B', name: 'The Prow', setter: 'Anna K.', setter_intention: null, image_url: 'https://x/p.jpg',
  beta_video_url: 'https://insta/v', created_by: 'u1', set_at: '2026-06-01',
  expires_at: '2026-07-01', status: 'active', created_at: '2026-06-01T00:00:00Z',
}

describe('boulderToPrefill', () => {
  it('maps boulder fields to new-problem defaults', () => {
    expect(boulderToPrefill(boulder)).toEqual({
      name: 'The Prow', color: 'Blue', hold_color: 'Yellow', grade_value: '6B',
      image_url: 'https://x/p.jpg', beta_video_url: 'https://insta/v', gym: 'Boulders Oslo',
    })
  })
  it('preserves nulls (no name/color/grade/photo/video)', () => {
    expect(boulderToPrefill({ ...boulder, name: null, color: null, hold_color: null, community_grade: null, image_url: null, beta_video_url: null }))
      .toEqual({ name: null, color: null, hold_color: null, grade_value: null, image_url: null, beta_video_url: null, gym: 'Boulders Oslo' })
  })
})
