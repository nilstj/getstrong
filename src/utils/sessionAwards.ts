import type { AwardTag } from '../types'

export interface AwardVoteRow {
  /** Still a union: nothing writes 'donkey' any more, but rounds voted on
   *  before the donkey award was removed keep theirs, and awardTally has to
   *  know to skip them. */
  kind: 'goat' | 'donkey'
  voter_id: string
  subject_id: string
}

export interface AwardTagRow {
  subject_id: string
  tag: AwardTag
}

export interface AwardResult {
  winners: string[]
  counts: Record<string, number>
  topCount: number
}

/**
 * Tally the GOAT award for one round. A tie awards everyone tied — a split
 * verdict — rather than breaking it by timestamp, which would hand a real award
 * to an accident of ordering. Winners come back in first-vote-seen order so
 * repeated calls on the same input render identically.
 */
export function awardTally(votes: AwardVoteRow[]): AwardResult {
  const counts: Record<string, number> = {}
  const order: string[] = []
  for (const v of votes) {
    if (v.kind !== 'goat') continue
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

/** What the collapsed awards bar says. The component renders the icon and
 *  formats the deadline; this decides only which of the three it is. */
export type AwardsSummary =
  | { kind: 'verdict'; goat: string[] }
  | { kind: 'nudge' }
  | { kind: 'progress'; voted: number; participants: number }

/**
 * Whether the awards section starts collapsed on the session page.
 *
 * The section is tall enough expanded to push the session's Problems list off
 * the screen. Voting is the only state that earns that height, and only until
 * your own vote is in: a verdict fits on the collapsed bar's one line, and
 * someone who was not in the session has nothing to do here at all.
 */
export function awardsStartCollapsed(input: {
  unlocked: boolean
  amParticipant: boolean
  myVotesCast: number
}): boolean {
  if (input.unlocked) return true
  if (!input.amParticipant) return true
  return input.myVotesCast >= 1
}

/** The collapsed bar's content. Nudges only someone who can still act: there is
 *  a 24h clock on a round, so a missing vote is worth saying out loud. */
export function awardsSummary(input: {
  unlocked: boolean
  amParticipant: boolean
  myVotesCast: number
  voted: number
  participants: number
  goatWinners: string[]
}): AwardsSummary {
  if (input.unlocked) return { kind: 'verdict', goat: input.goatWinners }
  if (input.amParticipant && input.myVotesCast < 1) return { kind: 'nudge' }
  return { kind: 'progress', voted: input.voted, participants: input.participants }
}
