import { describe, it, expect } from 'vitest'
import { filterGymSuggestions } from '../gymSuggestions'
import type { GymSuggestion } from '../../types'

const list: GymSuggestion[] = [
  { name: 'Boulders Oslo', uses: 40 },
  { name: 'Klatreverket', uses: 25 },
  { name: 'Boulderhuset', uses: 10 },
  { name: 'Tjuvholmen', uses: 3 },
]

describe('filterGymSuggestions', () => {
  it('returns the top N (popular-first) for an empty query', () => {
    expect(filterGymSuggestions(list, '', 2)).toEqual(['Boulders Oslo', 'Klatreverket'])
  })
  it('matches a case-insensitive substring, preserving popular-first order', () => {
    expect(filterGymSuggestions(list, 'boul')).toEqual(['Boulders Oslo', 'Boulderhuset'])
  })
  it('trims the query', () => {
    expect(filterGymSuggestions(list, '  klat ')).toEqual(['Klatreverket'])
  })
  it('caps results at the limit', () => {
    expect(filterGymSuggestions(list, '', 1)).toEqual(['Boulders Oslo'])
  })
  it('returns an empty array when nothing matches', () => {
    expect(filterGymSuggestions(list, 'zzz')).toEqual([])
  })
})
