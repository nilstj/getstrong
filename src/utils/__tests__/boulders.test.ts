import { describe, it, expect } from 'vitest'
import { boulderTitle, countMembersByBoulder } from '../boulders'

describe('boulderTitle', () => {
  it('prefers the name', () => {
    expect(boulderTitle({ name: 'The Prow', color: 'Blue', wall_angle: 'overhang' })).toBe('The Prow')
  })
  it('falls back to color + wall_angle', () => {
    expect(boulderTitle({ name: null, color: 'Blue', wall_angle: 'overhang' })).toBe('Blue overhang')
  })
  it('trims when only one of color/angle is present', () => {
    expect(boulderTitle({ name: null, color: 'Blue', wall_angle: null })).toBe('Blue')
  })
  it('falls back to a default when nothing is set', () => {
    expect(boulderTitle({ name: null, color: null, wall_angle: null })).toBe('Shared boulder')
  })
})

describe('countMembersByBoulder', () => {
  it('counts distinct users per boulder, ignoring null boulder ids', () => {
    const counts = countMembersByBoulder([
      { gym_problem_id: 'x', user_id: 'a' },
      { gym_problem_id: 'x', user_id: 'a' }, // same user, same boulder → still 1
      { gym_problem_id: 'x', user_id: 'b' },
      { gym_problem_id: 'y', user_id: 'a' },
      { gym_problem_id: null, user_id: 'c' }, // unclaimed → ignored
    ])
    expect(counts).toEqual({ x: 2, y: 1 })
  })
  it('returns empty for no rows', () => {
    expect(countMembersByBoulder([])).toEqual({})
  })
})
