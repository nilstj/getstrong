import { describe, it, expect } from 'vitest'
import { cycleMonth, buildLeaderboard } from '../leaderboard'

describe('cycleMonth', () => {
  it('formats a date as UTC YYYY-MM', () => {
    expect(cycleMonth(new Date('2026-06-20T10:00:00Z'))).toBe('2026-06')
    expect(cycleMonth(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01')
  })
})

describe('buildLeaderboard', () => {
  const profiles = [
    { id: 'a', username: 'Ann', avatar_url: 'ax' },
    { id: 'b', username: 'Bo', avatar_url: null },
    { id: 'c', username: 'Cy', avatar_url: null },
  ]

  it('sums points per user, sorts descending, joins profiles', () => {
    const board = buildLeaderboard(
      [
        { user_id: 'a', points: 10 },
        { user_id: 'a', points: 5 },
        { user_id: 'b', points: 30 },
      ],
      profiles,
    )
    expect(board).toEqual([
      { user_id: 'b', username: 'Bo', avatar_url: null, points: 30, rank: 1 },
      { user_id: 'a', username: 'Ann', avatar_url: 'ax', points: 15, rank: 2 },
    ])
  })

  it('assigns competition ranks (ties share, next skips)', () => {
    const board = buildLeaderboard(
      [
        { user_id: 'a', points: 20 },
        { user_id: 'b', points: 20 },
        { user_id: 'c', points: 5 },
      ],
      profiles,
    )
    expect(board.map(e => [e.user_id, e.rank])).toEqual([
      ['a', 1], ['b', 1], ['c', 3],
    ])
  })

  it('handles a three-way tie (all share rank 1)', () => {
    const board = buildLeaderboard(
      [
        { user_id: 'a', points: 9 },
        { user_id: 'b', points: 9 },
        { user_id: 'c', points: 9 },
      ],
      profiles,
    )
    expect(board.map(e => e.rank)).toEqual([1, 1, 1])
  })

  it('returns null profile fields when a user has no profile', () => {
    const board = buildLeaderboard([{ user_id: 'z', points: 7 }], profiles)
    expect(board).toEqual([{ user_id: 'z', username: null, avatar_url: null, points: 7, rank: 1 }])
  })

  it('returns empty for no rows', () => {
    expect(buildLeaderboard([], profiles)).toEqual([])
  })
})
