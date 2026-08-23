import { describe, it, expect } from 'vitest'
import { awardTally, tagTally, awardsStartCollapsed, awardsSummary } from '../sessionAwards'
import type { AwardVoteRow } from '../sessionAwards'

const vote = (kind: 'goat' | 'donkey', voter: string, subject: string): AwardVoteRow =>
  ({ kind, voter_id: voter, subject_id: subject })

describe('awardTally', () => {
  it('has no winner with no votes', () => {
    expect(awardTally([])).toEqual({ winners: [], counts: {}, topCount: 0 })
  })

  // The donkey award is gone, but rounds voted on before it went still hold
  // 'donkey' rows -- counting them would credit a GOAT vote nobody cast.
  it('ignores the retired donkey rows older rounds still hold', () => {
    const votes = [vote('goat', 'a', 'ida'), vote('donkey', 'a', 'nils')]
    expect(awardTally(votes)).toEqual({ winners: ['ida'], counts: { ida: 1 }, topCount: 1 })
  })

  it('picks the climber with the most votes', () => {
    const votes = [vote('goat', 'a', 'ida'), vote('goat', 'b', 'ida'), vote('goat', 'c', 'thea')]
    const r = awardTally(votes)
    expect(r.winners).toEqual(['ida'])
    expect(r.topCount).toBe(2)
    expect(r.counts).toEqual({ ida: 2, thea: 1 })
  })

  it('awards everyone tied — a split verdict, never an arbitrary pick', () => {
    const votes = [vote('goat', 'a', 'ida'), vote('goat', 'b', 'thea')]
    expect(awardTally(votes).winners.slice().sort()).toEqual(['ida', 'thea'])
  })

  it('orders tied winners by who was voted for first, which is the order they display in', () => {
    const votes = [vote('goat', 'a', 'thea'), vote('goat', 'b', 'ida')]
    expect(awardTally(votes).winners).toEqual(['thea', 'ida'])
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

describe('awardsStartCollapsed', () => {
  // The voting state is the only one that earns the page's whole height, and
  // only until you have actually voted -- everything else collapses to a line.
  it('expands while your vote is still missing', () => {
    expect(awardsStartCollapsed({ unlocked: false, amParticipant: true, myVotesCast: 0 })).toBe(false)
  })

  it('collapses once your vote is in', () => {
    expect(awardsStartCollapsed({ unlocked: false, amParticipant: true, myVotesCast: 1 })).toBe(true)
  })

  // An older round can hold a second, retired donkey vote of yours.
  it('collapses on an older round that also holds a donkey vote', () => {
    expect(awardsStartCollapsed({ unlocked: false, amParticipant: true, myVotesCast: 2 })).toBe(true)
  })

  it('collapses for a non-participant, who has nothing to do here', () => {
    expect(awardsStartCollapsed({ unlocked: false, amParticipant: false, myVotesCast: 0 })).toBe(true)
  })

  it('collapses once unlocked, because the verdict fits on the one line', () => {
    expect(awardsStartCollapsed({ unlocked: true, amParticipant: true, myVotesCast: 0 })).toBe(true)
    expect(awardsStartCollapsed({ unlocked: true, amParticipant: true, myVotesCast: 1 })).toBe(true)
  })
})

describe('awardsSummary', () => {
  const base = {
    unlocked: false, amParticipant: true, myVotesCast: 1,
    voted: 2, participants: 3, goatWinners: [],
  }

  it('nudges you while your vote is missing, because there is a 24h clock', () => {
    expect(awardsSummary({ ...base, myVotesCast: 0 })).toEqual({ kind: 'nudge' })
  })

  it('shows progress once you have voted', () => {
    expect(awardsSummary(base)).toEqual({ kind: 'progress', voted: 2, participants: 3 })
  })

  it('never nudges someone who cannot vote', () => {
    expect(awardsSummary({ ...base, amParticipant: false, myVotesCast: 0 }))
      .toEqual({ kind: 'progress', voted: 2, participants: 3 })
  })

  it('is the verdict once unlocked, so the payoff needs no expanding', () => {
    expect(awardsSummary({ ...base, unlocked: true, goatWinners: ['Nils'] }))
      .toEqual({ kind: 'verdict', goat: ['Nils'] })
  })

  it('carries a split verdict through as both names', () => {
    expect(awardsSummary({ ...base, unlocked: true, goatWinners: ['Nils', 'Ida'] }))
      .toEqual({ kind: 'verdict', goat: ['Nils', 'Ida'] })
  })

  it('is still a verdict when nobody voted, so the bar does not claim a winner', () => {
    expect(awardsSummary({ ...base, unlocked: true, voted: 0 }))
      .toEqual({ kind: 'verdict', goat: [] })
  })
})
