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
  beta_video_url: string | null
  created_at: string
}

/** An exercise or challenge attempt, reduced to what the feed needs. */
export interface FriendActivityRow {
  user_id: string
  session_id: string | null
  created_at: string
}

/** One friend's session, summarized from its problems, exercises, and challenges
 *  (the sessions table is owner-only under RLS, so everything is derived from
 *  readable child rows). */
export interface FriendSessionSummary {
  sessionId: string
  userId: string
  gym: string | null
  date: string
  problemCount: number
  sendCount: number
  exerciseCount: number
  challengeCount: number
  topGrade: string | null
  /** Problems that have a photo, each flagged if that same problem links a video. */
  photos: { url: string; hasVideo: boolean }[]
  /** Count of problems in the session that link a beta video (photo or not). */
  videoCount: number
}

interface Bucket {
  userId: string
  gym: string | null
  date: string
  problems: FriendProblemRow[]
  exerciseCount: number
  challengeCount: number
}

/**
 * Group a friend's recent activity into per-session summaries, newest first.
 * A session appears if it has any problems, exercises, or challenge attempts.
 * Rows with no `session_id` are ignored. `topGrade` is the hardest problem's
 * display grade, ranked on the Font scale.
 */
export function summarizeFriendSessions(input: {
  problems: FriendProblemRow[]
  exercises?: FriendActivityRow[]
  challenges?: FriendActivityRow[]
}): FriendSessionSummary[] {
  const buckets = new Map<string, Bucket>()
  const touch = (sessionId: string, userId: string, createdAt: string): Bucket => {
    let b = buckets.get(sessionId)
    if (!b) {
      b = { userId, gym: null, date: createdAt, problems: [], exerciseCount: 0, challengeCount: 0 }
      buckets.set(sessionId, b)
    }
    if (createdAt > b.date) b.date = createdAt
    return b
  }

  for (const p of input.problems) {
    if (!p.session_id) continue
    const b = touch(p.session_id, p.user_id, p.created_at)
    b.problems.push(p)
    if (!b.gym && p.gym) b.gym = p.gym
  }
  for (const e of input.exercises ?? []) {
    if (!e.session_id) continue
    touch(e.session_id, e.user_id, e.created_at).exerciseCount++
  }
  for (const c of input.challenges ?? []) {
    if (!c.session_id) continue
    touch(c.session_id, c.user_id, c.created_at).challengeCount++
  }

  const out: FriendSessionSummary[] = []
  for (const [sessionId, b] of buckets) {
    let topGrade: string | null = null
    let topIdx = -1
    let sendCount = 0
    let videoCount = 0
    const photos: { url: string; hasVideo: boolean }[] = []
    for (const r of b.problems) {
      if (r.sent) sendCount++
      if (r.beta_video_url) videoCount++
      if (r.image_url) photos.push({ url: r.image_url, hasVideo: !!r.beta_video_url })
      const idx = r.grade_value_font ? fontGradeToIndex(r.grade_value_font) : -1
      if (idx > topIdx) { topIdx = idx; topGrade = r.grade_value_font ?? r.grade_value }
    }
    out.push({
      sessionId,
      userId: b.userId,
      gym: b.gym,
      date: b.date,
      problemCount: b.problems.length,
      sendCount,
      exerciseCount: b.exerciseCount,
      challengeCount: b.challengeCount,
      topGrade,
      photos,
      videoCount,
    })
  }

  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}
