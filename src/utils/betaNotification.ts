import { riskMoveLabel } from './riskMoves'

/**
 * The two ways a climber comes to hear about beta on a boulder they didn't post
 * it on: they asked for it, or they're working on the boulder.
 */
export type BetaNotificationType = 'beta_answered' | 'beta_on_project'

export interface BetaNotificationInput {
  type: BetaNotificationType
  /** `boulder_beta.kind`. Anything other than 'caution' reads as a plain beta. */
  kind: string | null
  /** The poster's display name, already resolved. */
  actor: string
  /** From `boulderColorGradeLabel` — "the blue 6C", or "a boulder". */
  label: string
  gym: string | null
  /** The tip itself, already truncated server-side. Null for a video-only beta. */
  body: string | null
  /** `boulder_beta.risk_move`. Null for a plain beta. */
  riskMove: string | null
}

/**
 * The sentence and detail line for a beta notification.
 *
 * Two rules the tests pin down:
 *
 * 1. A caution is a KIND of beta in the schema (090), but calling one "beta" in
 *    the inbox misleads the reader about what they're opening — so a caution
 *    gets its own sentence, and an unknown kind degrades to the plain-beta
 *    wording rather than to caution wording that would claim a hazard nobody
 *    reported.
 * 2. Every sentence says WHY this climber is being told, because an unexplained
 *    ping about someone else's boulder reads as noise.
 */
export function betaNotificationText(
  input: BetaNotificationInput,
): { text: string; detail?: string } {
  const { type, kind, actor, label, gym, body, riskMove } = input

  // A climber logs at more than one gym, so the row has to say which.
  const where = gym ? ` at ${gym}` : ''
  // Em dash, matching session_group_invite's "— accept to join in".
  const why = type === 'beta_answered' ? ' — you asked for beta' : " — you're working on it"

  if (kind === 'caution') {
    // The move is the subject, never an injury (090). riskMoveLabel returns ''
    // for a missing move, which becomes no detail line at all.
    const move = riskMoveLabel(riskMove)
    return {
      text: `${actor} flagged a move to watch out for on ${label}${where}${why} ⚠️`,
      detail: move || undefined,
    }
  }

  // An asker already knows why they're being told — they asked — so their
  // sentence carries no trailing clause.
  const text = type === 'beta_answered'
    ? `${actor} answered your ask for beta on ${label}${where}`
    : `${actor} posted beta on ${label}${where}${why}`

  const tip = body?.trim()
  return { text, detail: tip ? `"${tip}"` : undefined }
}
