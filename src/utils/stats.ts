import { subDays, startOfWeek, format, eachWeekOfInterval } from 'date-fns'
import type { Session, Problem, GradeMapping } from '../types'
import { normalizeToFont, fontGradeToIndex } from './grades'

export function totalSessions(sessions: Session[]): number {
  return sessions.length
}

export function totalProblems(problems: Problem[]): number {
  return problems.length
}

export function totalSends(problems: Problem[]): number {
  return problems.filter(p => p.sent).length
}

export function sendRate(problems: Problem[]): number {
  if (problems.length === 0) return 0
  return Math.round((totalSends(problems) / problems.length) * 100)
}

export interface WeekBucket {
  week: string
  count: number
  minutes: number
}

export function sessionsByWeek(sessions: Session[], days = 90): WeekBucket[] {
  const now = new Date()
  const cutoff = subDays(now, days)
  const recent = sessions.filter(s => new Date(s.date) >= cutoff)

  const weekStarts = eachWeekOfInterval({ start: cutoff, end: now }, { weekStartsOn: 1 })

  const weekMap = new Map<string, { count: number; minutes: number }>()
  for (const session of recent) {
    const key = format(startOfWeek(new Date(session.date), { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const prev = weekMap.get(key) ?? { count: 0, minutes: 0 }
    weekMap.set(key, {
      count: prev.count + 1,
      minutes: prev.minutes + (session.duration_minutes ?? 0),
    })
  }

  return weekStarts.map(ws => {
    const entry = weekMap.get(format(ws, 'yyyy-MM-dd'))
    return {
      week: format(ws, 'MMM d'),
      count: entry?.count ?? 0,
      minutes: entry?.minutes ?? 0,
    }
  })
}

export interface GymGradeCount {
  /** The gym grading colour, in the casing it was first logged with. */
  color: string
  /** Sends of that colour in the window. */
  count: number
}

/**
 * How many problems of each gym grading colour the user sent in the window —
 * "6 greens, 3 blues, 1 red last month".
 *
 * Colours are aggregated across gyms: a Blue at one gym and a Blue at another
 * count together, since the point is a rough spread of difficulty, not a
 * per-gym score (that's the grade leaderboard's job). Matched case-insensitively
 * so "Blue" and "blue" don't split into two rows. Sorted commonest first.
 */
export function sentGymGradeCounts(
  sessions: Session[],
  problems: Problem[],
  days = 30,
): GymGradeCount[] {
  const cutoff = subDays(new Date(), days)
  const recentSessionIds = new Set(
    sessions.filter(s => new Date(s.date) >= cutoff).map(s => s.id),
  )

  const counts = new Map<string, GymGradeCount>()
  for (const p of problems) {
    if (!p.sent || !p.color || !recentSessionIds.has(p.session_id)) continue
    const key = p.color.toLowerCase()
    const entry = counts.get(key)
    if (entry) entry.count += 1
    else counts.set(key, { color: p.color, count: 1 })
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.color.localeCompare(b.color))
}

export interface GradeDataPoint {
  date: string
  fontGrade: string
  fontIndex: number
  vGrade: string | null
  countAtMax: number
}

export function hardestSentPerSession(
  sessions: Session[],
  problems: Problem[],
  mappings: GradeMapping[],
  days = 90,
): GradeDataPoint[] {
  const now = new Date()
  const cutoff = subDays(now, days)

  return sessions
    .filter(s => new Date(s.date) >= cutoff)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .flatMap(session => {
      const sent = problems.filter(p => p.session_id === session.id && p.sent)

      const fontGrades = sent
        .map(p => p.grade_value_font ?? normalizeToFont(p.grade_system, p.grade_value, mappings))
        .filter((g): g is string => g !== null)
        .filter(g => fontGradeToIndex(g) !== -1)

      if (fontGrades.length === 0) return []

      const hardest = fontGrades.sort((a, b) => fontGradeToIndex(b) - fontGradeToIndex(a))[0]
      const hardestIndex = fontGradeToIndex(hardest)
      const countAtMax = fontGrades.filter(g => fontGradeToIndex(g) === hardestIndex).length

      return [{
        date: session.date,
        fontGrade: hardest,
        fontIndex: hardestIndex,
        vGrade: mappings.find(m => m.font_equivalent === hardest)?.v_scale ?? null,
        countAtMax,
      }]
    })
}
