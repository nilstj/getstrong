import type { GymSuggestion } from '../types'

export function filterGymSuggestions(
  list: GymSuggestion[],
  query: string,
  limit = 8,
): string[] {
  const q = query.trim().toLowerCase()
  const matches = q === '' ? list : list.filter(g => g.name.toLowerCase().includes(q))
  return matches.slice(0, limit).map(g => g.name)
}
