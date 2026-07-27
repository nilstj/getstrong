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

/**
 * Shift a 'YYYY-MM' cycle month by whole months.
 * shiftMonth('2026-01', -1) === '2025-12'
 */
export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number)
  return cycleMonth(new Date(Date.UTC(year, m - 1 + delta, 1)))
}

/**
 * Half-open UTC bounds for a 'YYYY-MM' month, shaped for a timestamptz range
 * filter: start <= created_at < end. Half-open avoids the end-of-month
 * off-by-one that an inclusive upper bound invites.
 */
export function monthBounds(month: string): { start: string; end: string } {
  const [year, m] = month.split('-').map(Number)
  return {
    start: new Date(Date.UTC(year, m - 1, 1)).toISOString(),
    end: new Date(Date.UTC(year, m, 1)).toISOString(),
  }
}

/**
 * Entries whose competition rank falls within `limit`. Tie-inclusive: climbers
 * tied on the boundary rank all appear, so the result can exceed `limit`.
 * Filtering on rank rather than slicing is the point — cutting one member of a
 * tie while showing another on identical points reads as a bug.
 */
export function topEntries(entries: LeaderboardEntry[], limit: number): LeaderboardEntry[] {
  return entries.filter(e => e.rank <= limit)
}
