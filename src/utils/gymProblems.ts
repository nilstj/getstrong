import type { GymProblem, GymProblemMatchCriteria } from '../types'

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

export function gymProblemMatches(
  gp: Pick<GymProblem, 'gym' | 'color' | 'status'>,
  c: GymProblemMatchCriteria,
): boolean {
  if (gp.status !== 'active') return false
  if (!norm(c.gym) || !norm(c.color)) return false
  return norm(gp.gym) === norm(c.gym) && norm(gp.color) === norm(c.color)
}

// Whole days from `now` to the date-only `dateStr` (e.g. expires_at). Floored.
export function daysUntil(dateStr: string, now: Date): number {
  const target = new Date(`${dateStr}T00:00:00Z`).getTime()
  const today = new Date(
    `${now.toISOString().slice(0, 10)}T00:00:00Z`,
  ).getTime()
  return Math.round((target - today) / 86_400_000)
}

// A shared boulder counts as active only while it is status-active AND not past
// its expiry (inclusive of the expiry day, matching the "N days left" display).
export function isActiveBoulder(
  gp: { status: string; expires_at: string },
  now: Date,
): boolean {
  return gp.status === 'active' && daysUntil(gp.expires_at, now) >= 0
}
