import { describe, it, expect } from 'vitest'
import { pointsForColor, buildGradeLeaderboard } from '../gradeLeaderboard'
import type { GymGrading } from '../../types'

const gradings: GymGrading[] = [
  { gym: 'G', color_name: 'Green', rank: 0, points: 1 },
  { gym: 'G', color_name: 'Blue', rank: 1, points: 3 },
  { gym: 'G', color_name: 'Black', rank: 2, points: 10 },
]
const profiles = [
  { id: 'u1', username: 'ana', avatar_url: null },
  { id: 'u2', username: 'bo', avatar_url: null },
]

describe('pointsForColor', () => {
  it('maps a colour name to its points, case-insensitively', () => {
    expect(pointsForColor(gradings, 'blue')).toBe(3)
  })
  it('returns 0 for a null or unknown colour', () => {
    expect(pointsForColor(gradings, null)).toBe(0)
    expect(pointsForColor(gradings, 'Pink')).toBe(0)
  })
})

describe('buildGradeLeaderboard', () => {
  it('sums points over sent problems and ranks desc', () => {
    const rows = [
      { user_id: 'u1', color: 'Black', sent: true },   // 10
      { user_id: 'u1', color: 'Green', sent: true },   // 1  -> u1 = 11
      { user_id: 'u2', color: 'Blue', sent: true },    // 3  -> u2 = 3
    ]
    const lb = buildGradeLeaderboard(rows, gradings, profiles)
    expect(lb.map(e => [e.user_id, e.points, e.rank])).toEqual([
      ['u1', 11, 1],
      ['u2', 3, 2],
    ])
  })

  it('ignores unsent problems and unknown/zero colours', () => {
    const rows = [
      { user_id: 'u1', color: 'Black', sent: false },  // unsent -> ignored
      { user_id: 'u1', color: 'Pink', sent: true },    // unknown -> 0
      { user_id: 'u2', color: 'Blue', sent: true },    // 3
    ]
    const lb = buildGradeLeaderboard(rows, gradings, profiles)
    expect(lb).toEqual([{ user_id: 'u2', points: 3, username: 'bo', avatar_url: null, rank: 1 }])
  })

  it('gives tied scores the same rank (competition ranking)', () => {
    const rows = [
      { user_id: 'u1', color: 'Blue', sent: true },    // 3
      { user_id: 'u2', color: 'Blue', sent: true },    // 3
    ]
    const lb = buildGradeLeaderboard(rows, gradings, profiles)
    expect(lb.map(e => e.rank)).toEqual([1, 1])
  })
})
