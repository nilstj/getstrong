import { describe, it, expect } from 'vitest'
import { awardTally, awardsUnlocked, tagTally, donkeyStreak } from '../sessionAwards'
import type { AwardVoteRow, AwardHistoryRow } from '../sessionAwards'

const vote = (kind: 'goat' | 'donkey', voter: string, subject: string): AwardVoteRow =>
  ({ kind, voter_id: voter, subject_id: subject })

describe('awardTally', () => {
  it('has no winner with no votes', () => {
    expect(awardTally([], 'goat')).toEqual({ winners: [], counts: {}, topCount: 0 })
  })

  it('counts only the requested award', () => {
    const votes = [vote('goat', 'a', 'ida'), vote('donkey', 'a', 'nils')]
    expect(awardTally(votes, 'goat')).toEqual({ winners: ['ida'], counts: { ida: 1 }, topCount: 1 })
  })

  it('picks the climber with the most votes', () => {
    const votes = [vote('goat', 'a', 'ida'), vote('goat', 'b', 'ida'), vote('goat', 'c', 'thea')]
    const r = awardTally(votes, 'goat')
    expect(r.winners).toEqual(['ida'])
    expect(r.topCount).toBe(2)
    expect(r.counts).toEqual({ ida: 2, thea: 1 })
  })

  it('awards everyone tied — a split verdict, never an arbitrary pick', () => {
    const votes = [vote('goat', 'a', 'ida'), vote('goat', 'b', 'thea')]
    expect(awardTally(votes, 'goat').winners.slice().sort()).toEqual(['ida', 'thea'])
  })

  it('orders tied winners by who was voted for first, which is the order they display in', () => {
    const votes = [vote('goat', 'a', 'thea'), vote('goat', 'b', 'ida')]
    expect(awardTally(votes, 'goat').winners).toEqual(['thea', 'ida'])
  })
})

describe('awardsUnlocked', () => {
  const now = new Date('2026-08-18T12:00:00Z')
  const later = '2026-08-19T06:00:00Z'
  const past = '2026-08-18T06:00:00Z'

  it('is locked while someone has not voted', () => {
    expect(awardsUnlocked({ participants: 5, voted: 4, closesAt: later, now })).toBe(false)
  })

  it('unlocks when every participant has voted', () => {
    expect(awardsUnlocked({ participants: 5, voted: 5, closesAt: later, now })).toBe(true)
  })

  it('unlocks on time even with votes missing', () => {
    expect(awardsUnlocked({ participants: 5, voted: 1, closesAt: past, now })).toBe(true)
  })

  it('stays locked with no participants, so an empty round never shows a verdict', () => {
    expect(awardsUnlocked({ participants: 0, voted: 0, closesAt: later, now })).toBe(false)
  })
})

describe('tagTally', () => {
  it('is empty for no rows', () => {
    expect(tagTally([])).toEqual({})
  })

  it('counts per climber and sorts by count descending', () => {
    const result = tagTally([
      { subject_id: 'ida', tag: 'flash' },
      { subject_id: 'ida', tag: 'best_beta' },
      { subject_id: 'ida', tag: 'best_beta' },
      { subject_id: 'nils', tag: 'grinder' },
    ])
    expect(result.ida).toEqual([
      { tag: 'best_beta', count: 2 },
      { tag: 'flash', count: 1 },
    ])
    expect(result.nils).toEqual([{ tag: 'grinder', count: 1 }])
  })

  it('breaks a count tie alphabetically by tag, so the order is stable', () => {
    const result = tagTally([
      { subject_id: 'ida', tag: 'silky_feet' },
      { subject_id: 'ida', tag: 'effort' },
    ])
    expect(result.ida.map(t => t.tag)).toEqual(['effort', 'silky_feet'])
  })
})

describe('donkeyStreak', () => {
  // A fixed "now" (a Tuesday) so week math is deterministic.
  const now = new Date('2026-08-18T12:00:00Z')
  const donkey = (round: string, date: string, subject: string, votes = 2): AwardHistoryRow =>
    ({ round_id: round, round_date: date, kind: 'donkey', subject_id: subject, votes })

  it('is 0 with no history', () => {
    expect(donkeyStreak([], 'nils', now)).toBe(0)
  })

  it('counts this week when the user is this week’s donkey', () => {
    expect(donkeyStreak([donkey('r1', '2026-08-17', 'nils')], 'nils', now)).toBe(1)
  })

  it('counts consecutive weeks', () => {
    const rows = [
      donkey('r1', '2026-08-17', 'nils'),
      donkey('r2', '2026-08-10', 'nils'),
      donkey('r3', '2026-08-03', 'nils'),
    ]
    expect(donkeyStreak(rows, 'nils', now)).toBe(3)
  })

  it('breaks the streak on a week someone else was donkey', () => {
    const rows = [
      donkey('r1', '2026-08-17', 'nils'),
      donkey('r2', '2026-08-10', 'ida'),
      donkey('r3', '2026-08-03', 'nils'),
    ]
    expect(donkeyStreak(rows, 'nils', now)).toBe(1)
  })

  it('ignores GOAT rows entirely', () => {
    const rows: AwardHistoryRow[] = [
      { round_id: 'r1', round_date: '2026-08-17', kind: 'goat', subject_id: 'nils', votes: 3 },
    ]
    expect(donkeyStreak(rows, 'nils', now)).toBe(0)
  })

  it('counts a tied donkey week for everyone tied', () => {
    const rows = [donkey('r1', '2026-08-17', 'nils', 1), donkey('r1', '2026-08-17', 'ida', 1)]
    expect(donkeyStreak(rows, 'nils', now)).toBe(1)
    expect(donkeyStreak(rows, 'ida', now)).toBe(1)
  })
})
