import { describe, it, expect } from 'vitest'
import { totalSessions, totalProblems, totalSends, sendRate, sessionsByWeek, hardestSentPerSession, sentGymGradeCounts } from '../stats'
import type { Session, Problem, GradeMapping } from '../../types'

const SESSIONS: Session[] = [
  { id: 's1', user_id: 'u1', date: '2026-05-20', location: 'Gym', duration_minutes: 90, intensity: null, goal: null, notes: null, wisdom: null, wisdom_shared: false, group_id: null, created_at: '' },
  { id: 's2', user_id: 'u1', date: '2026-05-22', location: 'Kilter', duration_minutes: 60, intensity: null, goal: null, notes: null, wisdom: null, wisdom_shared: false, group_id: null, created_at: '' },
]

const PROBLEMS: Problem[] = [
  { id: 'p1', session_id: 's1', user_id: 'u1', name: null, grade_system: 'font', grade_value: '7A', color: null, hold_color: null, attempts: 3, sent: true, grade_value_font: null, grade_value_vscale: null, board: null, board_angle: null, gym: null, beta_video_url: null, image_url: null, crag: null, notes: null, created_at: '', gym_problem_id: null },
  { id: 'p2', session_id: 's1', user_id: 'u1', name: null, grade_system: 'v_scale', grade_value: 'V5', color: null, hold_color: null, attempts: 1, sent: false, grade_value_font: null, grade_value_vscale: null, board: null, board_angle: null, gym: null, beta_video_url: null, image_url: null, crag: null, notes: null, created_at: '', gym_problem_id: null },
  { id: 'p3', session_id: 's2', user_id: 'u1', name: null, grade_system: 'font', grade_value: '6B+', color: null, hold_color: null, attempts: 2, sent: true, grade_value_font: null, grade_value_vscale: null, board: null, board_angle: null, gym: null, beta_video_url: null, image_url: null, crag: null, notes: null, created_at: '', gym_problem_id: null },
]

describe('totalSessions', () => {
  it('returns session count', () => {
    expect(totalSessions(SESSIONS)).toBe(2)
  })
  it('returns 0 for empty array', () => {
    expect(totalSessions([])).toBe(0)
  })
})

describe('totalProblems', () => {
  it('returns problem count', () => {
    expect(totalProblems(PROBLEMS)).toBe(3)
  })
  it('returns 0 for empty array', () => {
    expect(totalProblems([])).toBe(0)
  })
})

describe('totalSends', () => {
  it('counts only sent problems', () => {
    expect(totalSends(PROBLEMS)).toBe(2)
  })
  it('returns 0 when nothing sent', () => {
    const unsent = PROBLEMS.map(p => ({ ...p, sent: false }))
    expect(totalSends(unsent)).toBe(0)
  })
})

describe('sendRate', () => {
  it('returns send rate as integer percentage', () => {
    expect(sendRate(PROBLEMS)).toBe(67)
  })
  it('returns 0 when no problems', () => {
    expect(sendRate([])).toBe(0)
  })
  it('returns 100 when all sent', () => {
    const allSent = PROBLEMS.map(p => ({ ...p, sent: true }))
    expect(sendRate(allSent)).toBe(100)
  })
})

const GRADE_MAPPINGS: GradeMapping[] = [
  { v_scale: 'V0', font_equivalent: '4' },
  { v_scale: 'V5', font_equivalent: '6C+' },
  { v_scale: 'V6', font_equivalent: '7A' },
]

describe('sessionsByWeek', () => {
  it('returns a bucket for each week in the window', () => {
    const results = sessionsByWeek([], 14)
    expect(results.length).toBeGreaterThanOrEqual(2)
    results.forEach(b => {
      expect(b).toHaveProperty('week')
      expect(b).toHaveProperty('count')
    })
  })

  it('counts sessions in the correct week bucket', () => {
    const today = new Date()
    const recentDate = new Date(today)
    recentDate.setDate(today.getDate() - 3)
    const dateStr = recentDate.toISOString().split('T')[0]
    const sessions: Session[] = [
      { id: 's1', user_id: 'u1', date: dateStr, location: 'Gym', duration_minutes: 60, intensity: null, goal: null, notes: null, wisdom: null, wisdom_shared: false, group_id: null, created_at: '' },
    ]
    const result = sessionsByWeek(sessions, 14)
    const totalCount = result.reduce((sum, b) => sum + b.count, 0)
    expect(totalCount).toBe(1)
  })

  it('excludes sessions outside the window', () => {
    const oldDate = '2020-01-01'
    const sessions: Session[] = [
      { id: 's1', user_id: 'u1', date: oldDate, location: 'Gym', duration_minutes: 60, intensity: null, goal: null, notes: null, wisdom: null, wisdom_shared: false, group_id: null, created_at: '' },
    ]
    const result = sessionsByWeek(sessions, 14)
    const totalCount = result.reduce((sum, b) => sum + b.count, 0)
    expect(totalCount).toBe(0)
  })
})

describe('hardestSentPerSession', () => {
  it('returns empty array when no sessions', () => {
    expect(hardestSentPerSession([], [], GRADE_MAPPINGS)).toEqual([])
  })

  it('omits sessions with no sent problems', () => {
    const sessions: Session[] = [
      { id: 's1', user_id: 'u1', date: SESSIONS[0].date, location: 'Gym', duration_minutes: 60, intensity: null, goal: null, notes: null, wisdom: null, wisdom_shared: false, group_id: null, created_at: '' },
    ]
    const unseated: Problem[] = [
      { id: 'p1', session_id: 's1', user_id: 'u1', name: null, grade_system: 'font', grade_value: '7A', color: null, hold_color: null, attempts: 2, sent: false, grade_value_font: null, grade_value_vscale: null, board: null, board_angle: null, gym: null, beta_video_url: null, image_url: null, crag: null, notes: null, created_at: '', gym_problem_id: null },
    ]
    expect(hardestSentPerSession(sessions, unseated, GRADE_MAPPINGS)).toEqual([])
  })

  it('picks the hardest sent grade per session', () => {
    const today = new Date()
    const recentDate = new Date(today)
    recentDate.setDate(today.getDate() - 5)
    const dateStr = recentDate.toISOString().split('T')[0]
    const sessions: Session[] = [
      { id: 's1', user_id: 'u1', date: dateStr, location: 'Gym', duration_minutes: 60, intensity: null, goal: null, notes: null, wisdom: null, wisdom_shared: false, group_id: null, created_at: '' },
    ]
    const problems: Problem[] = [
      { id: 'p1', session_id: 's1', user_id: 'u1', name: null, grade_system: 'font', grade_value: '4', color: null, hold_color: null, attempts: 1, sent: true, grade_value_font: null, grade_value_vscale: null, board: null, board_angle: null, gym: null, beta_video_url: null, image_url: null, crag: null, notes: null, created_at: '', gym_problem_id: null },
      { id: 'p2', session_id: 's1', user_id: 'u1', name: null, grade_system: 'font', grade_value: '7A', color: null, hold_color: null, attempts: 1, sent: true, grade_value_font: null, grade_value_vscale: null, board: null, board_angle: null, gym: null, beta_video_url: null, image_url: null, crag: null, notes: null, created_at: '', gym_problem_id: null },
    ]
    const result = hardestSentPerSession(sessions, problems, GRADE_MAPPINGS)
    expect(result).toHaveLength(1)
    expect(result[0].fontGrade).toBe('7A')
  })

  it('excludes sessions outside the window', () => {
    const oldSession: Session[] = [
      { id: 's1', user_id: 'u1', date: '2020-01-01', location: 'Gym', duration_minutes: 60, intensity: null, goal: null, notes: null, wisdom: null, wisdom_shared: false, group_id: null, created_at: '' },
    ]
    const problems: Problem[] = [
      { id: 'p1', session_id: 's1', user_id: 'u1', name: null, grade_system: 'font', grade_value: '7A', color: null, hold_color: null, attempts: 1, sent: true, grade_value_font: null, grade_value_vscale: null, board: null, board_angle: null, gym: null, beta_video_url: null, image_url: null, crag: null, notes: null, created_at: '', gym_problem_id: null },
    ]
    expect(hardestSentPerSession(oldSession, problems, GRADE_MAPPINGS)).toEqual([])
  })
})

describe('sentGymGradeCounts', () => {
  const daysAgo = (n: number): string => {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return d.toISOString().split('T')[0]
  }
  const session = (id: string, date: string): Session =>
    ({ id, user_id: 'u1', date, location: 'Gym', duration_minutes: 60, intensity: null, goal: null, notes: null, wisdom: null, wisdom_shared: false, group_id: null, created_at: '' })
  const problem = (id: string, sessionId: string, color: string | null, sent: boolean): Problem =>
    ({ id, session_id: sessionId, user_id: 'u1', name: null, grade_system: 'font', grade_value: '6A', color, hold_color: null, attempts: 1, sent, grade_value_font: null, grade_value_vscale: null, board: null, board_angle: null, gym: 'Gym', beta_video_url: null, image_url: null, crag: null, notes: null, created_at: '', gym_problem_id: null })

  it('returns empty when nothing was sent', () => {
    expect(sentGymGradeCounts([], [])).toEqual([])
  })

  it('counts sends per colour, commonest first', () => {
    const sessions = [session('s1', daysAgo(3)), session('s2', daysAgo(10))]
    const problems = [
      problem('p1', 's1', 'Green', true),
      problem('p2', 's1', 'Blue', true),
      problem('p3', 's2', 'Green', true),
      problem('p4', 's2', 'Green', true),
    ]
    expect(sentGymGradeCounts(sessions, problems)).toEqual([
      { color: 'Green', count: 3 },
      { color: 'Blue', count: 1 },
    ])
  })

  it('ignores projects, uncoloured problems and older sessions', () => {
    const sessions = [session('s1', daysAgo(3)), session('s2', daysAgo(45))]
    const problems = [
      problem('p1', 's1', 'Red', true),
      problem('p2', 's1', 'Red', false),   // not sent
      problem('p3', 's1', null, true),     // no gym grade
      problem('p4', 's2', 'Red', true),    // outside the 30-day window
    ]
    expect(sentGymGradeCounts(sessions, problems)).toEqual([{ color: 'Red', count: 1 }])
  })

  it('merges colours that differ only in casing, keeping the first spelling', () => {
    const sessions = [session('s1', daysAgo(1))]
    const problems = [problem('p1', 's1', 'Blue', true), problem('p2', 's1', 'blue', true)]
    expect(sentGymGradeCounts(sessions, problems)).toEqual([{ color: 'Blue', count: 2 }])
  })

  it('honours a custom window', () => {
    const sessions = [session('s1', daysAgo(20))]
    const problems = [problem('p1', 's1', 'Blue', true)]
    expect(sentGymGradeCounts(sessions, problems, 7)).toEqual([])
    expect(sentGymGradeCounts(sessions, problems, 30)).toEqual([{ color: 'Blue', count: 1 }])
  })
})
