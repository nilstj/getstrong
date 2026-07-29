import { describe, it, expect } from 'vitest'
import { buildBetaRequests } from '../betaRequests'
import type { BoulderSummary } from '../../types'

function boulder(id: string): BoulderSummary {
  return {
    id, title: 'Shared boulder', gym: 'Boulders Oslo', color: 'Blue',
    hold_color: 'Red', community_grade: '6C', image_url: null,
    beta_video_url: null, set_at: '2026-07-01', helpWanted: true,
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
