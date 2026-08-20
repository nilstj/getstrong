import { describe, it, expect } from 'vitest'
import { boulderRows, sessionProjectSummary, groupRoster } from '../sessionGroups'
import type { GroupBoulder, MyEntry } from '../sessionGroups'

const boulder = (id: string, createdAt: string): GroupBoulder => ({
  id,
  gym_problem_id: null,
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
const entry = (boulderId: string | null, attempts: number, sent: boolean): MyEntry =>
  ({ id: 'e-' + boulderId, group_boulder_id: boulderId, attempts, sent })

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
