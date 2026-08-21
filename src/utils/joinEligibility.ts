/** What a friend's session card should offer the viewer. */
export type JoinAffordance = 'none' | 'join' | 'ask' | 'pending' | 'joined'

/**
 * Which join affordance a session card shows.
 *
 * Order matters and encodes the product rules: your own session offers nothing;
 * being already in the session, or the round's verdict already being out, are both
 * settled facts and win over everything below them — including a missing gym,
 * since neither should flip back to "none" on account of a `problems.gym` /
 * `sessions.location` divergence discovered after the fact. Only below those does
 * a missing gym matter: both server RPCs require a non-blank `location`, so with
 * no gym there is nothing to request or join, and that must be caught before a
 * leftover request row or a crew relationship would otherwise offer one. A crewmate
 * joins directly because they were plausibly there, and everyone else asks, so
 * nobody on a follow-based graph can attach themselves to your evening uninvited.
 *
 * The server enforces all of this too — this only decides which control to draw.
 */
export function joinAffordance(input: {
  isMine: boolean
  alreadyIn: boolean
  requested: boolean
  sharesCrew: boolean
  verdictOut: boolean
  hasGym: boolean
}): JoinAffordance {
  if (input.isMine) return 'none'
  if (input.alreadyIn) return 'joined'
  if (input.verdictOut) return 'none'
  if (!input.hasGym) return 'none'
  if (input.requested) return 'pending'
  return input.sharesCrew ? 'join' : 'ask'
}
