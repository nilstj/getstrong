import { describe, it, expect } from 'vitest'
import {
  boulderTitle, boulderColorGradeLabel,
  latestStripBoulders, LATEST_STRIP_LIMIT,
} from '../boulders'

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

describe('latestStripBoulders', () => {
  const b = (id: string, set_at: string, image_url: string | null = 'http://img/x.jpg') =>
    ({ id, set_at, image_url })

  it('merges the lists newest-set first', () => {
    const out = latestStripBoulders(
      [b('mine', '2026-08-02')],
      [b('older', '2026-08-01'), b('newest', '2026-08-03')],
    )
    expect(out.map(x => x.id)).toEqual(['newest', 'mine', 'older'])
  })

  it('drops boulders with no photo', () => {
    const out = latestStripBoulders([b('with', '2026-08-02'), b('without', '2026-08-03', null)])
    expect(out.map(x => x.id)).toEqual(['with'])
  })

  it('treats an empty image_url as no photo', () => {
    expect(latestStripBoulders([b('blank', '2026-08-01', '')])).toEqual([])
  })

  it('caps the strip', () => {
    const many = Array.from({ length: LATEST_STRIP_LIMIT + 5 }, (_, i) =>
      b(`b${i}`, `2026-08-${String(i + 1).padStart(2, '0')}`))
    expect(latestStripBoulders(many)).toHaveLength(LATEST_STRIP_LIMIT)
  })

  it('does not mutate the caller\'s lists', () => {
    const list = [b('a', '2026-08-01'), b('b', '2026-08-03')]
    latestStripBoulders(list)
    expect(list.map(x => x.id)).toEqual(['a', 'b'])
  })
})
