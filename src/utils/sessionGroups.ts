/** Where a climber stands on one boulder of a shared session. */
export type BoulderStatus = 'none' | 'project' | 'sent'

/** One entry on a session group's shared boulder list. */
export interface GroupBoulder {
  id: string
  gym_problem_id: string | null
  grade_system: string
  grade_value: string | null
  grade_value_font: string | null
  color: string | null
  hold_color: string | null
  image_url: string | null
  beta_video_url: string | null
  created_at: string
}

/** The caller's own problem row, reduced to what the join needs. */
export interface MyEntry {
  id: string
  group_boulder_id: string | null
  attempts: number
  sent: boolean
}

export interface BoulderRow {
  boulder: GroupBoulder
  entryId: string | null
  status: BoulderStatus
  attempts: number
}

/**
 * Join the group's boulder list to the caller's own entries.
 *
 * Status is derived, never stored: no entry means the boulder is on the wall but
 * not in your log and costs you nothing; an unsent entry is a project whether or
 * not it has tries; a sent entry is a send. Ordering follows the list, so rows do
 * not move as you log.
 */
export function boulderRows(boulders: GroupBoulder[], mine: MyEntry[]): BoulderRow[] {
  const byBoulder = new Map<string, MyEntry>()
  for (const e of mine) {
    if (e.group_boulder_id) byBoulder.set(e.group_boulder_id, e)
  }
  return [...boulders]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(boulder => {
      const e = byBoulder.get(boulder.id)
      return {
        boulder,
        entryId: e?.id ?? null,
        status: e ? (e.sent ? 'sent' : 'project') : 'none',
        attempts: e?.attempts ?? 0,
      }
    })
}

/** The "1 project · 2 sent · 1 untouched" line. Zero groups are omitted. */
export function sessionProjectSummary(rows: BoulderRow[]): {
  projects: number
  sent: number
  untouched: number
  label: string
} {
  const projects = rows.filter(r => r.status === 'project').length
  const sent = rows.filter(r => r.status === 'sent').length
  const untouched = rows.filter(r => r.status === 'none').length
  const parts: string[] = []
  if (projects > 0) parts.push(`${projects} ${projects === 1 ? 'project' : 'projects'}`)
  if (sent > 0) parts.push(`${sent} sent`)
  if (untouched > 0) parts.push(`${untouched} untouched`)
  return { projects, sent, untouched, label: parts.length > 0 ? parts.join(' · ') : 'No boulders yet' }
}

/**
 * Accepted members first, then people still to accept. An invite for someone who
 * has already accepted is dropped, so a race between accepting and a stale invite
 * list cannot show the same climber twice.
 */
export function groupRoster(
  members: { user_id: string }[],
  invites: { invited_user: string }[],
): { userId: string; pending: boolean }[] {
  const accepted = new Set(members.map(m => m.user_id))
  return [
    ...members.map(m => ({ userId: m.user_id, pending: false })),
    ...invites.filter(i => !accepted.has(i.invited_user)).map(i => ({ userId: i.invited_user, pending: true })),
  ]
}
