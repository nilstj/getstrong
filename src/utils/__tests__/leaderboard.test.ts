import { describe, it, expect } from 'vitest'
import { cycleMonth, buildLeaderboard, shiftMonth, monthBounds, topEntries } from '../leaderboard'
import type { LeaderboardEntry } from '../../types'

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

describe('shiftMonth', () => {
  it('steps back inside a year', () => {
    expect(shiftMonth('2026-07', -1)).toBe('2026-06')
  })

  it('steps back across a year boundary', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('steps forward across a year boundary', () => {
    expect(shiftMonth('2025-12', 1)).toBe('2026-01')
  })

  it('handles multi-month jumps', () => {
    expect(shiftMonth('2026-03', -5)).toBe('2025-10')
  })

  it('is a no-op for delta 0', () => {
    expect(shiftMonth('2026-03', 0)).toBe('2026-03')
  })
})

describe('monthBounds', () => {
  it('returns half-open UTC bounds', () => {
    expect(monthBounds('2026-07')).toEqual({
      start: '2026-07-01T00:00:00.000Z',
      end: '2026-08-01T00:00:00.000Z',
    })
  })

  it('rolls the end into the next year for December', () => {
    expect(monthBounds('2026-12')).toEqual({
      start: '2026-12-01T00:00:00.000Z',
      end: '2027-01-01T00:00:00.000Z',
    })
  })
})

describe('topEntries', () => {
  const entry = (rank: number, points: number): LeaderboardEntry => ({
    user_id: `u${rank}-${points}`,
    username: `u${rank}-${points}`,
    avatar_url: null,
    points,
    rank,
  })

  it('keeps entries up to the limit and drops the rest', () => {
    const board = [entry(1, 30), entry(2, 20), entry(3, 10)]
    expect(topEntries(board, 2).map(e => e.rank)).toEqual([1, 2])
  })

  it('keeps every member of a tie straddling the limit', () => {
    // ranks 1..9 distinct, then three climbers tied at rank 10: all three show,
    // so a limit of 10 renders 12 rows rather than cutting a tied climber.
    const board = [
      ...Array.from({ length: 9 }, (_, i) => entry(i + 1, 100 - i)),
      entry(10, 5), entry(10, 5), entry(10, 5),
    ]
    const shown = topEntries(board, 10)
    expect(shown).toHaveLength(12)
    expect(shown.filter(e => e.rank === 10)).toHaveLength(3)
  })

  it('drops a tie that sits entirely past the limit', () => {
    const board = [entry(1, 30), entry(2, 20), entry(2, 20), entry(4, 10)]
    expect(topEntries(board, 2).map(e => e.points)).toEqual([30, 20, 20])
  })

  it('returns everything when the board is shorter than the limit', () => {
    const board = [entry(1, 30), entry(2, 20)]
    expect(topEntries(board, 10)).toEqual(board)
  })

  it('returns empty for an empty board', () => {
    expect(topEntries([], 10)).toEqual([])
  })
})
