import type { BoulderBeta } from '../types'

/** Rank beta by what worked: most "worked for me" first, then most recent. */
export function betaSort(a: BoulderBeta, b: BoulderBeta): number {
  if (b.worked_count !== a.worked_count) return b.worked_count - a.worked_count
  return b.created_at.localeCompare(a.created_at)
}
