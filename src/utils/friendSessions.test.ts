import { describe, it, expect } from 'vitest'
import { summarizeFriendSessions, type FriendProblemRow } from './friendSessions'

const row = (over: Partial<FriendProblemRow>): FriendProblemRow => ({
  user_id: 'u1',
  session_id: 's1',
  gym: 'Klatreverket',
  grade_value: '6A',
  grade_value_font: '6A',
  sent: false,
  image_url: null,
  created_at: '2026-01-01T10:00:00Z',
  ...over,
})

describe('summarizeFriendSessions', () => {
  it('groups problems by session and counts sends', () => {
    const out = summarizeFriendSessions([
      row({ session_id: 's1', sent: true }),
      row({ session_id: 's1', sent: false }),
      row({ session_id: 's2', sent: true }),
    ])
    const s1 = out.find(s => s.sessionId === 's1')!
    expect(s1.problemCount).toBe(2)
    expect(s1.sendCount).toBe(1)
    expect(out).toHaveLength(2)
  })

  it('collects only problems that have a photo', () => {
    const out = summarizeFriendSessions([
      row({ image_url: 'a.jpg' }),
      row({ image_url: null }),
      row({ image_url: 'b.jpg' }),
    ])
    expect(out[0].photos).toEqual(['a.jpg', 'b.jpg'])
  })

  it('picks the hardest grade as topGrade (Font ranking)', () => {
    const out = summarizeFriendSessions([
      row({ grade_value: '6A', grade_value_font: '6A' }),
      row({ grade_value: '7B', grade_value_font: '7B' }),
      row({ grade_value: '6C', grade_value_font: '6C' }),
    ])
    expect(out[0].topGrade).toBe('7B')
  })

  it('displays topGrade on the Font scale even when logged in V-scale', () => {
    const out = summarizeFriendSessions([
      row({ grade_value: '7B', grade_value_font: '7B' }),
      row({ grade_value: 'V9', grade_value_font: '7C+' }),
    ])
    expect(out[0].topGrade).toBe('7C+')
  })

  it('takes gym from the first problem that has one (newest may be null)', () => {
    const out = summarizeFriendSessions([
      row({ created_at: '2026-01-01T12:00:00Z', gym: null }),
      row({ created_at: '2026-01-01T10:00:00Z', gym: 'Boulders Oslo' }),
    ])
    expect(out[0].gym).toBe('Boulders Oslo')
  })

  it('uses the latest problem time as the session date', () => {
    const out = summarizeFriendSessions([
      row({ created_at: '2026-01-01T10:00:00Z' }),
      row({ created_at: '2026-01-01T12:30:00Z' }),
    ])
    expect(out[0].date).toBe('2026-01-01T12:30:00Z')
  })

  it('sorts sessions newest first', () => {
    const out = summarizeFriendSessions([
      row({ session_id: 'old', created_at: '2026-01-01T10:00:00Z' }),
      row({ session_id: 'new', created_at: '2026-02-01T10:00:00Z' }),
    ])
    expect(out.map(s => s.sessionId)).toEqual(['new', 'old'])
  })

  it('ignores problems with no session_id and empty input', () => {
    expect(summarizeFriendSessions([row({ session_id: '' })])).toEqual([])
    expect(summarizeFriendSessions([])).toEqual([])
  })
})
