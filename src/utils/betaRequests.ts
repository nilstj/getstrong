import type { BoulderSummary } from '../types'

/** An open "I'm stuck, help me" request on a boulder, ready to render. */
export interface BetaRequest {
  gymProblemId: string
  askerId: string
  askerName: string | null
  note: string | null
  createdAt: string
  boulder: BoulderSummary
}

/**
 * Open beta requests worth showing: not your own, on a boulder still active,
 * newest first.
 *
 * A row whose boulder is absent from `boulders` is dropped — that is how expired
 * and archived boulders are excluded, since the caller passes only the active
 * summaries. One row per request, so two climbers stuck on the same boulder stay
 * two asks.
 */
export function buildBetaRequests(
  rows: { gym_problem_id: string; user_id: string; note: string | null; created_at: string }[],
  boulders: BoulderSummary[],
  profiles: { id: string; username: string | null }[],
  currentUserId: string | undefined,
): BetaRequest[] {
  const boulderById = new Map(boulders.map(b => [b.id, b]))
  const nameById = new Map(profiles.map(p => [p.id, p.username]))

  return rows
    .filter(r => r.user_id !== currentUserId && boulderById.has(r.gym_problem_id))
    .map(r => ({
      gymProblemId: r.gym_problem_id,
      askerId: r.user_id,
      askerName: nameById.get(r.user_id) ?? null,
      note: r.note,
      createdAt: r.created_at,
      boulder: boulderById.get(r.gym_problem_id)!,
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
}
