import type { GymGrading, LeaderboardEntry } from '../types'
import { rankEntries } from './leaderboard'

export interface GradeProblemRow {
  user_id: string
  color: string | null
  sent: boolean
}

/** Points for a stored colour name under a gym's config; 0 if null/unknown. */
export function pointsForColor(gradings: GymGrading[], color: string | null): number {
  if (!color) return 0
  const match = gradings.find(g => g.color_name.toLowerCase() === color.toLowerCase())
  return match?.points ?? 0
}

/**
 * Grade score per user = sum of a gym's colour points over the user's SENT
 * problems. Ranking mirrors buildLeaderboard (competition ranking: ties share a
 * rank, the next distinct score skips) via the shared rankEntries helper.
 */
export function buildGradeLeaderboard(
  problems: GradeProblemRow[],
  gradings: GymGrading[],
  profiles: { id: string; username: string | null; avatar_url: string | null }[],
): LeaderboardEntry[] {
  const totals = new Map<string, number>()
  for (const p of problems) {
    if (!p.sent) continue
    const pts = pointsForColor(gradings, p.color)
    if (pts === 0) continue
    totals.set(p.user_id, (totals.get(p.user_id) ?? 0) + pts)
  }

  return rankEntries(totals, profiles)
}
