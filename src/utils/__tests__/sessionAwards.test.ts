import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { awardTally, tagTally, donkeyStreak } from '../sessionAwards'
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

  // The rest of this file's round_dates all land on a Monday-Saturday, which is
  // exactly why the bug below was invisible: `new Date(round_date)` parses a
  // bare 'YYYY-MM-DD' as UTC midnight, and shifting a Mon-Sat date backward by
  // a few hours into a negative-offset timezone still lands on a day within
  // that same Sun-Sat calendar week. A Sunday date is the one day where that
  // backward shift crosses into the *previous* week (Sunday → Saturday), since
  // Sunday is the first day of the week date-fns buckets by.
  describe('in a negative-offset timezone', () => {
    beforeAll(() => { vi.stubEnv('TZ', 'America/Los_Angeles') })
    afterAll(() => { vi.unstubAllEnvs() })

    it('keeps a streak running through a Sunday-dated round', () => {
      // Un-normalised, '2026-08-16' (a Sunday, this week) parses as UTC
      // midnight and reads back as Saturday 2026-08-15 in America/Los_Angeles
      // — the last day of *last* week, not this week. That collapses onto the
      // same week bucket as the '2026-08-11' (Tuesday, last week) round below,
      // so the two donkey weeks are miscounted as one instead of two.
      const rows = [
        donkey('r1', '2026-08-11', 'nils'), // Tuesday, last week
        donkey('r2', '2026-08-16', 'nils'), // Sunday, this week
      ]
      expect(donkeyStreak(rows, 'nils', now)).toBe(2)
    })
  })
})
