import { describe, it, expect } from 'vitest'
import { buildBetaRequests, betaRequestKey, visibleBetaRequests, pruneDismissals } from '../betaRequests'
import type { BetaRequest } from '../betaRequests'
import type { BoulderSummary } from '../../types'

function boulder(id: string): BoulderSummary {
  return {
    id, title: 'Shared boulder', gym: 'Boulders Oslo', color: 'Blue',
    hold_color: 'Red', community_grade: '6C', image_url: null,
    beta_video_url: null, set_at: '2026-07-01', helpWanted: true,
    hasVariation: false,
    expires_at: '2026-08-01', crewCount: 2, claimed: false, doneByMe: false,
  }
}

function row(gym_problem_id: string, user_id: string, created_at: string, note: string | null = null) {
  return { gym_problem_id, user_id, note, created_at }
}

const profiles = [
  { id: 'u1', username: 'ola' },
  { id: 'u2', username: 'kari' },
]

describe('buildBetaRequests', () => {
  it('attaches the asker name, note and boulder', () => {
    const b = boulder('gp1')
    const out = buildBetaRequests(
      [row('gp1', 'u1', '2026-07-20T10:00:00+00:00', 'cannot hold the crux')],
      [b], profiles, 'me',
    )
    expect(out).toEqual([{
      gymProblemId: 'gp1',
      askerId: 'u1',
      askerName: 'ola',
      note: 'cannot hold the crux',
      createdAt: '2026-07-20T10:00:00+00:00',
      boulder: b,
    }])
  })

  it('orders newest first', () => {
    const out = buildBetaRequests(
      [
        row('gp1', 'u1', '2026-07-18T10:00:00+00:00'),
        row('gp2', 'u2', '2026-07-20T10:00:00+00:00'),
      ],
      [boulder('gp1'), boulder('gp2')], profiles, 'me',
    )
    expect(out.map(r => r.gymProblemId)).toEqual(['gp2', 'gp1'])
  })

  it('hides the viewer own asks', () => {
    const out = buildBetaRequests(
      [
        row('gp1', 'me', '2026-07-20T10:00:00+00:00'),
        row('gp2', 'u1', '2026-07-19T10:00:00+00:00'),
      ],
      [boulder('gp1'), boulder('gp2')], profiles, 'me',
    )
    expect(out.map(r => r.askerId)).toEqual(['u1'])
  })

  it('keeps every ask when there is no viewer id', () => {
    const out = buildBetaRequests(
      [row('gp1', 'me', '2026-07-20T10:00:00+00:00')],
      [boulder('gp1')], profiles, undefined,
    )
    expect(out).toHaveLength(1)
  })

  it('drops a request whose boulder is not in the active list', () => {
    const out = buildBetaRequests(
      [
        row('gp1', 'u1', '2026-07-20T10:00:00+00:00'),
        row('gone', 'u2', '2026-07-19T10:00:00+00:00'),
      ],
      [boulder('gp1')], profiles, 'me',
    )
    expect(out.map(r => r.gymProblemId)).toEqual(['gp1'])
  })

  it('keeps two asks on the same boulder as two rows', () => {
    const out = buildBetaRequests(
      [
        row('gp1', 'u1', '2026-07-20T10:00:00+00:00'),
        row('gp1', 'u2', '2026-07-19T10:00:00+00:00'),
      ],
      [boulder('gp1')], profiles, 'me',
    )
    expect(out.map(r => r.askerId)).toEqual(['u1', 'u2'])
  })

  it('yields a null name when the asker has no profile', () => {
    const out = buildBetaRequests(
      [row('gp1', 'stranger', '2026-07-20T10:00:00+00:00')],
      [boulder('gp1')], profiles, 'me',
    )
    expect(out[0].askerName).toBeNull()
  })

  it('returns empty for no rows', () => {
    expect(buildBetaRequests([], [boulder('gp1')], profiles, 'me')).toEqual([])
  })

  it('returns empty when no boulders are active', () => {
    expect(buildBetaRequests(
      [row('gp1', 'u1', '2026-07-20T10:00:00+00:00')], [], profiles, 'me',
    )).toEqual([])
  })
})

describe('betaRequestKey', () => {
  it('is per ask, not per boulder -- two climbers stuck on the same one are two asks', () => {
    expect(betaRequestKey('b1', 'u1')).not.toBe(betaRequestKey('b1', 'u2'))
  })

  it('is stable for the same ask', () => {
    expect(betaRequestKey('b1', 'u1')).toBe(betaRequestKey('b1', 'u1'))
  })
})

describe('visibleBetaRequests', () => {
  const ask = (gymProblemId: string, askerId: string): BetaRequest => ({
    gymProblemId, askerId, askerName: askerId, note: null, createdAt: '2026-08-01T00:00:00+00:00',
    boulder: { id: gymProblemId } as BetaRequest['boulder'],
  })

  it('hides a dismissed ask', () => {
    const out = visibleBetaRequests([ask('b1', 'u1')], new Set([betaRequestKey('b1', 'u1')]))
    expect(out).toEqual([])
  })

  it('keeps another climber stuck on the same boulder', () => {
    const out = visibleBetaRequests(
      [ask('b1', 'u1'), ask('b1', 'u2')],
      new Set([betaRequestKey('b1', 'u1')]),
    )
    expect(out.map(r => r.askerId)).toEqual(['u2'])
  })

  it('keeps the same climber stuck on a different boulder', () => {
    const out = visibleBetaRequests(
      [ask('b1', 'u1'), ask('b2', 'u1')],
      new Set([betaRequestKey('b1', 'u1')]),
    )
    expect(out.map(r => r.gymProblemId)).toEqual(['b2'])
  })

  it('keeps everything when nothing is dismissed', () => {
    const rows = [ask('b1', 'u1'), ask('b2', 'u2')]
    expect(visibleBetaRequests(rows, new Set())).toEqual(rows)
  })
})

describe('pruneDismissals', () => {
  const now = new Date('2026-08-22T12:00:00Z')

  it('keeps a recent dismissal', () => {
    expect(pruneDismissals({ 'b1:u1': '2026-08-20T12:00:00Z' }, now))
      .toEqual({ 'b1:u1': '2026-08-20T12:00:00Z' })
  })

  it('drops one older than the window, so the store cannot grow forever', () => {
    expect(pruneDismissals({ 'b1:u1': '2026-01-01T12:00:00Z' }, now)).toEqual({})
  })

  it('drops an unparseable timestamp rather than keeping it forever', () => {
    expect(pruneDismissals({ 'b1:u1': 'not a date' }, now)).toEqual({})
    expect(pruneDismissals({ 'b1:u1': '' }, now)).toEqual({})
  })

  it('honours a custom window', () => {
    expect(pruneDismissals({ 'b1:u1': '2026-08-20T12:00:00Z' }, now, 1)).toEqual({})
  })

  it('does not mutate the input', () => {
    const input = { 'b1:u1': '2026-01-01T12:00:00Z' }
    pruneDismissals(input, now)
    expect(input).toEqual({ 'b1:u1': '2026-01-01T12:00:00Z' })
  })
})
