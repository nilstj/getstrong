import { describe, it, expect } from 'vitest'
import { mergeHomeFeed } from '../homeFeed'
import type { FriendSession } from '../../hooks/useFriendsFeed'
import type { FeedEventEnriched } from '../../hooks/useCrewFeed'

function session(sessionId: string, date: string): FriendSession {
  return {
    sessionId, userId: 'u1', gym: 'Boulders Oslo', date,
    problemCount: 3, sendCount: 2, challengeCount: 0, topGrade: '6C',
    photos: [], videoCount: 0, authorName: 'ola', authorAvatarUrl: null,
  }
}

function event(
  event_type: FeedEventEnriched['event_type'],
  event_at: string,
  gym_problem_id = 'gp1',
): FeedEventEnriched {
  return {
    event_type, event_at, actor_id: 'a1', gym_problem_id,
    boulder_name: null, boulder_color: 'blue', boulder_hold_color: 'Red',
    boulder_grade: '6C', boulder_image_url: null, gym: 'Boulders Oslo',
    beta_id: 'b1', beta_snippet: 'heel hook', beta_video_url: null,
    actorName: 'kari', actorAvatarUrl: null,
  }
}

describe('mergeHomeFeed', () => {
  it('orders both kinds newest first', () => {
    const merged = mergeHomeFeed(
      [session('s1', '2026-07-20T10:00:00Z'), session('s2', '2026-07-18T10:00:00Z')],
      [event('beta_added', '2026-07-19T10:00:00Z')],
    )
    expect(merged.map(i => i.at)).toEqual([
      '2026-07-20T10:00:00Z',
      '2026-07-19T10:00:00Z',
      '2026-07-18T10:00:00Z',
    ])
    expect(merged.map(i => i.kind)).toEqual(['session', 'beta', 'session'])
  })

  it('keeps only beta events', () => {
    const merged = mergeHomeFeed([], [
      event('beta_added', '2026-07-20T10:00:00Z'),
      event('send', '2026-07-19T10:00:00Z'),
      event('boulder_new', '2026-07-18T10:00:00Z'),
      event('beta_worked', '2026-07-17T10:00:00Z'),
    ])
    expect(merged).toHaveLength(2)
    expect(merged.map(i => i.kind === 'beta' && i.event.event_type)).toEqual([
      'beta_added', 'beta_worked',
    ])
  })

  it('carries the session through untouched', () => {
    const s = session('s1', '2026-07-20T10:00:00Z')
    const [item] = mergeHomeFeed([s], [])
    expect(item).toEqual({ kind: 'session', at: '2026-07-20T10:00:00Z', session: s })
  })

  it('carries the event through untouched', () => {
    const e = event('beta_added', '2026-07-20T10:00:00Z')
    const [item] = mergeHomeFeed([], [e])
    expect(item).toEqual({ kind: 'beta', at: '2026-07-20T10:00:00Z', event: e })
  })

  it('works with either side empty', () => {
    expect(mergeHomeFeed([session('s1', '2026-07-20T10:00:00Z')], [])).toHaveLength(1)
    expect(mergeHomeFeed([], [event('beta_added', '2026-07-20T10:00:00Z')])).toHaveLength(1)
  })

  it('returns empty for no input', () => {
    expect(mergeHomeFeed([], [])).toEqual([])
  })

  it('puts the session first on an identical timestamp, deterministically', () => {
    const at = '2026-07-20T10:00:00Z'
    const once = mergeHomeFeed([session('s1', at)], [event('beta_added', at)])
    const twice = mergeHomeFeed([session('s1', at)], [event('beta_added', at)])
    expect(once.map(i => i.kind)).toEqual(['session', 'beta'])
    expect(twice.map(i => i.kind)).toEqual(once.map(i => i.kind))
  })

  it('drops a beta event with no timestamp rather than sorting it to the top', () => {
    const merged = mergeHomeFeed([session('s1', '2026-07-20T10:00:00Z')], [
      { ...event('beta_added', ''), event_at: '' },
    ])
    expect(merged.map(i => i.kind)).toEqual(['session'])
  })
})
