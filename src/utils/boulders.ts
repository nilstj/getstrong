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

/**
 * "the blue 6C" — how a climber refers to a boulder out loud, for a sentence
 * that has to name one ("Ada posted beta on the blue 6C").
 *
 * The colour is lowercased because it appears mid-sentence; the grade is left
 * exactly as stored, since grades are written "6C" and "V4".
 *
 * Falls back to "a boulder" rather than to the boulder's title: names were
 * removed from the app, so a title is a wall angle or a generic label and would
 * read "the overhang". Same fallback FeedCard uses.
 */
export function boulderColorGradeLabel(
  b: { color: string | null; community_grade: string | null },
): string {
  const colorGrade = [b.color?.toLowerCase(), b.community_grade].filter(Boolean).join(' ')
  return colorGrade ? `the ${colorGrade}` : 'a boulder'
}
