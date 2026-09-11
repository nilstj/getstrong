export function boulderTitle(gp: { name: string | null; color: string | null; wall_angle: string | null }): string {
  return gp.name || `${gp.color ?? ''} ${gp.wall_angle ?? ''}`.trim() || 'Shared boulder'
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

/** How many tiles the home strip shows. */
export const LATEST_STRIP_LIMIT = 12

/**
 * What the home strip shows: boulders that carry a photo, newest set first.
 *
 * The photo filter is the strip's half of "a shared boulder needs a photo".
 * Publishing one without a photo isn't possible any more, but boulders created
 * before that rule are still in the database — they keep their place on the gym
 * problems page and stay reachable by link. They just don't get a home tile,
 * where a photo-less boulder is a grey square nobody can match to a wall.
 */
export function latestStripBoulders<T extends { image_url: string | null; set_at: string }>(
  ...lists: T[][]
): T[] {
  return lists
    .flat()
    .filter(b => !!b.image_url)
    .sort((a, b) => (a.set_at < b.set_at ? 1 : a.set_at > b.set_at ? -1 : 0))
    .slice(0, LATEST_STRIP_LIMIT)
}
