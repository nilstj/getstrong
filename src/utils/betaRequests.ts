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

/**
 * A dismissal is per ask, not per boulder: two climbers stuck on the same
 * boulder are two separate asks, and hiding one must leave the other standing.
 */
export function betaRequestKey(gymProblemId: string, askerId: string): string {
  return `${gymProblemId}:${askerId}`
}

/**
 * The asks still worth showing this viewer.
 *
 * Dismissing means "not me, I don't know this one" -- it hides the ask from the
 * viewer's own home page and does NOT touch `resolved_at`. Only the asker owns
 * that: closing someone else's request for help because you personally can't
 * answer it would cancel it for every climber who could.
 */
export function visibleBetaRequests(
  requests: BetaRequest[],
  dismissedKeys: Set<string>,
): BetaRequest[] {
  return requests.filter(r => !dismissedKeys.has(betaRequestKey(r.gymProblemId, r.askerId)))
}

/**
 * Drops dismissals older than `maxAgeDays`, so the stored map stays bounded
 * however long someone uses the app. An unparseable timestamp is dropped too:
 * keeping it would hide that ask forever with no way to tell how old the
 * decision was.
 *
 * The window also gives a long-unanswered ask one more chance to be seen -- a
 * boulder usually turns over well before then, so in practice a dismissal
 * outlives the thing it hid.
 */
export function pruneDismissals(
  entries: Record<string, string>,
  now: Date,
  maxAgeDays = 90,
): Record<string, string> {
  const cutoff = now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000
  const out: Record<string, string> = {}
  for (const [key, at] of Object.entries(entries)) {
    const t = new Date(at).getTime()
    if (Number.isFinite(t) && t >= cutoff) out[key] = at
  }
  return out
}
