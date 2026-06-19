import type { CrewState, CrewMember, CrewSummary, CrewProblemRow } from '../types'

export function deriveMemberState(problems: { sent: boolean; attempts: number }[]): CrewState {
  let sent = false
  for (const p of problems) {
    if (p.sent && p.attempts === 1) return 'flashed'
    if (p.sent) sent = true
  }
  return sent ? 'sent' : 'projecting'
}

export function buildCrew(rows: CrewProblemRow[]): CrewMember[] {
  const byUser = new Map<string, CrewProblemRow[]>()
  for (const r of rows) {
    const list = byUser.get(r.user_id)
    if (list) list.push(r)
    else byUser.set(r.user_id, [r])
  }

  const members: CrewMember[] = []
  for (const [user_id, list] of byUser) {
    const joined_at = list.reduce((min, r) => (r.created_at < min ? r.created_at : min), list[0].created_at)
    members.push({
      user_id,
      username: list[0].username,
      avatar_url: list[0].avatar_url,
      state: deriveMemberState(list),
      joined_at,
    })
  }
  members.sort((a, b) => (a.joined_at < b.joined_at ? -1 : a.joined_at > b.joined_at ? 1 : 0))
  return members
}

export function summarizeCrew(members: { state: CrewState }[]): CrewSummary {
  const total = members.length
  const flashed = members.filter(m => m.state === 'flashed').length
  const sent = members.filter(m => m.state === 'sent' || m.state === 'flashed').length
  return { total, sent, flashed, sendRate: total > 0 ? sent / total : 0 }
}
