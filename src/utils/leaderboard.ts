import type { BetaPointRow, LeaderboardEntry } from '../types'

export function cycleMonth(date: Date): string {
  return date.toISOString().slice(0, 7)
}

/**
 * Sort totals by points desc (username asc as tiebreak) and assign competition
 * ranks: equal points share a rank; the next distinct score skips (1, 2, 2, 4).
 * Single pass so 3+-way ties resolve correctly. Shared by any per-context
 * leaderboard (overall beta points, per-gym grade score, ...) built on top of
 * a user_id -> points totals map.
 */
export function rankEntries(
  totals: Map<string, number>,
  profiles: { id: string; username: string | null; avatar_url: string | null }[],
): LeaderboardEntry[] {
  const profileById = new Map(profiles.map(p => [p.id, p]))

  const sorted = Array.from(totals.entries())
    .map(([user_id, points]) => ({
      user_id,
      points,
      username: profileById.get(user_id)?.username ?? null,
      avatar_url: profileById.get(user_id)?.avatar_url ?? null,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      const an = a.username ?? '￿'
      const bn = b.username ?? '￿'
      return an < bn ? -1 : an > bn ? 1 : 0
    })

  let lastPoints: number | null = null
  let lastRank = 0
  return sorted.map((e, i) => {
    const rank = lastPoints !== null && e.points === lastPoints ? lastRank : i + 1
    lastPoints = e.points
    lastRank = rank
    return { ...e, rank }
  })
}

export function buildLeaderboard(
  rows: BetaPointRow[],
  profiles: { id: string; username: string | null; avatar_url: string | null }[],
): LeaderboardEntry[] {
  const totals = new Map<string, number>()
  for (const r of rows) {
    totals.set(r.user_id, (totals.get(r.user_id) ?? 0) + r.points)
  }

  return rankEntries(totals, profiles)
}
