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
  beta_video_url: null,
  created_at: '2026-01-01T10:00:00Z',
  ...over,
})

// Convenience: most tests only exercise the problems path.
const fromProblems = (problems: FriendProblemRow[]) => summarizeFriendSessions({ problems })

describe('summarizeFriendSessions', () => {
  it('groups problems by session and counts sends', () => {
    const out = fromProblems([
      row({ session_id: 's1', sent: true }),
      row({ session_id: 's1', sent: false }),
      row({ session_id: 's2', sent: true }),
    ])
    const s1 = out.find(s => s.sessionId === 's1')!
    expect(s1.problemCount).toBe(2)
    expect(s1.sendCount).toBe(1)
    expect(out).toHaveLength(2)
  })

  it('collects only problems that have a photo, flagging which carry a video', () => {
    const out = fromProblems([
      row({ image_url: 'a.jpg', beta_video_url: 'https://youtu.be/x' }),
      row({ image_url: null }),
      row({ image_url: 'b.jpg' }),
    ])
    expect(out[0].photos).toEqual([
      { url: 'a.jpg', hasVideo: true },
      { url: 'b.jpg', hasVideo: false },
    ])
  })

  it('counts every problem that links a beta video, photo or not', () => {
    const out = fromProblems([
      row({ image_url: 'a.jpg', beta_video_url: 'https://youtu.be/x' }),
      row({ image_url: null, beta_video_url: 'https://youtu.be/y' }),
      row({ image_url: null, beta_video_url: null }),
    ])
    expect(out[0].videoCount).toBe(2)

    expect(fromProblems([row({ beta_video_url: null })])[0].videoCount).toBe(0)
  })

  it('picks the hardest grade as topGrade (Font ranking)', () => {
    const out = fromProblems([
      row({ grade_value: '6A', grade_value_font: '6A' }),
      row({ grade_value: '7B', grade_value_font: '7B' }),
      row({ grade_value: '6C', grade_value_font: '6C' }),
    ])
    expect(out[0].topGrade).toBe('7B')
  })

  it('displays topGrade on the Font scale even when logged in V-scale', () => {
    const out = fromProblems([
      row({ grade_value: '7B', grade_value_font: '7B' }),
      row({ grade_value: 'V9', grade_value_font: '7C+' }),
    ])
    expect(out[0].topGrade).toBe('7C+')
  })

  it('takes gym from the first problem that has one (newest may be null)', () => {
    const out = fromProblems([
      row({ created_at: '2026-01-01T12:00:00Z', gym: null }),
      row({ created_at: '2026-01-01T10:00:00Z', gym: 'Boulders Oslo' }),
    ])
    expect(out[0].gym).toBe('Boulders Oslo')
  })

  it('uses the latest activity time as the session date', () => {
    const out = summarizeFriendSessions({
      problems: [row({ created_at: '2026-01-01T10:00:00Z' })],
      exercises: [{ user_id: 'u1', session_id: 's1', created_at: '2026-01-01T13:00:00Z' }],
    })
    expect(out[0].date).toBe('2026-01-01T13:00:00Z')
  })

  it('counts exercises and challenges per session', () => {
    const out = summarizeFriendSessions({
      problems: [row({ session_id: 's1' })],
      exercises: [
        { user_id: 'u1', session_id: 's1', created_at: '2026-01-01T10:00:00Z' },
        { user_id: 'u1', session_id: 's1', created_at: '2026-01-01T10:05:00Z' },
      ],
      challenges: [{ user_id: 'u1', session_id: 's1', created_at: '2026-01-01T10:10:00Z' }],
    })
    expect(out[0].exerciseCount).toBe(2)
    expect(out[0].challengeCount).toBe(1)
  })

  it('includes sessions that have only exercises or challenges (no problems)', () => {
    const out = summarizeFriendSessions({
      problems: [],
      exercises: [{ user_id: 'u1', session_id: 'gym-strength', created_at: '2026-01-02T10:00:00Z' }],
      challenges: [{ user_id: 'u1', session_id: 'challenge-day', created_at: '2026-01-01T10:00:00Z' }],
    })
    expect(out.map(s => s.sessionId)).toEqual(['gym-strength', 'challenge-day'])
    const ex = out.find(s => s.sessionId === 'gym-strength')!
    expect(ex.problemCount).toBe(0)
    expect(ex.exerciseCount).toBe(1)
    expect(ex.gym).toBeNull()
  })

  it('sorts sessions newest first', () => {
    const out = fromProblems([
      row({ session_id: 'old', created_at: '2026-01-01T10:00:00Z' }),
      row({ session_id: 'new', created_at: '2026-02-01T10:00:00Z' }),
    ])
    expect(out.map(s => s.sessionId)).toEqual(['new', 'old'])
  })

  it('ignores rows with no session_id and empty input', () => {
    expect(fromProblems([row({ session_id: '' })])).toEqual([])
    expect(summarizeFriendSessions({ problems: [] })).toEqual([])
  })
})
