import { fontGradeToIndex } from './grades'

/** A friend's logged problem, reduced to what the home feed needs. */
export interface FriendProblemRow {
  user_id: string
  session_id: string
  gym: string | null
  grade_value: string | null
  grade_value_font: string | null
  sent: boolean
  image_url: string | null
  created_at: string
}

/** One friend's session, summarized from its problems (the sessions table is
 *  owner-only under RLS, so everything here is derived from readable problems). */
export interface FriendSessionSummary {
  sessionId: string
  userId: string
  gym: string | null
  date: string
  problemCount: number
  sendCount: number
  topGrade: string | null
  photos: string[]
}

/**
 * Group friends' problems into per-session summaries, newest session first.
 * Pure. Problems with no `session_id` are ignored. `topGrade` is the hardest
 * problem's display grade, ranked on the Font scale via `grade_value_font`.
 */
export function summarizeFriendSessions(rows: FriendProblemRow[]): FriendSessionSummary[] {
  const bySession = new Map<string, FriendProblemRow[]>()
  for (const r of rows) {
    if (!r.session_id) continue
    const group = bySession.get(r.session_id)
    if (group) group.push(r)
    else bySession.set(r.session_id, [r])
  }

  const out: FriendSessionSummary[] = []
  for (const [sessionId, group] of bySession) {
    let date = group[0].created_at
    let topGrade: string | null = null
    let topIdx = -1
    let sendCount = 0
    const photos: string[] = []
    for (const r of group) {
      if (r.created_at > date) date = r.created_at
      if (r.sent) sendCount++
      if (r.image_url) photos.push(r.image_url)
      const idx = r.grade_value_font ? fontGradeToIndex(r.grade_value_font) : -1
      if (idx > topIdx) { topIdx = idx; topGrade = r.grade_value ?? r.grade_value_font }
    }
    out.push({
      sessionId,
      userId: group[0].user_id,
      gym: group[0].gym ?? null,
      date,
      problemCount: group.length,
      sendCount,
      topGrade,
      photos,
    })
  }

  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}
