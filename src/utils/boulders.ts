export function boulderTitle(gp: { name: string | null; color: string | null; wall_angle: string | null }): string {
  return gp.name || `${gp.color ?? ''} ${gp.wall_angle ?? ''}`.trim() || 'Shared boulder'
}

export function countMembersByBoulder(
  rows: { gym_problem_id: string | null; user_id: string }[],
): Record<string, number> {
  const byBoulder = new Map<string, Set<string>>()
  for (const r of rows) {
    if (!r.gym_problem_id) continue
    let set = byBoulder.get(r.gym_problem_id)
    if (!set) {
      set = new Set()
      byBoulder.set(r.gym_problem_id, set)
    }
    set.add(r.user_id)
  }
  const out: Record<string, number> = {}
  for (const [id, set] of byBoulder) out[id] = set.size
  return out
}
