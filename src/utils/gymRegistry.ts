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

import type { GymOption } from '../types'

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
    .replace(/[\u0300-\u036f]/g, '')
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

/**
 * Optimal string alignment distance: insertions, deletions, substitutions and
 * adjacent transpositions, each costing 1. Transposition matters here —
 * 'Kaltreverket' is one keystroke from 'Klatreverket', and plain Levenshtein
 * would score it 2 and miss it at the short-name threshold.
 */
export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const d: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) d[i][0] = i
  for (let j = 0; j <= b.length; j++) d[0][j] = j

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[a.length][b.length]
}

export interface GymMatch {
  gym: GymOption
  /** exact = same canonical key. branch = same name, different city. */
  reason: 'exact' | 'branch' | 'similar'
}

/** Containment below this length matches half the list, so it doesn't count. */
const MIN_CONTAINMENT_LENGTH = 4

/** One edit for a short name, two for a medium one, three for a long one. */
function editThreshold(len: number): number {
  if (len <= 5) return 1
  if (len <= 10) return 2
  return 3
}

/**
 * Gyms that might already be the one being added. Deliberately fuzzier than
 * canonicalGymKey: the key decides identity, this decides what to warn about.
 * Ranked exact -> branch -> similar, ties broken by most-used.
 */
export function nearDuplicateGyms(
  name: string,
  city: string | null,
  list: GymOption[],
  limit = 5,
): GymMatch[] {
  const key = canonicalGymKey(name, city)
  const foldedName = foldGymText(name)
  if (foldedName === '') return []

  const scored: { match: GymMatch; score: number }[] = []

  for (const candidate of list) {
    const candidateKey = canonicalGymKey(candidate.name, candidate.city)
    const candidateName = foldGymText(candidate.name)

    if (candidateKey === key) {
      scored.push({ match: { gym: candidate, reason: 'exact' }, score: 0 })
      continue
    }
    if (candidateName === foldedName) {
      scored.push({ match: { gym: candidate, reason: 'branch' }, score: 1 })
      continue
    }

    const shorter = Math.min(candidateName.length, foldedName.length)
    const contained = candidateName.includes(foldedName) || foldedName.includes(candidateName)
    if (contained && shorter >= MIN_CONTAINMENT_LENGTH) {
      scored.push({ match: { gym: candidate, reason: 'similar' }, score: 2 })
      continue
    }

    const distance = damerauLevenshtein(candidateName, foldedName)
    if (distance <= editThreshold(Math.max(candidateName.length, foldedName.length))) {
      scored.push({ match: { gym: candidate, reason: 'similar' }, score: 3 + distance })
    }
  }

  return scored
    .sort((a, b) => a.score - b.score || b.match.gym.uses - a.match.gym.uses)
    .slice(0, limit)
    .map(s => s.match)
}

/**
 * The picker's list. Verified gyms first (an admin has said "this is a real
 * gym"), then most-used. The query is folded, so 'klatreverket torshov' finds
 * 'Klatreverket, Torshov'.
 */
export function filterGyms(list: GymOption[], query: string, limit = 8): GymOption[] {
  const q = foldGymText(query)
  const matches = q === ''
    ? [...list]
    : list.filter(g => canonicalGymKey(g.name, g.city).includes(q) || foldGymText(g.label).includes(q))
  return matches
    .sort((a, b) => Number(b.verified) - Number(a.verified) || b.uses - a.uses)
    .slice(0, limit)
}
