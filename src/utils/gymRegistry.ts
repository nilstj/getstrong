/**
 * Gym identity. A gym is a row in the `gyms` registry, but the *string*
 * (`gyms.label`) is still the join key in problems.gym, sessions.location and
 * ten other columns — so folding has to be stable and has to agree with
 * public.fold_gym_text in migration 092.
 *
 * The SQL fold is authoritative. If these two drift, the failure mode is
 * benign: this one misses a duplicate hint, the climber submits anyway, and
 * create_gym returns the row that already exists. Drift degrades to
 * "converges regardless", never to a duplicate row.
 */

// Characters that do not decompose under NFD, so the combining-mark strip
// below can't reach them. Keep in sync with the replace() chain in 092.
const NON_DECOMPOSING: Record<string, string> = {
  æ: 'ae', ø: 'o', œ: 'oe', ß: 'ss', đ: 'd', ł: 'l',
}

/**
 * Case, whitespace, punctuation and diacritics folded away: the comparable
 * form of a gym string. `'Klatreverket - Torshov'` -> `'klatreverket torshov'`.
 *
 * Falls back to the collapsed lowercase original when folding would empty the
 * string — otherwise every non-latin gym name would share the key '' and get
 * merged into one row, which is the exact fork this file exists to prevent.
 */
export function foldGymText(s: string): string {
  const lower = (s ?? '').toLowerCase()
  const folded = lower
    .replace(/[æøœßđł]/g, c => NON_DECOMPOSING[c] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  if (folded !== '') return folded
  return lower.replace(/\s+/g, ' ').trim()
}

/**
 * The uniqueness key for a gym. Name and city are joined with a space BEFORE
 * folding, deliberately leaving no boundary between them: a legacy
 * `'Klatreverket, Torshov'` (whole string in `name`, city null) and a later
 * `name: 'Klatreverket', city: 'Torshov'` must collide rather than become two
 * rows for one building.
 */
export function canonicalGymKey(name: string, city?: string | null): string {
  return foldGymText(`${name ?? ''} ${city ?? ''}`)
}

/** The display string, and the value written into every gym column. */
export function gymLabel(name: string, city?: string | null): string {
  const n = (name ?? '').trim()
  const c = (city ?? '').trim()
  return c === '' ? n : `${n}, ${c}`
}

/**
 * A junk filter, NOT a joke filter. No regex detects "Dave's Mum's Garage";
 * joke names are handled by `verified`, by admin rename/merge, and by
 * gyms.created_by recording who typed it.
 */
export function isPlausibleGymName(name: string): boolean {
  const t = (name ?? '').trim()
  if (t.length < 2 || t.length > 60) return false
  // Four or more identical characters in a row is mashing, not a name.
  if (/(.)\1{3,}/.test(t)) return false
  // Must contain something letter-ish. foldGymText keeps the original for
  // non-latin scripts, so stripping digits and spaces from the fold leaves
  // Cyrillic and friends intact while rejecting '1234' and '!!!!'.
  if (foldGymText(t).replace(/[0-9\s]/g, '') === '') return false
  return true
}
