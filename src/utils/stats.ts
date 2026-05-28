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
}

export function sessionsByWeek(sessions: Session[], days = 90): WeekBucket[] {
  const now = new Date()
  const cutoff = subDays(now, days)
  const recent = sessions.filter(s => new Date(s.date) >= cutoff)

  const weekStarts = eachWeekOfInterval({ start: cutoff, end: now }, { weekStartsOn: 1 })

  const weekMap = new Map<string, number>()
  for (const session of recent) {
    const key = format(startOfWeek(new Date(session.date), { weekStartsOn: 1 }), 'MMM d')
    weekMap.set(key, (weekMap.get(key) ?? 0) + 1)
  }

  return weekStarts.map(ws => ({
    week: format(ws, 'MMM d'),
    count: weekMap.get(format(ws, 'MMM d')) ?? 0,
  }))
}

export interface GradeDataPoint {
  date: string
  fontGrade: string
  fontIndex: number
  vGrade: string | null
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
      const fontGrades = problems
        .filter(p => p.session_id === session.id && p.sent)
        .map(p => normalizeToFont(p.grade_system, p.grade_value, mappings))
        .filter((g): g is string => g !== null)

      if (fontGrades.length === 0) return []

      const hardest = fontGrades.sort((a, b) => fontGradeToIndex(b) - fontGradeToIndex(a))[0]
      return [{
        date: session.date,
        fontGrade: hardest,
        fontIndex: fontGradeToIndex(hardest),
        vGrade: mappings.find(m => m.font_equivalent === hardest)?.v_scale ?? null,
      }]
    })
}
