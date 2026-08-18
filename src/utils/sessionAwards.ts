import type { AwardTag } from '../types'
import { weeklyStreak } from './crewStreak'

export interface AwardVoteRow {
  kind: 'goat' | 'donkey'
  voter_id: string
  subject_id: string
}

export interface AwardTagRow {
  subject_id: string
  tag: AwardTag
}

export interface AwardHistoryRow {
  round_id: string
  round_date: string
  kind: 'goat' | 'donkey'
  subject_id: string
  votes: number
}

export interface AwardResult {
  winners: string[]
  counts: Record<string, number>
  topCount: number
}

/**
 * Tally one award for one round. A tie awards everyone tied — a split verdict —
 * rather than breaking it by timestamp, which would hand a real award to an
 * accident of ordering. Winners come back in first-vote-seen order so repeated
 * calls on the same input render identically.
 */
export function awardTally(votes: AwardVoteRow[], kind: 'goat' | 'donkey'): AwardResult {
  const counts: Record<string, number> = {}
  const order: string[] = []
  for (const v of votes) {
    if (v.kind !== kind) continue
    if (counts[v.subject_id] === undefined) { counts[v.subject_id] = 0; order.push(v.subject_id) }
    counts[v.subject_id] += 1
  }
  const topCount = order.reduce((m, id) => Math.max(m, counts[id]), 0)
  return { winners: order.filter(id => counts[id] === topCount), counts, topCount }
}

/** Props per climber, most-tagged first, ties broken alphabetically by tag. */
export function tagTally(rows: AwardTagRow[]): Record<string, { tag: AwardTag; count: number }[]> {
  const bySubject: Record<string, Record<string, number>> = {}
  for (const r of rows) {
    const tags = (bySubject[r.subject_id] ??= {})
    tags[r.tag] = (tags[r.tag] ?? 0) + 1
  }
  const out: Record<string, { tag: AwardTag; count: number }[]> = {}
  for (const [subject, tags] of Object.entries(bySubject)) {
    out[subject] = Object.entries(tags)
      .map(([tag, count]) => ({ tag: tag as AwardTag, count }))
      .sort((a, b) => (b.count - a.count) || a.tag.localeCompare(b.tag))
  }
  return out
}

/**
 * How many weeks in a row a climber has been the crew's donkey. Counted in
 * weeks of rounds, not weeks of attendance — a quiet week does not extend it.
 * A tied round counts for everyone tied, matching awardTally.
 */
export function donkeyStreak(rows: AwardHistoryRow[], userId: string, now: Date): number {
  const byRound = new Map<string, { date: string; votes: AwardVoteRow[] }>()
  for (const r of rows) {
    if (r.kind !== 'donkey') continue
    const entry = byRound.get(r.round_id) ?? { date: r.round_date, votes: [] }
    // awardTally counts rows, so expand the aggregated count back into rows.
    for (let i = 0; i < r.votes; i++) {
      entry.votes.push({ kind: 'donkey', voter_id: `${r.round_id}:${i}`, subject_id: r.subject_id })
    }
    byRound.set(r.round_id, entry)
  }
  // round_date is a bare 'YYYY-MM-DD'. `new Date(d)` inside weeklyStreak parses
  // that as UTC midnight, then buckets it in local time — in a negative-offset
  // timezone a Sunday round_date shifts to Saturday local and lands in the
  // previous calendar week, breaking a streak that should still be running.
  // Pinning to local midnight (as SessionAwardsCard already does) avoids that.
  const dates: string[] = []
  for (const { date, votes } of byRound.values()) {
    if (awardTally(votes, 'donkey').winners.includes(userId)) dates.push(`${date}T00:00:00`)
  }
  return weeklyStreak(dates, now)
}
