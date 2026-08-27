import { describe, it, expect } from 'vitest'
import { boulderTitle, countMembersByBoulder, boulderColorGradeLabel } from '../boulders'

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

describe('boulderColorGradeLabel', () => {
  it('reads "the <colour> <grade>"', () => {
    expect(boulderColorGradeLabel({ color: 'blue', community_grade: '6C' })).toBe('the blue 6C')
  })
  it('lowercases the colour but leaves the grade as stored', () => {
    // Grades are written "6C" and "V4"; lowercasing them would be wrong.
    expect(boulderColorGradeLabel({ color: 'Blue', community_grade: '6C' })).toBe('the blue 6C')
  })
  it('drops the missing half when only a colour is known', () => {
    expect(boulderColorGradeLabel({ color: 'Blue', community_grade: null })).toBe('the blue')
  })
  it('drops the missing half when only a grade is known', () => {
    expect(boulderColorGradeLabel({ color: null, community_grade: '6C' })).toBe('the 6C')
  })
  it('falls back to "a boulder" when neither is known', () => {
    // Not to the boulder's title: names were removed from the app, so a title
    // is a wall angle and would read "the overhang".
    expect(boulderColorGradeLabel({ color: null, community_grade: null })).toBe('a boulder')
  })
  it('treats empty strings as missing', () => {
    expect(boulderColorGradeLabel({ color: '', community_grade: '' })).toBe('a boulder')
  })
})
