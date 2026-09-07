import { describe, it, expect } from 'vitest'
import { boulderToPrefill, defaultVisibilityPublic } from '../boulderPrefill'
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
      color: 'Blue', hold_color: 'Yellow', grade_value: '6B',
      image_url: 'https://x/p.jpg', beta_video_url: 'https://insta/v', gym: 'Boulders Oslo',
    })
  })
  it('drops the boulder name — problems have no name field', () => {
    expect(boulderToPrefill(boulder)).not.toHaveProperty('name')
  })
  it('preserves nulls (no colour/grade/photo/video)', () => {
    expect(boulderToPrefill({ ...boulder, name: null, color: null, hold_color: null, community_grade: null, image_url: null, beta_video_url: null }))
      .toEqual({ color: null, hold_color: null, grade_value: null, image_url: null, beta_video_url: null, gym: 'Boulders Oslo' })
  })
})

describe('defaultVisibilityPublic', () => {
  it('defaults a brand-new problem to public', () => {
    // Logging in a gym is a social act by default — the point of the app is
    // that the beta reaches someone else.
    expect(defaultVisibilityPublic(undefined)).toBe(true)
  })
  it('keeps an already-published problem public', () => {
    expect(defaultVisibilityPublic({ gym_problem_id: 'gp1' })).toBe(true)
  })
  it('leaves an existing private problem private', () => {
    // The trap this function exists for: an unconditional `true` would show
    // Public when you open a private problem to fix a typo, and saving would
    // publish it to the gym without you ever asking.
    expect(defaultVisibilityPublic({ gym_problem_id: null })).toBe(false)
  })
})
