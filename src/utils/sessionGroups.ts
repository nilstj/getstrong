/** Where a climber stands on one boulder of a shared session. */
export type BoulderStatus = 'none' | 'project' | 'sent'

/** One entry on a session group's shared boulder list. */
export interface GroupBoulder {
  id: string
  gym_problem_id: string | null
  grade_system: string
  grade_value: string | null
  grade_value_font: string | null
  grade_value_vscale: string | null
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
  gym_problem_id: string | null
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
 * A direct `group_boulder_id` match wins. Failing that, an entry that has no
 * `group_boulder_id` yet (logged by hand before the boulder joined the list) is
 * matched by `gym_problem_id`, so a hand-logged send isn't shown as "not logged"
 * and re-logged into a duplicate row. Every entry is claimed by at most one
 * boulder -- `claimed` tracks ids already matched (by either path) and the
 * fallback refuses a candidate already in that set, so two list boulders that
 * happen to share a `gym_problem_id` cannot both claim the same entry.
 *
 * Status is derived, never stored: no entry means the boulder is on the wall but
 * not in your log and costs you nothing; an unsent entry is a project whether or
 * not it has tries; a sent entry is a send. Ordering follows the list, so rows do
 * not move as you log.
 */
export function boulderRows(boulders: GroupBoulder[], mine: MyEntry[]): BoulderRow[] {
  const byGroupBoulder = new Map<string, MyEntry>()
  for (const e of mine) {
    if (e.group_boulder_id) byGroupBoulder.set(e.group_boulder_id, e)
  }
  // Fallback pool for hand-logged entries not yet linked to a list entry.
  const byGymProblem = new Map<string, MyEntry>()
  for (const e of mine) {
    if (!e.group_boulder_id && e.gym_problem_id) byGymProblem.set(e.gym_problem_id, e)
  }
  const claimed = new Set<string>()

  return [...boulders]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(boulder => {
      let e = byGroupBoulder.get(boulder.id)
      if (!e && boulder.gym_problem_id) {
        const candidate = byGymProblem.get(boulder.gym_problem_id)
        if (candidate && !claimed.has(candidate.id)) e = candidate
      }
      if (e) claimed.add(e.id)
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
