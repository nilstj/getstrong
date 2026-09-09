import { describe, it, expect } from 'vitest'
import { foldGymText, canonicalGymKey, gymLabel, isPlausibleGymName, damerauLevenshtein, nearDuplicateGyms, filterGyms } from '../gymRegistry'
import type { GymOption } from '../../types'

describe('foldGymText', () => {
  it('lowercases and trims', () => {
    expect(foldGymText('  Klatreverket ')).toBe('klatreverket')
  })
  it('collapses internal whitespace', () => {
    expect(foldGymText('Boulders   Oslo')).toBe('boulders oslo')
  })
  it('turns punctuation into a single space', () => {
    expect(foldGymText('Klatreverket - Torshov')).toBe('klatreverket torshov')
    expect(foldGymText('Klatreverket, Torshov')).toBe('klatreverket torshov')
    expect(foldGymText('St. Hanshaugen')).toBe('st hanshaugen')
  })
  it('folds Nordic characters', () => {
    expect(foldGymText('Bålerud')).toBe('balerud')
    expect(foldGymText('Tøyen')).toBe('toyen')
    expect(foldGymText('Færder')).toBe('faerder')
  })
  it('folds other common diacritics', () => {
    expect(foldGymText('Café Blocs')).toBe('cafe blocs')
    expect(foldGymText('Múnchen')).toBe('munchen')
  })
  it('keeps digits', () => {
    expect(foldGymText('Blocs 24')).toBe('blocs 24')
  })
  it('falls back to the collapsed original when folding would empty the string', () => {
    // A non-latin name must not fold to '' — every such gym would share one key.
    expect(foldGymText('Скала')).toBe('скала')
    expect(foldGymText('  Скала   Юг ')).toBe('скала юг')
  })
})

describe('canonicalGymKey', () => {
  it('folds name and city into one key with no boundary', () => {
    expect(canonicalGymKey('Klatreverket', 'Torshov')).toBe('klatreverket torshov')
  })
  it('gives a legacy single-string name the same key as the split form', () => {
    expect(canonicalGymKey('Klatreverket, Torshov', null)).toBe(canonicalGymKey('Klatreverket', 'Torshov'))
  })
  it('treats a missing city as an empty one', () => {
    expect(canonicalGymKey('Klatreverket')).toBe('klatreverket')
    expect(canonicalGymKey('Klatreverket', '')).toBe('klatreverket')
    expect(canonicalGymKey('Klatreverket', '  ')).toBe('klatreverket')
  })
  it('is case- and whitespace-insensitive', () => {
    expect(canonicalGymKey(' KLATREVERKET ', ' torshov ')).toBe('klatreverket torshov')
  })
})

describe('gymLabel', () => {
  it('joins name and city with a comma', () => {
    expect(gymLabel('Klatreverket', 'Torshov')).toBe('Klatreverket, Torshov')
  })
  it('is the trimmed name alone when there is no city', () => {
    expect(gymLabel('  Klatreverket ', null)).toBe('Klatreverket')
    expect(gymLabel('Klatreverket', '   ')).toBe('Klatreverket')
    expect(gymLabel('Klatreverket')).toBe('Klatreverket')
  })
})

describe('isPlausibleGymName', () => {
  it('accepts a normal gym name', () => {
    expect(isPlausibleGymName('Klatreverket')).toBe(true)
    expect(isPlausibleGymName('Blocs 24')).toBe(true)
    expect(isPlausibleGymName('Скала')).toBe(true)
  })
  it('rejects too short and too long', () => {
    expect(isPlausibleGymName('K')).toBe(false)
    expect(isPlausibleGymName(' ')).toBe(false)
    expect(isPlausibleGymName('ab'.repeat(30))).toBe(true)  // exactly 60
    expect(isPlausibleGymName('ab'.repeat(31))).toBe(false) // 62
  })
  it('rejects a string with no letters', () => {
    expect(isPlausibleGymName('1234')).toBe(false)
    expect(isPlausibleGymName('!!!!')).toBe(false)
  })
  it('accepts a non-latin name containing digits', () => {
    // Folds to '24', so a fold-based letter test would reject it.
    expect(isPlausibleGymName('Скала 24')).toBe(true)
  })
  it('still rejects digits and punctuation with no letters anywhere', () => {
    expect(isPlausibleGymName('24 24')).toBe(false)
    expect(isPlausibleGymName('!!! ???')).toBe(false)
  })
  it('rejects four or more identical characters in a row', () => {
    expect(isPlausibleGymName('aaaa')).toBe(false)
    expect(isPlausibleGymName('Boulderssss')).toBe(false)
    expect(isPlausibleGymName('Boulders')).toBe(true) // 'ss' is fine
  })
})

function gym(name: string, city: string | null = null, extra: Partial<GymOption> = {}): GymOption {
  return {
    id: `id-${name}-${city ?? ''}`,
    name,
    city,
    label: city ? `${name}, ${city}` : name,
    verified: false,
    climber_added: false,
    uses: 0,
    ...extra,
  }
}

describe('damerauLevenshtein', () => {
  it('is 0 for identical strings', () => {
    expect(damerauLevenshtein('klatreverket', 'klatreverket')).toBe(0)
  })
  it('counts a single insertion, deletion and substitution as 1', () => {
    expect(damerauLevenshtein('klatreverket', 'klatreverkeet')).toBe(1)
    expect(damerauLevenshtein('klatreverket', 'klatreverke')).toBe(1)
    expect(damerauLevenshtein('klatreverket', 'klatreverkat')).toBe(1)
  })
  it('counts a transposition as 1, not 2', () => {
    expect(damerauLevenshtein('klatreverket', 'kaltreverket')).toBe(1)
  })
  it('handles an empty string', () => {
    expect(damerauLevenshtein('', 'abc')).toBe(3)
    expect(damerauLevenshtein('abc', '')).toBe(3)
    expect(damerauLevenshtein('', '')).toBe(0)
  })
})

describe('nearDuplicateGyms', () => {
  const list = [
    gym('Klatreverket', 'Torshov', { uses: 40, verified: true }),
    gym('Boulders Oslo', null, { uses: 30 }),
    gym('Boulderhuset', null, { uses: 5 }),
  ]

  it('reports an exact canonical-key match first', () => {
    const hits = nearDuplicateGyms('klatreverket', 'TORSHOV', list)
    expect(hits[0].reason).toBe('exact')
    expect(hits[0].gym.label).toBe('Klatreverket, Torshov')
  })
  it('matches a legacy single-string name against the split form', () => {
    const hits = nearDuplicateGyms('Klatreverket, Torshov', null, list)
    expect(hits[0].reason).toBe('exact')
  })
  it('flags a same-name different-city gym as a branch, ranked above similar', () => {
    const hits = nearDuplicateGyms('Klatreverket', 'Løren', list)
    expect(hits[0].reason).toBe('branch')
    expect(hits[0].gym.city).toBe('Torshov')
  })
  it('catches a misspelling', () => {
    expect(nearDuplicateGyms('Klatreverkeet', 'Torshov', list)[0].gym.name).toBe('Klatreverket')
  })
  it('catches a transposition', () => {
    expect(nearDuplicateGyms('Kaltreverket', 'Torshov', list)[0].gym.name).toBe('Klatreverket')
  })
  it('catches containment', () => {
    const hits = nearDuplicateGyms('Boulders', null, list)
    expect(hits.map(h => h.gym.name)).toContain('Boulders Oslo')
  })
  it('does not treat a very short query as containment', () => {
    // 'Bo' is inside half the list; matching on it would warn on everything.
    expect(nearDuplicateGyms('Bo', null, list)).toEqual([])
  })
  it('returns nothing for a genuinely new gym', () => {
    expect(nearDuplicateGyms('Tjuvholmen Klatresenter', 'Oslo', list)).toEqual([])
  })
  it('breaks ties on uses, most-used first', () => {
    const twins = [gym('Blocs', null, { uses: 2 }), gym('Blocz', null, { uses: 9 })]
    expect(nearDuplicateGyms('Bloco', null, twins)[0].gym.name).toBe('Blocz')
  })
  it('caps the number of candidates', () => {
    const many = ['Blocs', 'Blocz', 'Bloco', 'Blocx', 'Blocy', 'Blocw'].map(n => gym(n))
    expect(nearDuplicateGyms('Bloca', null, many, 3)).toHaveLength(3)
  })
})

describe('filterGyms', () => {
  const list = [
    gym('Boulderhuset', null, { uses: 5 }),
    gym('Boulders Oslo', null, { uses: 30 }),
    gym('Klatreverket', 'Torshov', { uses: 40, verified: true }),
  ]

  it('puts verified gyms first, then most-used', () => {
    expect(filterGyms(list, '').map(g => g.name)).toEqual(['Klatreverket', 'Boulders Oslo', 'Boulderhuset'])
  })
  it('matches a folded substring of the label', () => {
    expect(filterGyms(list, 'boul').map(g => g.name)).toEqual(['Boulders Oslo', 'Boulderhuset'])
  })
  it('ignores case, accents and punctuation in the query', () => {
    expect(filterGyms(list, ' KLATREVERKET, torshov ').map(g => g.name)).toEqual(['Klatreverket'])
  })
  it('matches on city too', () => {
    expect(filterGyms(list, 'torshov').map(g => g.name)).toEqual(['Klatreverket'])
  })
  it('caps results at the limit', () => {
    expect(filterGyms(list, '', 1).map(g => g.name)).toEqual(['Klatreverket'])
  })
  it('returns an empty array when nothing matches', () => {
    expect(filterGyms(list, 'zzz')).toEqual([])
  })
})
