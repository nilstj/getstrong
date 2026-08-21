import { describe, it, expect } from 'vitest'
import {
  boulderRows, sessionProjectSummary, groupRoster, companionsByBoulder, companionLine,
  boulderSectionState,
} from '../sessionGroups'
import type { GroupBoulder, MyEntry, CompanionEntry } from '../sessionGroups'

const boulder = (id: string, createdAt: string, gymProblemId: string | null = null): GroupBoulder => ({
  id,
  gym_problem_id: gymProblemId,
  grade_system: 'font',
  grade_value: '6A',
  grade_value_font: '6A',
  grade_value_vscale: null,
  color: null,
  hold_color: 'blue',
  image_url: null,
  beta_video_url: null,
  created_at: createdAt,
})
const entry = (boulderId: string | null, attempts: number, sent: boolean, gymProblemId: string | null = null): MyEntry =>
  ({ id: 'e-' + boulderId, group_boulder_id: boulderId, gym_problem_id: gymProblemId, attempts, sent })
const handLoggedEntry = (id: string, attempts: number, sent: boolean, gymProblemId: string): MyEntry =>
  ({ id, group_boulder_id: null, gym_problem_id: gymProblemId, attempts, sent })

describe('boulderRows', () => {
  it('is empty when the list is empty', () => {
    expect(boulderRows([], [])).toEqual([])
  })

  it('marks a boulder with no entry of mine as not logged', () => {
    const rows = boulderRows([boulder('b1', '2026-08-18T18:00:00+00:00')], [])
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('none')
    expect(rows[0].entryId).toBeNull()
    expect(rows[0].attempts).toBe(0)
  })

  it('marks an unsent entry as a project and keeps its try count', () => {
    const rows = boulderRows([boulder('b1', '2026-08-18T18:00:00+00:00')], [entry('b1', 3, false)])
    expect(rows[0].status).toBe('project')
    expect(rows[0].attempts).toBe(3)
    expect(rows[0].entryId).toBe('e-b1')
  })

  it('marks a sent entry as sent', () => {
    const rows = boulderRows([boulder('b1', '2026-08-18T18:00:00+00:00')], [entry('b1', 4, true)])
    expect(rows[0].status).toBe('sent')
  })

  it('counts a zero-try project as a project, not as untouched', () => {
    const rows = boulderRows([boulder('b1', '2026-08-18T18:00:00+00:00')], [entry('b1', 0, false)])
    expect(rows[0].status).toBe('project')
    expect(rows[0].attempts).toBe(0)
  })

  it('ignores entries that belong to another boulder', () => {
    const rows = boulderRows([boulder('b1', '2026-08-18T18:00:00+00:00')], [entry('b2', 5, true)])
    expect(rows[0].status).toBe('none')
  })

  it('ignores my problems that are not on the list at all', () => {
    const rows = boulderRows([boulder('b1', '2026-08-18T18:00:00+00:00')], [entry(null, 2, true)])
    expect(rows[0].status).toBe('none')
  })

  it('orders rows oldest-first by the list entry, not by my entries', () => {
    const rows = boulderRows(
      [boulder('b2', '2026-08-18T19:00:00+00:00'), boulder('b1', '2026-08-18T18:00:00+00:00')],
      [entry('b2', 1, false)],
    )
    expect(rows.map(r => r.boulder.id)).toEqual(['b1', 'b2'])
  })

  it('matches a hand-logged entry to a list boulder by gym_problem_id when it has no group_boulder_id', () => {
    const rows = boulderRows(
      [boulder('b1', '2026-08-18T18:00:00+00:00', 'gp1')],
      [handLoggedEntry('hand-1', 2, false, 'gp1')],
    )
    expect(rows[0].status).toBe('project')
    expect(rows[0].entryId).toBe('hand-1')
    expect(rows[0].attempts).toBe(2)
  })

  it('leaves a boulder unmatched when no entry has a matching gym_problem_id', () => {
    const rows = boulderRows(
      [boulder('b1', '2026-08-18T18:00:00+00:00', 'gp1')],
      [handLoggedEntry('hand-1', 2, false, 'gp2')],
    )
    expect(rows[0].status).toBe('none')
    expect(rows[0].entryId).toBeNull()
  })

  it('lets a group_boulder_id match win, so the entry cannot be stolen by another boulder sharing its gym_problem_id', () => {
    const rows = boulderRows(
      [
        // earlier in list order, shares gp1 but has no real link to this entry
        boulder('b2', '2026-08-18T18:00:00+00:00', 'gp1'),
        // later in list order, and the boulder the entry is actually linked to
        boulder('b1', '2026-08-18T19:00:00+00:00', 'gp1'),
      ],
      [entry('b1', 4, true, 'gp1')],
    )
    const byId = new Map(rows.map(r => [r.boulder.id, r]))
    expect(byId.get('b1')!.status).toBe('sent')
    expect(byId.get('b1')!.entryId).toBe('e-b1')
    expect(byId.get('b2')!.status).toBe('none')
    expect(byId.get('b2')!.entryId).toBeNull()
  })

  it('does not let two boulders sharing a gym_problem_id both claim the same hand-logged entry', () => {
    const rows = boulderRows(
      [
        boulder('b1', '2026-08-18T18:00:00+00:00', 'gp1'),
        boulder('b2', '2026-08-18T19:00:00+00:00', 'gp1'),
      ],
      [handLoggedEntry('hand-1', 1, false, 'gp1')],
    )
    expect(rows.filter(r => r.entryId === 'hand-1')).toHaveLength(1)
    expect(rows[0].entryId).toBe('hand-1')
    expect(rows[1].entryId).toBeNull()
    expect(rows[1].status).toBe('none')
  })
})

describe('sessionProjectSummary', () => {
  const rows = (...statuses: ('none' | 'project' | 'sent')[]) =>
    statuses.map((status, i) => ({
      boulder: boulder('b' + i, '2026-08-18T18:0' + i + ':00+00:00'),
      entryId: status === 'none' ? null : 'e' + i,
      status,
      attempts: status === 'none' ? 0 : 1,
    }))

  it('is all zeroes for an empty list', () => {
    expect(sessionProjectSummary([])).toEqual({ projects: 0, sent: 0, untouched: 0, label: 'No boulders yet' })
  })

  it('counts each status', () => {
    const r = sessionProjectSummary(rows('project', 'project', 'sent', 'none'))
    expect(r.projects).toBe(2)
    expect(r.sent).toBe(1)
    expect(r.untouched).toBe(1)
  })

  it('omits a zero group from the label', () => {
    expect(sessionProjectSummary(rows('sent', 'sent')).label).toBe('2 sent')
  })

  it('joins the groups it does have', () => {
    expect(sessionProjectSummary(rows('project', 'sent', 'none')).label).toBe('1 project · 1 sent · 1 untouched')
  })

  it('singularises one project', () => {
    expect(sessionProjectSummary(rows('project')).label).toBe('1 project')
  })

  it('pluralises more than one project', () => {
    expect(sessionProjectSummary(rows('project', 'project')).label).toBe('2 projects')
  })
})

describe('groupRoster', () => {
  it('is empty with nobody', () => {
    expect(groupRoster([], [])).toEqual([])
  })

  it('puts accepted members before pending invitees', () => {
    const r = groupRoster([{ user_id: 'a' }, { user_id: 'b' }], [{ invited_user: 'c' }])
    expect(r).toEqual([
      { userId: 'a', pending: false },
      { userId: 'b', pending: false },
      { userId: 'c', pending: true },
    ])
  })

  it('drops an invite for someone who already accepted, so nobody appears twice', () => {
    const r = groupRoster([{ user_id: 'a' }], [{ invited_user: 'a' }])
    expect(r).toEqual([{ userId: 'a', pending: false }])
  })
})

describe('companionsByBoulder', () => {
  const row = (userId: string, boulderId: string | null, sent: boolean): CompanionEntry => ({
    user_id: userId,
    group_boulder_id: boulderId,
    sent,
  })

  it('is empty for an empty entry list', () => {
    expect(companionsByBoulder([], 'me')).toEqual({})
  })

  it('skips an entry with no group_boulder_id, since it is not on the shared list', () => {
    // A wrong implementation might key by `String(group_boulder_id)`, which
    // would file this under the literal key "null" instead of dropping it.
    const result = companionsByBoulder([row('a', null, true)], 'me')
    expect(result).toEqual({})
  })

  it('skips my own entry, since my status already has its own chip', () => {
    // Without the meId check this would (wrongly) put 'me' in sentIds.
    const result = companionsByBoulder([row('me', 'b1', true)], 'me')
    expect(result).toEqual({})
  })

  it('reports another climber alongside my own entry for the same boulder, proving only mine is dropped', () => {
    const result = companionsByBoulder([row('me', 'b1', true), row('ida', 'b1', false)], 'me')
    expect(result).toEqual({ b1: { sentIds: [], projectingIds: ['ida'] } })
  })

  it('buckets a sent row under sentIds and an unsent row under projectingIds', () => {
    const result = companionsByBoulder([row('ida', 'b1', true), row('sondre', 'b1', false)], 'me')
    expect(result).toEqual({ b1: { sentIds: ['ida'], projectingIds: ['sondre'] } })
  })

  it('dedupes repeated identical rows for the same user and boulder', () => {
    // A naive push-on-every-row implementation would return ['ida', 'ida'].
    const result = companionsByBoulder([row('ida', 'b1', false), row('ida', 'b1', false)], 'me')
    expect(result).toEqual({ b1: { sentIds: [], projectingIds: ['ida'] } })
  })

  it('lets a sent row win over an earlier unsent row for the same user and boulder', () => {
    // An implementation that keeps only the first-seen status per user (a plain
    // "seen" set with no promotion) would leave ida stuck in projectingIds here.
    const result = companionsByBoulder([row('ida', 'b1', false), row('ida', 'b1', true)], 'me')
    expect(result).toEqual({ b1: { sentIds: ['ida'], projectingIds: [] } })
  })

  it('lets sent win even when the unsent row for that user comes after the sent one', () => {
    // An implementation that just overwrites the user's bucket on each pass
    // (last-row-wins) would wrongly move ida back to projectingIds here.
    const result = companionsByBoulder([row('ida', 'b1', true), row('ida', 'b1', false)], 'me')
    expect(result).toEqual({ b1: { sentIds: ['ida'], projectingIds: [] } })
  })

  it('never places the same user in both buckets for one boulder', () => {
    // A push-without-dedupe-across-buckets bug would leave ida in both arrays
    // once a sent row is promoted without removing her from projectingIds.
    const result = companionsByBoulder([row('ida', 'b1', false), row('ida', 'b1', true)], 'me')
    expect(result.b1.sentIds).toContain('ida')
    expect(result.b1.projectingIds).not.toContain('ida')
  })

  it('keeps boulders separate, so a status on one does not leak onto another', () => {
    const result = companionsByBoulder([row('ida', 'b1', true), row('ida', 'b2', false)], 'me')
    expect(result).toEqual({
      b1: { sentIds: ['ida'], projectingIds: [] },
      b2: { sentIds: [], projectingIds: ['ida'] },
    })
  })

  it('omits a boulder from the record entirely when it has no other climbers, rather than an empty-arrays entry', () => {
    // Guards against `result[boulderId] = { sentIds: [], projectingIds: [] }`
    // being created eagerly for every boulder seen, including boulders whose
    // only entries are mine.
    const result = companionsByBoulder([row('me', 'b1', true)], 'me')
    expect(Object.prototype.hasOwnProperty.call(result, 'b1')).toBe(false)
  })

  it('orders each bucket by first appearance in entries, not alphabetically or by insertion into the other bucket', () => {
    // A wrong implementation might sort the arrays, or push new users to the
    // front. Using 'b' before 'a' here catches either mistake.
    const result = companionsByBoulder(
      [row('sondre', 'b1', false), row('marius', 'b1', true), row('ida', 'b1', false), row('thea', 'b1', true)],
      'me',
    )
    expect(result.b1).toEqual({ sentIds: ['marius', 'thea'], projectingIds: ['sondre', 'ida'] })
  })
})

describe('companionLine', () => {
  it('is null when both lists are empty, so the caller renders nothing', () => {
    expect(companionLine([], [])).toBeNull()
  })

  it('renders a single sent name with no separator', () => {
    expect(companionLine(['Ida'], [])).toBe('Ida sent it')
  })

  it('joins two sent names with "and"', () => {
    // A join-with-comma-only implementation would produce "Ida, Marius sent it".
    expect(companionLine(['Ida', 'Marius'], [])).toBe('Ida and Marius sent it')
  })

  it('joins three or more sent names with commas and a final "and"', () => {
    // Catches an implementation that uses "and" between every pair instead of
    // only before the last name.
    expect(companionLine(['Ida', 'Marius', 'Thea'], [])).toBe('Ida, Marius and Thea sent it')
  })

  it('renders a projecting-only clause without "sent it"', () => {
    expect(companionLine([], ['Sondre'])).toBe('Sondre projecting')
  })

  it('joins multiple projecting names the same way as sent names', () => {
    expect(companionLine([], ['Ida', 'Marius'])).toBe('Ida and Marius projecting')
  })

  it('puts the sent clause first and joins with a space-padded middle dot when both are present', () => {
    // Catches both a wrong join order (projecting first) and a wrong
    // separator (plain "." or no spaces).
    expect(companionLine(['Ida'], ['Sondre'])).toBe('Ida sent it · Sondre projecting')
  })

  it('joins both clauses with the full multi-name form on each side', () => {
    expect(companionLine(['Ida', 'Marius'], ['Sondre', 'Thea'])).toBe('Ida and Marius sent it · Sondre and Thea projecting')
  })
})

describe('boulderSectionState', () => {
  it('is "list" before the group row has loaded, even for someone who would otherwise get "add"', () => {
    // The dangerous wrong implementation here ignores groupLoaded and decides
    // from isCreator/hasMarkedAny alone -- that would return 'add' for this
    // input (not creator, nothing marked) and flash the prompt while
    // created_by is still unknown. Only checking groupLoaded first catches it.
    const result = boulderSectionState({ groupLoaded: false, isCreator: false, hasMarkedAny: false })
    expect(result).toBe('list')
  })

  it('is "list" for the creator, who never gets the add prompt', () => {
    // A wrong implementation that decides purely from hasMarkedAny (skipping
    // the isCreator check entirely) would return 'add' here, since the
    // creator's back-filled entries are exactly what hasMarkedAny is false
    // for in this input.
    const result = boulderSectionState({ groupLoaded: true, isCreator: true, hasMarkedAny: false })
    expect(result).toBe('list')
  })

  it('is "add" for a joiner who has loaded the group and marked nothing yet', () => {
    // Catches an implementation that always returns 'list' (e.g. a stub that
    // hasn't implemented the rule at all, or one that inverted the isCreator
    // check).
    const result = boulderSectionState({ groupLoaded: true, isCreator: false, hasMarkedAny: false })
    expect(result).toBe('add')
  })

  it('is "list" once that joiner has marked at least one boulder', () => {
    // Catches an implementation that never reads hasMarkedAny and would keep
    // returning 'add' forever for a non-creator.
    const result = boulderSectionState({ groupLoaded: true, isCreator: false, hasMarkedAny: true })
    expect(result).toBe('list')
  })
})
