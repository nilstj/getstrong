import type { BoulderBeta } from '../types'

/**
 * Rank beta for the boulder page: cautions first — what hurts people outranks
 * what sends fastest — then, within each group, most "worked for me" and most
 * recent. A caution's worked_count is its "me too" count, so the same tie-break
 * ranks corroboration.
 */
export function betaSort(a: BoulderBeta, b: BoulderBeta): number {
  const aCaution = a.kind === 'caution'
  const bCaution = b.kind === 'caution'
  if (aCaution !== bCaution) return aCaution ? -1 : 1
  if (b.worked_count !== a.worked_count) return b.worked_count - a.worked_count
  return b.created_at.localeCompare(a.created_at)
}
