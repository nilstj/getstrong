/** What a friend's session card should offer the viewer. */
export type JoinAffordance = 'none' | 'join' | 'ask' | 'pending' | 'joined'

/**
 * Which join affordance a session card shows.
 *
 * Order matters and encodes the product rules: your own session offers nothing;
 * a session whose awards verdict is already out has a closed roster, because
 * adding a participant after people have read the result is wrong; being in the
 * session beats a leftover request row; a crewmate joins directly because they were
 * plausibly there, and everyone else asks, so nobody on a follow-based graph can
 * attach themselves to your evening uninvited.
 *
 * The server enforces all of this too — this only decides which control to draw.
 */
export function joinAffordance(input: {
  isMine: boolean
  alreadyIn: boolean
  requested: boolean
  sharesCrew: boolean
  verdictOut: boolean
}): JoinAffordance {
  if (input.isMine) return 'none'
  if (input.alreadyIn) return 'joined'
  if (input.verdictOut) return 'none'
  if (input.requested) return 'pending'
  return input.sharesCrew ? 'join' : 'ask'
}
