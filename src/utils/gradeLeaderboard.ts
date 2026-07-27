import type { GymGrading, LeaderboardEntry } from '../types'
import { rankEntries } from './leaderboard'

export interface GradeProblemRow {
  user_id: string
  color: string | null
  sent: boolean
  gym_problem_id: string | null
  name: string | null
  grade_value: string | null
}

/** Points for a stored colour name under a gym's config; 0 if null/unknown. */
export function pointsForColor(gradings: GymGrading[], color: string | null): number {
  if (!color) return 0
  const match = gradings.find(g => g.color_name.toLowerCase() === color.toLowerCase())
  return match?.points ?? 0
}

/**
 * Identity key for a problem row, used to dedupe re-logs of the same boulder.
 * Prefers the shared gym_problem_id; falls back to a name+grade signature for
 * legacy/manual rows; fully anonymous rows (no id, no name, no grade) are each
 * treated as a distinct boulder, keyed by their position in the input array.
 */
function problemIdentityKey(p: GradeProblemRow, index: number): string {
  if (p.gym_problem_id) return `id:${p.gym_problem_id}`
  if (p.name || p.grade_value) return `n:${(p.name ?? '').toLowerCase()}|g:${(p.grade_value ?? '').toLowerCase()}`
  return `row:${index}`
}

/**
 * Grade score per user = sum of a gym's colour points over the user's SENT
 * problems, counting each unique boulder once per user (re-logging the same
 * boulder should not inflate a score). Ranking mirrors buildLeaderboard
 * (competition ranking: ties share a rank, the next distinct score skips) via
 * the shared rankEntries helper.
 */
export function buildGradeLeaderboard(
  problems: GradeProblemRow[],
  gradings: GymGrading[],
  profiles: { id: string; username: string | null; avatar_url: string | null }[],
): LeaderboardEntry[] {
  const totals = new Map<string, number>()
  const seenByUser = new Map<string, Set<string>>()
  problems.forEach((p, index) => {
    if (!p.sent) return
    const pts = pointsForColor(gradings, p.color)
    if (pts === 0) return

    const seen = seenByUser.get(p.user_id) ?? new Set<string>()
    seenByUser.set(p.user_id, seen)
    const key = problemIdentityKey(p, index)
    if (seen.has(key)) return
    seen.add(key)

    totals.set(p.user_id, (totals.get(p.user_id) ?? 0) + pts)
  })

  return rankEntries(totals, profiles)
}
