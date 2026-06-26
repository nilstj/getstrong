import type { CrewTitle } from '../types'

export const CREW_TITLE_META: Record<CrewTitle, { label: string; emoji: string }> = {
  flash:      { label: 'Flash',      emoji: '👑' },
  grinder:    { label: 'Grinder',    emoji: '🪨' },
  first_send: { label: 'First send', emoji: '🥇' },
  sandbagger: { label: 'Sandbagger', emoji: '🤨' },
}

export interface CrewTitleRow {
  user_id: string
  sent: boolean
  attempts: number
  created_at: string
}

/**
 * Derive playful per-climber titles for one boulder from the problems logged
 * against it. Pure; no DB. Sandbagger is intentionally not derived here (it
 * needs a community-grade comparison decided later) — see the spec's open Qs.
 */
export function crewTitles(rows: CrewTitleRow[]): Record<string, CrewTitle[]> {
  const out: Record<string, CrewTitle[]> = {}
  const add = (u: string, t: CrewTitle) => { (out[u] ??= []).push(t) }

  const senders = rows.filter(r => r.sent)

  for (const r of senders) {
    if (r.attempts <= 1) add(r.user_id, 'flash')
  }

  if (senders.length > 0) {
    const grinder = senders.reduce((m, r) => (r.attempts > m.attempts ? r : m))
    if (grinder.attempts > 1) add(grinder.user_id, 'grinder')

    const first = senders.reduce((m, r) => (r.created_at < m.created_at ? r : m))
    add(first.user_id, 'first_send')
  }

  // Ensure non-senders that appear in rows resolve to [] rather than undefined
  // only when queried — callers use (out[id] ?? []).
  return out
}
