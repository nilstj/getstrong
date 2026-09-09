# Gym Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-text gym entry with a canonical `gyms` registry that climbers can still add to, so a misspelling stops forking a gym into two boulder lists and two leaderboards.

**Architecture:** A `gyms` table owns which gym names exist. The gym **string stays the join key** — `gyms.label` is what gets written into `problems.gym`, `sessions.location` and the other ten columns, so every existing query, RPC, leaderboard and util keeps working untouched. Writes to `gyms` go only through `SECURITY DEFINER` RPCs. A new `GymPicker` replaces `GymInput` at all four surfaces and can only emit a label that exists in the registry; creating a gym becomes a deliberate act behind a near-duplicate check.

**Tech Stack:** React 18 + TypeScript, Vite, React Query (array query keys), Supabase/Postgres (plpgsql, RLS, `SECURITY DEFINER`), Tailwind (`sage`/`khaki`), `lucide-react`, `react-hot-toast`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-08-gym-registry-design.md`

## Global Constraints

- **Branch:** `feature/gym-registry` (already created, spec already committed).
- **Build:** `npm run build` = `tsc -b && vite build`. `noUnusedLocals` and `noUnusedParameters` are ON — an unused local or import is a build-failing error, which fails the Vercel deploy. This plan deletes files; stranded imports will break the build.
- **Lint baseline measured 2026-09-08: `16 problems (15 errors, 1 warning)`.** New work must add **zero**. Re-measure with `npm run lint` before Task 1 in case the tree has moved.
- **Tests:** Vitest, and **only pure functions in `src/utils/`** are tested. There is no `@testing-library/react` — do not add one. Components and hooks are verified by `npm run build` plus the manual pass in Task 9.
- **Migrations are applied BY HAND in the Supabase dashboard**, never by tooling from this repo. Migration `092` must be applied before the client that needs it is deployed.
- **`gym_suggestions()`'s return shape must stay additive** — `name` and `uses` keep their existing meaning so the currently deployed client keeps working between the migration apply and the client deploy. `name` returns the **label**, because the deployed client writes `g.name` straight into `problems.gym`.
- **Creating a gym must never award `beta_points`.** A points path with no guard is farmable.
- Points-awarding and cross-table-write functions are `SECURITY DEFINER` because `gyms` has no write policy; points must never be mintable by a client.
- **`BottomSheet` must be a sibling of a heading, never a child** — it inherits font weight and is invalid markup inside one.
- Vocabulary: "log" is the private per-session action, "create"/"publish" is the public one. A gym is neither — the copy for adding a gym says **"add"**.

---

### Task 1: Fold, key, label and plausibility utils

The canonical key must fold **across** the name/city boundary — see the spec's "Why `canonical_key` folds across the name/city boundary". A separator would let a backfilled `"Klatreverket, Torshov"` and a later `name: "Klatreverket", city: "Torshov"` become two rows for one building.

**Files:**
- Create: `src/utils/gymRegistry.ts`
- Create: `src/utils/__tests__/gymRegistry.test.ts`
- Modify: `src/types/index.ts` (append `GymOption`, near the existing `GymSuggestion` at line 342)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `foldGymText(s: string): string`
  - `canonicalGymKey(name: string, city?: string | null): string`
  - `gymLabel(name: string, city?: string | null): string`
  - `isPlausibleGymName(name: string): boolean`
  - `interface GymOption { id: string; name: string; city: string | null; label: string; verified: boolean; climber_added: boolean; uses: number }` (in `src/types/index.ts`)

- [ ] **Step 1: Add the `GymOption` type**

Append to `src/types/index.ts`, directly after the existing `GymSuggestion` interface:

```ts
/**
 * A row from the gyms registry, as the picker sees it. `label` is the string
 * written into problems.gym / sessions.location / etc — never `name` alone.
 * `climber_added` is true for gyms a climber created (backfilled rows have
 * created_by null), which is what the "new" chip keys off.
 */
export interface GymOption {
  id: string
  name: string
  city: string | null
  label: string
  verified: boolean
  climber_added: boolean
  uses: number
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/utils/__tests__/gymRegistry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { foldGymText, canonicalGymKey, gymLabel, isPlausibleGymName } from '../gymRegistry'

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
  it('rejects four or more identical characters in a row', () => {
    expect(isPlausibleGymName('aaaa')).toBe(false)
    expect(isPlausibleGymName('Boulderssss')).toBe(false)
    expect(isPlausibleGymName('Boulders')).toBe(true) // 'ss' is fine
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/gymRegistry.test.ts`
Expected: FAIL — `Failed to resolve import "../gymRegistry"`.

- [ ] **Step 4: Write the implementation**

Create `src/utils/gymRegistry.ts`:

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/gymRegistry.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 6: Verify the build and lint**

Run: `npm run build`
Expected: exit 0.

Run: `npm run lint 2>&1 | tail -3`
Expected: still `16 problems (15 errors, 1 warning)`.

- [ ] **Step 7: Commit**

```bash
git add src/utils/gymRegistry.ts src/utils/__tests__/gymRegistry.test.ts src/types/index.ts
git commit -m "Fold a gym name and city into one canonical key"
```

---

### Task 2: Near-duplicate detection and registry filtering

This is the part that actually catches `"Klatreverkeet"`. It is deliberately **fuzzier than the uniqueness key** — the key decides identity, this decides what to warn about.

**Files:**
- Modify: `src/utils/gymRegistry.ts` (append)
- Modify: `src/utils/__tests__/gymRegistry.test.ts` (append)

**Interfaces:**
- Consumes: `foldGymText`, `canonicalGymKey` (Task 1); `GymOption` (Task 1).
- Produces:
  - `damerauLevenshtein(a: string, b: string): number`
  - `interface GymMatch { gym: GymOption; reason: 'exact' | 'branch' | 'similar' }`
  - `nearDuplicateGyms(name: string, city: string | null, list: GymOption[], limit?: number): GymMatch[]`
  - `filterGyms(list: GymOption[], query: string, limit?: number): GymOption[]`

- [ ] **Step 1: Write the failing tests**

Append to `src/utils/__tests__/gymRegistry.test.ts` (and extend the import on line 2 to include `damerauLevenshtein`, `nearDuplicateGyms`, `filterGyms`; add `import type { GymOption } from '../../types'`):

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/gymRegistry.test.ts`
Expected: FAIL — `damerauLevenshtein is not a function` (or an import error).

- [ ] **Step 3: Write the implementation**

Append to `src/utils/gymRegistry.ts` (and add `import type { GymOption } from '../types'` at the top of the file):

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/gymRegistry.test.ts`
Expected: PASS, 37 tests (17 from Task 1 plus 20 here).

- [ ] **Step 5: Run the whole suite, build and lint**

Run: `npx vitest run`
Expected: PASS, no regressions.

Run: `npm run build && npm run lint 2>&1 | tail -3`
Expected: build exit 0; lint still `16 problems`.

- [ ] **Step 6: Commit**

```bash
git add src/utils/gymRegistry.ts src/utils/__tests__/gymRegistry.test.ts
git commit -m "Warn on a near-duplicate gym before creating one"
```

---

### Task 3: Migration 092 — registry table, RPCs, backfill

One file, applied by hand as one paste. Order inside it matters: fold function -> table -> `rewrite_gym_label` -> the RPCs -> backfill -> replace `gym_suggestions`. Replacing the suggestion function before the backfill would show an empty picker to everyone in that window.

**Files:**
- Create: `supabase/migrations/092_gym_registry.sql`

**Interfaces:**
- Consumes: existing tables `sessions`, `problems`, `gym_problems`, `beta_points`, `profiles`, `crews`, `crew_plans`, `gym_gradings`, `crew_award_rounds`, `session_groups`, `wall_announcements`, `shared_projects`.
- Produces (called by Tasks 4 and 8):
  - `public.fold_gym_text(p text) -> text` (immutable)
  - `public.create_gym(p_name text, p_city text) -> table (id uuid, name text, city text, label text, verified boolean, climber_added boolean)`
  - `public.rename_gym(p_id uuid, p_name text, p_city text) -> void`
  - `public.merge_gyms(p_from uuid, p_to uuid) -> void`
  - `public.set_gym_verified(p_id uuid, p_verified boolean) -> void`
  - `public.gym_merge_impact(p_from text) -> table (problems bigint, boulders bigint, sessions bigint, session_groups bigint, crews bigint, crew_plans bigint, award_rounds bigint, gradings bigint, climbers bigint, announcements bigint)`
  - `public.gym_suggestions() -> table (name text, uses bigint, id uuid, gym_name text, city text, label text, verified boolean, climber_added boolean)` — **`name` is the label**, for the deployed client.

- [ ] **Step 1: Write the header, the fold function and the table**

Create `supabase/migrations/092_gym_registry.sql`:

```sql
-- A canonical gym registry that climbers can still add to.
--
-- Until now a gym was free text, and because that text is the de facto join
-- key in twelve columns, a misspelling forked the gym: two shared-boulder
-- lists, two beta-points leaderboards, two grading configs, two award rounds,
-- one building. Beta stopped moving between climbers standing next to each
-- other.
--
-- This installs a `gyms` table that owns WHICH NAMES EXIST, while the STRING
-- stays the join key: gyms.label is what still gets written into problems.gym,
-- sessions.location and the rest, so every existing query, RPC, leaderboard
-- and util keeps working untouched. Design:
-- docs/superpowers/specs/2026-09-08-gym-registry-design.md
--
-- Nothing here awards beta_points, and create_gym must never start to: a
-- points path with no guard is farmable, and "type a name, get points" would
-- be the easiest farm in the app.
--
-- RELEASE GATE: apply this before deploying the client that uses GymPicker.
-- The gym_suggestions() rewrite at the foot of this file is deliberately
-- ADDITIVE (name and uses keep their meaning, name returns the label) so the
-- currently deployed client keeps working in between.

-- ── the fold ─────────────────────────────────────────────────────────────────
-- Case, whitespace, punctuation and diacritics folded away. This is the
-- authoritative definition; src/utils/gymRegistry.ts mirrors it for the UI's
-- duplicate hints. If they drift, create_gym's idempotent return means the
-- climber still converges on the existing row.
--
-- IMMUTABLE because lower/replace/translate/regexp_replace all are, and
-- because create_gym uses it inside a lookup.
--
-- The fallback matters: a name in a non-latin script strips to '' under
-- [^a-z0-9], and every such gym would then share the key '' and be treated as
-- one gym — the exact fork this file exists to prevent.
create or replace function public.fold_gym_text(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      btrim(
        regexp_replace(
          translate(
            replace(replace(replace(replace(replace(replace(
              lower(coalesce(p, '')),
              'æ', 'ae'), 'ø', 'o'), 'œ', 'oe'), 'ß', 'ss'), 'đ', 'd'), 'ł', 'l'),
            'åäàáâãöòóôõüùúûèéêëìíîïçñýÿšžčć',
            'aaaaaaooooouuuueeeeiiiicnyyszcc'
          ),
          '[^a-z0-9]+', ' ', 'g'
        )
      ),
      ''
    ),
    btrim(regexp_replace(lower(coalesce(p, '')), '\s+', ' ', 'g'))
  );
$$;

-- ── the registry ─────────────────────────────────────────────────────────────
-- label is the load-bearing column: it is the string every other table stores.
-- Unique on label is what makes two Klatreverket branches distinct rows rather
-- than a collision.
--
-- canonical_key folds ACROSS the name/city boundary (no separator) on purpose:
-- the backfill below puts whole legacy strings into `name` with city null, so
-- 'Klatreverket, Torshov' and a later name 'Klatreverket' + city 'Torshov'
-- must collide. Same label therefore implies same canonical_key, which makes
-- gyms_label_idx a cheap invariant rather than a second line of defence.
--
-- label and canonical_key are plain columns maintained by the RPCs, not
-- generated columns: the fold rules will need tuning, and altering a generated
-- column means dropping it and its unique index — a hand-applied migration
-- best not written twice. The RPCs are the only writer, so drift is
-- unreachable.
create table if not exists gyms (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  city          text,
  label         text not null,
  canonical_key text not null,
  verified      boolean not null default false,
  created_by    uuid references auth.users(id) on delete set null,
  merged_into   uuid references gyms(id),
  created_at    timestamptz not null default now()
);
create unique index if not exists gyms_canonical_key_idx on gyms (canonical_key);
create unique index if not exists gyms_label_idx on gyms (label);
create index if not exists gyms_merged_into_idx on gyms (merged_into) where merged_into is not null;

alter table gyms enable row level security;

-- Everyone signed in can read the registry — the picker needs it.
create policy "gyms readable by authenticated users"
  on gyms for select
  using (auth.role() = 'authenticated');

-- No insert/update/delete policy AT ALL, deliberately. Every write goes
-- through the SECURITY DEFINER functions below, the same shape 071 uses for
-- gym_gradings. A client cannot invent, rename or merge a gym directly.
```

- [ ] **Step 2: Append `rewrite_gym_label`**

This is the one function that has to know all twelve columns. A rewrite that misses one silently orphans data.

```sql
-- ── the rewrite ──────────────────────────────────────────────────────────────
-- Moves every stored occurrence of one gym string to another. Used by
-- rename_gym, merge_gyms AND the backfill — the backfill is a merge, just many
-- at once.
--
-- Twelve columns hold a gym string. The list was verified by grep against the
-- migrations, and a miss here strands rows on a label with no registry row:
--   sessions.location (001)          problems.gym (011)
--   shared_projects.gym (018)        wall_announcements.location (027)
--   gym_problems.gym (044)           beta_points.gym (046)
--   profiles.default_gyms (060, text[])
--   crews.home_gym (062)             crew_plans.gym (066)
--   gym_gradings.gym (071)           crew_award_rounds.gym (079)
--   session_groups.gym (080)
--
-- Two of those carry a unique constraint the rewrite can collide with:
-- gym_gradings (gym, color_name) and crew_award_rounds (crew_id, round_date,
-- gym). Rule, per the design: THE TARGET'S ROW WINS, the source's is deleted.
-- Deleting an award round cascades to its participants, votes, tags and notes
-- (all four reference crew_award_rounds(id) on delete cascade in 079), so a
-- discarded round takes its voting with it. gym_merge_impact reports the count
-- so an admin sees that before confirming.
--
-- No RLS concerns: SECURITY DEFINER, and it is only reachable from the
-- admin-gated functions below and from this file's own backfill.
create or replace function public.rewrite_gym_label(p_from text, p_to text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(btrim(p_from), '') = '' or coalesce(btrim(p_to), '') = '' then
    raise exception 'rewrite_gym_label: both labels are required';
  end if;
  if p_from = p_to then
    return;
  end if;

  update public.sessions           set location = p_to where location = p_from;
  update public.problems           set gym      = p_to where gym      = p_from;
  update public.shared_projects    set gym      = p_to where gym      = p_from;
  update public.wall_announcements set location = p_to where location = p_from;
  update public.gym_problems       set gym      = p_to where gym      = p_from;
  update public.beta_points        set gym      = p_to where gym      = p_from;
  update public.crews              set home_gym = p_to where home_gym = p_from;
  update public.crew_plans         set gym      = p_to where gym      = p_from;
  update public.session_groups     set gym      = p_to where gym      = p_from;

  -- Target wins per colour: drop the source's row only where the target
  -- already configures that colour, then move what is left.
  delete from public.gym_gradings src
   where src.gym = p_from
     and exists (
       select 1 from public.gym_gradings t
        where t.gym = p_to and t.color_name = src.color_name
     );
  update public.gym_gradings set gym = p_to where gym = p_from;

  -- Target wins per (crew, date). The cascade takes participants and votes
  -- with it; gym_merge_impact reports this as discarded.
  delete from public.crew_award_rounds src
   where src.gym = p_from
     and exists (
       select 1 from public.crew_award_rounds t
        where t.gym = p_to and t.crew_id = src.crew_id and t.round_date = src.round_date
     );
  update public.crew_award_rounds set gym = p_to where gym = p_from;

  -- profiles.default_gyms is an ordered text[] whose FIRST element is the
  -- climber's primary gym, so a naive array_agg(distinct) would silently
  -- reshuffle which gym is primary. Rebuild it with ordinality, keeping each
  -- gym's earliest position and dropping the duplicate a rewrite can create
  -- when a climber had both spellings.
  with expanded as (
    select p.id,
           case when u.g = p_from then p_to else u.g end as gym,
           u.ord
      from public.profiles p,
           unnest(p.default_gyms) with ordinality as u(g, ord)
     where p.default_gyms @> array[p_from]
  ),
  deduped as (
    select distinct on (id, gym) id, gym, ord
      from expanded
     order by id, gym, ord
  ),
  rebuilt as (
    select id, array_agg(gym order by ord) as arr
      from deduped
     group by id
  )
  update public.profiles p
     set default_gyms = r.arr
    from rebuilt r
   where p.id = r.id;
end;
$$;
```

- [ ] **Step 3: Append `create_gym`**

```sql
-- ── create ───────────────────────────────────────────────────────────────────
-- Any signed-in climber can add a gym: someone standing in an unlisted gym is
-- never blocked. IDEMPOTENT rather than erroring — on an existing
-- canonical_key it returns the row that already exists, so two climbers adding
-- the same gym from opposite ends of the bouldering room converge instead of
-- one of them seeing a failure. That is also what makes a TS/SQL fold
-- disagreement benign.
--
-- created_by is recorded (it is what makes a joke name attributable, and what
-- the picker's "new" chip keys off via climber_added) but never returned:
-- gym_suggestions and this function expose a boolean, not a user id.
--
-- Awards nothing. See the file header.
create or replace function public.create_gym(p_name text, p_city text)
returns table (id uuid, name text, city text, label text, verified boolean, climber_added boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_name  text := nullif(btrim(coalesce(p_name, '')), '');
  v_city  text := nullif(btrim(coalesce(p_city, '')), '');
  v_label text;
  v_key   text;
begin
  if v_user is null then
    raise exception 'You must be signed in to add a gym';
  end if;
  if v_name is null then
    raise exception 'A gym name is required';
  end if;
  if length(v_name) > 60 or length(coalesce(v_city, '')) > 60 then
    raise exception 'That name is too long';
  end if;

  v_label := case when v_city is null then v_name else v_name || ', ' || v_city end;
  v_key   := public.fold_gym_text(v_name || ' ' || coalesce(v_city, ''));

  insert into public.gyms (name, city, label, canonical_key, created_by)
  values (v_name, v_city, v_label, v_key, v_user)
  on conflict (canonical_key) do nothing;

  -- Whether we just inserted it or it was already there, resolve through any
  -- merge so the caller is handed the live gym rather than a retired row.
  -- One hop is enough: merge_gyms resolves its target to a live row AND
  -- repoints everything that pointed at the source, so merged_into never
  -- references a retired gym.
  return query
    with resolved as (
      select coalesce(m.id, g.id) as gid
        from public.gyms g
        left join public.gyms m on m.id = g.merged_into
       where g.canonical_key = v_key
    )
    select g.id, g.name, g.city, g.label, g.verified, g.created_by is not null
      from public.gyms g
      join resolved r on r.gid = g.id;
end;
$$;

grant execute on function public.create_gym(text, text) to authenticated;
```

- [ ] **Step 4: Append the admin functions**

```sql
-- ── admin ────────────────────────────────────────────────────────────────────
-- is_admin only, NOT is_setter. A setter can edit gradings (071), which writes
-- one table; these rewrite twelve columns. Different blast radius, different
-- gate.
create or replace function public.assert_gym_admin()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and is_admin = true
  ) then
    raise exception 'Only admins can manage gyms';
  end if;
end;
$$;

-- Renaming into an existing canonical key RAISES rather than quietly becoming
-- a merge. Renaming 'Klatreverkeet' to 'Klatreverket' when 'Klatreverket'
-- already exists IS a merge, and silently performing one would rewrite data
-- under an admin who asked for a rename.
create or replace function public.rename_gym(p_id uuid, p_name text, p_city text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old   public.gyms;
  v_name  text := nullif(btrim(coalesce(p_name, '')), '');
  v_city  text := nullif(btrim(coalesce(p_city, '')), '');
  v_label text;
  v_key   text;
begin
  perform public.assert_gym_admin();

  select * into v_old from public.gyms where id = p_id;
  if v_old.id is null then
    raise exception 'No such gym';
  end if;
  if v_old.merged_into is not null then
    raise exception 'That gym has been merged away — rename the gym it was merged into';
  end if;
  if v_name is null then
    raise exception 'A gym name is required';
  end if;

  v_label := case when v_city is null then v_name else v_name || ', ' || v_city end;
  v_key   := public.fold_gym_text(v_name || ' ' || coalesce(v_city, ''));

  if exists (select 1 from public.gyms where canonical_key = v_key and id <> p_id) then
    raise exception 'A gym with that name already exists — merge into it instead of renaming';
  end if;

  perform public.rewrite_gym_label(v_old.label, v_label);

  update public.gyms
     set name = v_name, city = v_city, label = v_label, canonical_key = v_key
   where id = p_id;
end;
$$;

-- Merging follows the target's merged_into chain to its final live row, so a
-- chain can never strand rows on an intermediate. The source keeps its row
-- (with merged_into set) so a stale client's string still resolves; the picker
-- drops it via `where merged_into is null`.
create or replace function public.merge_gyms(p_from uuid, p_to uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.gyms;
  v_to   public.gyms;
  v_hops int := 0;
begin
  perform public.assert_gym_admin();

  select * into v_from from public.gyms where id = p_from;
  select * into v_to   from public.gyms where id = p_to;
  if v_from.id is null or v_to.id is null then
    raise exception 'No such gym';
  end if;
  if v_from.merged_into is not null then
    raise exception 'That gym has already been merged';
  end if;

  while v_to.merged_into is not null and v_hops < 10 loop
    select * into v_to from public.gyms where id = v_to.merged_into;
    v_hops := v_hops + 1;
  end loop;
  if v_to.merged_into is not null then
    raise exception 'The target gym is part of a merge chain that is too long';
  end if;
  if v_from.id = v_to.id then
    raise exception 'A gym cannot be merged into itself';
  end if;

  perform public.rewrite_gym_label(v_from.label, v_to.label);
  update public.gyms set merged_into = v_to.id where id = v_from.id;

  -- Keep the invariant that merged_into always points at a LIVE gym. Without
  -- this, merging A into B and later B into C leaves A pointing at a retired
  -- row, and create_gym's single-hop resolve would hand a caller a dead gym.
  update public.gyms set merged_into = v_to.id
   where merged_into = v_from.id and id <> v_to.id;
end;
$$;

create or replace function public.set_gym_verified(p_id uuid, p_verified boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_gym_admin();
  update public.gyms set verified = coalesce(p_verified, false) where id = p_id;
  if not found then
    raise exception 'No such gym';
  end if;
end;
$$;

-- What a merge would rewrite, so the confirm can state the damage before doing
-- it. Read-only, but SECURITY DEFINER because sessions are not globally
-- readable — and admin-gated for the same reason.
create or replace function public.gym_merge_impact(p_from text)
returns table (
  problems bigint, boulders bigint, sessions bigint, session_groups bigint,
  crews bigint, crew_plans bigint, award_rounds bigint, gradings bigint,
  climbers bigint, announcements bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_gym_admin();
  return query
    select
      (select count(*) from public.problems           where gym      = p_from),
      (select count(*) from public.gym_problems       where gym      = p_from),
      (select count(*) from public.sessions           where location = p_from),
      (select count(*) from public.session_groups     where gym      = p_from),
      (select count(*) from public.crews              where home_gym = p_from),
      (select count(*) from public.crew_plans         where gym      = p_from),
      (select count(*) from public.crew_award_rounds  where gym      = p_from),
      (select count(*) from public.gym_gradings       where gym      = p_from),
      (select count(*) from public.profiles           where default_gyms @> array[p_from]),
      (select count(*) from public.wall_announcements where location = p_from);
end;
$$;

grant execute on function public.rename_gym(uuid, text, text)   to authenticated;
grant execute on function public.merge_gyms(uuid, uuid)         to authenticated;
grant execute on function public.set_gym_verified(uuid, boolean) to authenticated;
grant execute on function public.gym_merge_impact(text)          to authenticated;
```

- [ ] **Step 5: Append the backfill**

```sql
-- ── backfill ─────────────────────────────────────────────────────────────────
-- One gyms row per distinct canonical key, gathered from every column that
-- holds a gym string, with the MOST-USED spelling winning the display name —
-- the crowd is a decent speller in aggregate.
--
-- The name/city split is deliberately NOT guessed: the whole legacy string
-- goes into `name` with city null. A wrong split is worse than no split, and
-- admin rename fixes it deliberately. This is why canonical_key has to fold
-- across the boundary.
--
-- created_by stays null for these rows, which is what lets the picker show its
-- "new" chip only for gyms a climber added: day one does not paint every gym
-- in the app as unverified, and no existing typo gets auto-blessed as verified
-- either.
do $$
declare
  r record;
begin
  create temp table gym_seed on commit drop as
  select btrim(g) as raw, count(*) as uses
    from (
      select location as g from public.sessions
      union all select gym      from public.problems
      union all select gym      from public.shared_projects
      union all select location from public.wall_announcements
      union all select gym      from public.gym_problems
      union all select gym      from public.beta_points
      union all select home_gym from public.crews
      union all select gym      from public.crew_plans
      union all select gym      from public.gym_gradings
      union all select gym      from public.crew_award_rounds
      union all select gym      from public.session_groups
      union all select unnest(default_gyms) from public.profiles
    ) s(g)
   where coalesce(btrim(g), '') <> ''
   group by btrim(g);

  insert into public.gyms (name, city, label, canonical_key, verified, created_by)
  select distinct on (public.fold_gym_text(s.raw))
         s.raw, null, s.raw, public.fold_gym_text(s.raw), false, null
    from gym_seed s
   order by public.fold_gym_text(s.raw), s.uses desc, s.raw asc
  on conflict (canonical_key) do nothing;

  -- Now collapse the variants for real. Without this the registry would look
  -- clean while the data stayed forked — a nicer picker over the same two
  -- leaderboards.
  for r in
    select s.raw as from_label, g.label as to_label
      from gym_seed s
      join public.gyms g on g.canonical_key = public.fold_gym_text(s.raw)
     where s.raw <> g.label
  loop
    perform public.rewrite_gym_label(r.from_label, r.to_label);
    raise notice 'backfill: % -> %', r.from_label, r.to_label;
  end loop;
end $$;
```

- [ ] **Step 6: Append the `gym_suggestions` replacement**

```sql
-- ── suggestions ──────────────────────────────────────────────────────────────
-- Was: distinct strings scraped from sessions and problems — a list derived
-- from the polluted data, so junk kept recommending itself. Now: registry
-- rows, with usage counts, excluding anything merged away.
--
-- ADDITIVE return shape, and this is load-bearing for the release gate.
-- `name` and `uses` keep their existing meaning and `name` returns the LABEL,
-- because the currently deployed client writes g.name straight into
-- problems.gym. It keeps working between this apply and the client deploy;
-- the new columns are simply ignored by it.
--
-- Still SECURITY DEFINER for 050's reason: sessions are not globally readable,
-- and the counts read them.
create or replace function public.gym_suggestions()
returns table (
  name text, uses bigint, id uuid, gym_name text, city text,
  label text, verified boolean, climber_added boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with usage as (
    select g as label, count(*) as uses
      from (
        select location as g from public.sessions
        union all select gym from public.problems
        union all select gym from public.gym_problems
      ) s(g)
     where coalesce(btrim(g), '') <> ''
     group by g
  )
  select gy.label, coalesce(u.uses, 0), gy.id, gy.name, gy.city,
         gy.label, gy.verified, gy.created_by is not null
    from public.gyms gy
    left join usage u on u.label = gy.label
   where gy.merged_into is null
   order by gy.verified desc, coalesce(u.uses, 0) desc, gy.label asc;
$$;

grant execute on function public.gym_suggestions() to authenticated, anon;
```

- [ ] **Step 7: Append the closing smoke block**

A plpgsql body is not validated at `CREATE`, so a clean apply proves nothing — this file could install perfectly and still raise on the first climber's tap. This block calls every function for real.

```sql
-- ── smoke ────────────────────────────────────────────────────────────────────
-- plpgsql bodies are NOT validated at CREATE: every function above could
-- install cleanly and still raise on its first call, under a climber's thumb
-- rather than in front of the operator who can act on it. So call them here,
-- for real, and roll back what they write.
--
-- The fold cases mirror src/utils/__tests__/gymRegistry.test.ts. If these two
-- ever disagree, this is where it should be caught.
do $$
declare
  v_gym    record;
  v_impact record;
begin
  -- fold: the same vectors the Vitest suite asserts
  assert public.fold_gym_text('  Klatreverket ')      = 'klatreverket',        'fold: trim/lower';
  assert public.fold_gym_text('Boulders   Oslo')      = 'boulders oslo',       'fold: whitespace';
  assert public.fold_gym_text('Klatreverket - Torshov') = 'klatreverket torshov', 'fold: punctuation';
  assert public.fold_gym_text('Klatreverket, Torshov') = 'klatreverket torshov', 'fold: comma';
  assert public.fold_gym_text('Bålerud')              = 'balerud',             'fold: a-ring';
  assert public.fold_gym_text('Tøyen')                = 'toyen',               'fold: o-slash';
  assert public.fold_gym_text('Færder')               = 'faerder',             'fold: ae';
  assert public.fold_gym_text('Café Blocs')           = 'cafe blocs',          'fold: acute';
  assert public.fold_gym_text('Blocs 24')             = 'blocs 24',            'fold: digits';
  assert public.fold_gym_text('Скала')                = 'скала',               'fold: non-latin fallback';
  assert public.fold_gym_text('Klatreverket' || ' ' || '') = public.fold_gym_text('Klatreverket'),
         'fold: empty city adds nothing';

  -- create_gym, twice: the second call must return the first row, not fail
  select * into v_gym from public.create_gym('Smoke Test Wall', 'Nowhere');
  assert v_gym.label = 'Smoke Test Wall, Nowhere', 'create_gym: label';
  assert v_gym.climber_added, 'create_gym: climber_added';
  select * into v_gym from public.create_gym('  smoke test wall  ', 'NOWHERE');
  assert v_gym.label = 'Smoke Test Wall, Nowhere', 'create_gym: idempotent on a folded match';
  -- and the legacy single-string form must land on the same row
  select * into v_gym from public.create_gym('Smoke Test Wall, Nowhere', null);
  assert v_gym.label = 'Smoke Test Wall, Nowhere', 'create_gym: legacy form folds to the same key';

  -- rewrite_gym_label: every one of the twelve statements planned and run.
  -- Both labels exist and neither is in use, so this writes nothing while
  -- still forcing parse analysis of every column reference.
  select * into v_gym from public.create_gym('Smoke Test Wall Two', 'Nowhere');
  assert v_gym.label = 'Smoke Test Wall Two, Nowhere', 'create_gym: second smoke gym';
  perform public.rewrite_gym_label('Smoke Test Wall, Nowhere', 'Smoke Test Wall Two, Nowhere');

  -- admin-gated functions: reachable only behind assert_gym_admin, so prove
  -- the guard fires rather than trying to pass it. Three outcomes, and only
  -- one of them is a pass:
  --   no raise           -> the guard is not guarding
  --   the wrong message  -> the body is broken, which is the very thing this
  --                         smoke block exists to catch; a handler that
  --                         accepted any error would mask it
  --   its guard message  -> pass
  begin
    perform public.assert_gym_admin();
    -- Reached only if the guard let a non-admin through. The migration runs
    -- with auth.uid() null, so the guard's select finds no profile and raises.
    raise exception 'assert_gym_admin: expected a raise for a non-admin caller';
  exception when others then
    if sqlerrm = 'assert_gym_admin: expected a raise for a non-admin caller' then
      raise;
    elsif sqlerrm <> 'Only admins can manage gyms' then
      raise exception 'assert_gym_admin raised "%" instead of its guard message — its body is broken, not guarding', sqlerrm;
    end if;
    raise notice 'assert_gym_admin raised as expected: %', sqlerrm;
  end;

  -- gym_merge_impact's body past its guard: run the same ten counts inline so
  -- every column reference in it is parsed and planned here.
  select
    (select count(*) from public.problems           where gym      = 'x'),
    (select count(*) from public.gym_problems       where gym      = 'x'),
    (select count(*) from public.sessions           where location = 'x'),
    (select count(*) from public.session_groups     where gym      = 'x'),
    (select count(*) from public.crews              where home_gym = 'x'),
    (select count(*) from public.crew_plans         where gym      = 'x'),
    (select count(*) from public.crew_award_rounds  where gym      = 'x'),
    (select count(*) from public.gym_gradings       where gym      = 'x'),
    (select count(*) from public.profiles           where default_gyms @> array['x']),
    (select count(*) from public.wall_announcements where location = 'x')
    into v_impact;

  -- gym_suggestions must still answer, and must not list the smoke rows once
  -- they are gone.
  perform 1 from public.gym_suggestions() limit 1;

  delete from public.gyms where canonical_key in (
    public.fold_gym_text('Smoke Test Wall Nowhere'),
    public.fold_gym_text('Smoke Test Wall Two Nowhere')
  );

  raise notice 'gym registry: fold vectors, create_gym (x3, idempotent), rewrite_gym_label (all twelve columns), the admin guard, gym_merge_impact''s ten counts and gym_suggestions all ran; smoke rows removed';
end $$;
```

> **Review corrections applied after this task was implemented.** The SQL blocks above are the as-planned version; `supabase/migrations/092_gym_registry.sql` is authoritative. A review of the committed file found it could not be applied, and these corrections landed on top:
>
> 1. **`gym_suggestions` needs `drop function if exists` before the create.** `RETURNS TABLE` columns are OUT parameters, so adding columns changes the return type and `create or replace` raises `cannot change return type of existing function`. The whole paste is one transaction, so this made the file unappliable.
> 2. **`rewrite_gym_label` and `assert_gym_admin` are revoked from `public`, `anon` and `authenticated`.** `CREATE FUNCTION` grants EXECUTE to PUBLIC by default, so a `SECURITY DEFINER` function with no authorization check of its own was an unauthenticated remote path to a twelve-column rewrite plus cascading deletes. 079 documents the same trap, including that grants are cumulative so `from public` is required too.
> 3. **The smoke block sets `request.jwt.claims` before calling `create_gym`.** `auth.uid()` is null in the dashboard, so `create_gym` raised and the block never ran. It now borrows a real `profiles.id` (`created_by` has an FK to `auth.users`, so a synthetic uuid fails the insert), impersonates an admin where one exists so the four admin bodies actually execute, and drives the guard test off a random uuid so it is deterministic regardless of who applies the file. It skips with a loud NOTICE naming the unvalidated bodies where no profile or no admin exists.
> 4. **The backfill seeds the stored value, not just its trimmed form.** `rewrite_gym_label` matches on exact equality, so grouping only on `btrim` left `'Klatreverket '` unrewritten — and the loop's own filter skipped it, because the winner's label *is* the trimmed form. Those rows would have kept a string matching no `gyms.label`, invisible in every picker: the exact fork this migration exists to remove.
> 5. **A prerequisite guard runs first**, naming any of 060/071/079/080 that is unapplied, per 091's precedent.
> 6. **`drop policy if exists` before `create policy`**, so the file is re-runnable after a failed apply.
>
> Two limits are now documented in the file rather than fixed: the SQL fold's enumerated `translate()` list is narrower than the TypeScript NFD-strip (a missed hint, the benign direction), and a mixed-script name keeps only its ASCII, so `'Скала 24'` and `'Вертикаль 24'` would collide. Neither matters for Norwegian gyms.

- [ ] **Step 8: Check the file parses as one paste**

There is no local Postgres in this project — migrations are applied by hand. Verify the file's shape before handing it to the dashboard:

Run: `grep -c '^\$\$;\|^as \$\$' supabase/migrations/092_gym_registry.sql`
Expected: a non-zero count, and every `$$` opened is closed — eyeball the file top to bottom once.

Run: `grep -n "create or replace function\|create table\|create policy\|do \$\$" supabase/migrations/092_gym_registry.sql`
Expected, in this order: `fold_gym_text`, `create table gyms`, the policy, `rewrite_gym_label`, `create_gym`, `assert_gym_admin`, `rename_gym`, `merge_gyms`, `set_gym_verified`, `gym_merge_impact`, the backfill `do $$`, `gym_suggestions`, the smoke `do $$`.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/092_gym_registry.sql
git commit -m "Add a gyms registry, its RPCs and a backfill of every gym string"
```

- [ ] **Step 10: Apply it in the Supabase dashboard**

**This is a manual step and it gates Tasks 4-9's verification.** Confirm the applied state of the pending stack first — notes say `084, 085, 089, 090, 091` are unapplied, and 092 must not jump the queue even though its backfill only needs tables from 071/079/080.

1. Open the Supabase dashboard SQL editor.
2. Confirm 084, 085, 089, 090, 091 are applied; apply any that are not, in order.
3. Paste `092_gym_registry.sql` whole and run it.
4. Read the `NOTICE` output. Expect the backfill's `x -> y` lines for every variant it collapsed, then the final `gym registry: ...` notice. **A raise here means stop** — nothing below is safe to verify.
5. Spot-check: `select label, verified, created_by is not null as climber_added from gyms order by label;` — one row per real gym, no near-duplicates, `created_by` null throughout.
6. Spot-check the collapse: `select gym, count(*) from problems group by gym order by 2 desc;` — every value should appear in `gyms.label`.

Applying now is safe for the live app: `gym_suggestions`'s new shape is additive and its `name` is the label, which is what the deployed client writes.

---

### Task 4: Registry types and hooks

**Files:**
- Modify: `src/types/index.ts` (replace the `GymSuggestion` interface at line 342)
- Modify: `src/hooks/useGymSuggestions.ts`

**Interfaces:**
- Consumes: `GymOption` (Task 1); `gym_suggestions()`, `create_gym()` (Task 3).
- Produces:
  - `useGymSuggestions(): UseQueryResult<GymOption[]>` — same hook name and query key `['gym_suggestions']` as today, now returning `GymOption[]`
  - `useCreateGym(): UseMutationResult<GymOption, unknown, { name: string; city: string | null }>`

- [ ] **Step 1: Leave `GymSuggestion` in place**

No edit to `src/types/index.ts` in this task. `GymSuggestion` still has a live consumer — `filterGymSuggestions` in `src/utils/gymSuggestions.ts` — and Task 7 deletes the type and that file together.

This is what keeps the branch green at every commit. `GymOption` carries both `name` and `uses`, so it is structurally assignable to `GymSuggestion`: after this task `useGymSuggestions` returns `GymOption[]`, and the existing `filterGymSuggestions(suggestions, value)` call in `GymInput` still type-checks against it.

Note what that does **not** fix. Call sites reading `.name` as if it were the label (`DefaultGymsEditor`'s `popular`, `AddGymBoulderSheet`, `GymGradingPage`) still compile, but `.name` is now the **bare gym name** rather than the label — type-clean and semantically wrong. `tsc` cannot see it. Task 7 Step 3 moves them to `.label`; do not treat their compiling here as evidence they are correct.

- [ ] **Step 2: Rewrite the hook file**

Replace the whole contents of `src/hooks/useGymSuggestions.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { GymOption } from '../types'

/** The raw shape gym_suggestions() returns. `name` is the label — see 092. */
interface GymSuggestionRow {
  name: string
  uses: number | string
  id: string
  gym_name: string
  city: string | null
  label: string
  verified: boolean
  climber_added: boolean
}

/**
 * What create_gym returns — its own shape, not gym_suggestions'. `name` here
 * is the bare gym name (gym_suggestions returns the label under that key for
 * the deployed client's sake), so this maps straight onto GymOption.
 */
interface CreateGymRow {
  id: string
  name: string
  city: string | null
  label: string
  verified: boolean
  climber_added: boolean
}

function toGymOption(row: GymSuggestionRow): GymOption {
  return {
    id: row.id,
    name: row.gym_name,
    city: row.city,
    label: row.label,
    verified: row.verified,
    climber_added: row.climber_added,
    uses: Number(row.uses) || 0,
  }
}

/**
 * The gym registry, most relevant first. Query key unchanged from the
 * free-text era so nothing else's invalidation has to move.
 */
export function useGymSuggestions() {
  return useQuery({
    queryKey: ['gym_suggestions'],
    queryFn: async (): Promise<GymOption[]> => {
      const { data, error } = await supabase.rpc('gym_suggestions')
      if (error) throw error
      return ((data ?? []) as GymSuggestionRow[]).map(toGymOption)
    },
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Adds a gym. create_gym is idempotent, so a racing duplicate comes back as
 * the existing row rather than an error — the caller can treat every success
 * as "here is your gym".
 */
export function useCreateGym() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, city }: { name: string; city: string | null }): Promise<GymOption> => {
      const { data, error } = await supabase.rpc('create_gym', { p_name: name, p_city: city })
      if (error) throw error
      const row = (data as CreateGymRow[] | null)?.[0]
      if (!row) throw new Error('The gym could not be added')
      return { ...row, uses: 0 }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym_suggestions'] })
    },
  })
}
```

- [ ] **Step 3: Verify the build, tests and lint are green**

Run: `npm run build`
Expected: exit 0. A failure here means `GymOption` is not lining up with the old `GymSuggestion` shape — check that Task 1's interface carries both `name` and `uses`.

Run: `npx vitest run && npm run lint 2>&1 | tail -3`
Expected: tests PASS; lint `16 problems (15 errors, 1 warning)`.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useGymSuggestions.ts
git commit -m "Read the gym registry, and add a gym through create_gym"
```

---

### Task 5: `GymPicker` — selection only

The component that stops free text. Typing filters; it does **not** set the value. Only selecting a row does.

**Files:**
- Create: `src/components/GymPicker.tsx`

**Interfaces:**
- Consumes: `useGymSuggestions` (Task 4); `filterGyms` (Task 2); `GymOption` (Task 1).
- Produces: `<GymPicker value onChange placeholder id onCommit onAddRequest />` where
  `value: string` (a label), `onChange: (label: string) => void`, `placeholder?: string`,
  `id?: string`, `onCommit?: () => void`, `onAddRequest?: (typed: string) => void`,
  `clearOnSelect?: boolean`.

- [ ] **Step 1: Write the component**

Create `src/components/GymPicker.tsx`:

```tsx
import { useState, useRef, useEffect } from 'react'
import { Check, Plus } from 'lucide-react'
import { useGymSuggestions } from '../hooks/useGymSuggestions'
import { filterGyms } from '../utils/gymRegistry'

/**
 * Picks a gym from the registry. Deliberately NOT a text field for the gym
 * name: typing filters the list, and only tapping a row sets the value. That
 * is the whole point — a typo can no longer fork a gym into two boulder lists
 * and two leaderboards by being written straight through.
 *
 * A genuinely new gym goes through onAddRequest, which GymPicker's parent
 * answers with the add sheet (AddGymSheet). Same props as the GymInput it
 * replaces, plus that callback, so the four call sites barely change.
 */
export function GymPicker({
  value, onChange, placeholder, id, onCommit, onAddRequest, clearOnSelect = false,
}: {
  value: string
  onChange: (label: string) => void
  placeholder?: string
  id?: string
  onCommit?: () => void
  onAddRequest?: (typed: string) => void
  /**
   * For an "add another" control whose `value` never changes (DefaultGymsEditor):
   * empty the field after a pick instead of leaving the chosen gym sitting in
   * it. Without this the effect below never re-fires — `value` stayed `''` —
   * and the last-added gym would look like it was still selected.
   */
  clearOnSelect?: boolean
}) {
  const { data: gyms = [] } = useGymSuggestions()
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // A value set from outside (a default-gym pill, a form reset) has to show.
  useEffect(() => { setQuery(value) }, [value])

  const matches = filterGyms(gyms, query)
  const typed = query.trim()
  const exact = gyms.some(g => g.label.toLowerCase() === typed.toLowerCase())

  const select = (label: string) => {
    if (blurTimer.current) clearTimeout(blurTimer.current)
    onChange(label)
    setQuery(clearOnSelect ? '' : label)
    setOpen(false)
    onCommit?.()
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay so a suggestion mousedown/click registers before we close.
          blurTimer.current = setTimeout(() => {
            setOpen(false)
            // Half-typed text must not sit in the field looking committed —
            // nothing was selected, so show what actually is selected.
            setQuery(value)
            onCommit?.()
          }, 150)
        }}
        className="w-full border rounded-lg px-3 py-2.5"
      />
      {open && (
        <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {matches.map(gym => (
            <li key={gym.id}>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()} /* keep input focus so the click lands */
                onClick={() => select(gym.label)}
                className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm hover:bg-sage-50"
              >
                <span className="flex-1">{gym.label}</span>
                {gym.climber_added && !gym.verified && (
                  <span className="rounded-full bg-khaki-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-khaki-700">
                    new
                  </span>
                )}
                {gym.label === value && <Check className="h-4 w-4 text-sage-700" />}
              </button>
            </li>
          ))}
          {onAddRequest && typed !== '' && !exact && (
            <li className="border-t border-gray-100">
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  if (blurTimer.current) clearTimeout(blurTimer.current)
                  setOpen(false)
                  onAddRequest(typed)
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-medium text-sage-700 hover:bg-sage-50"
              >
                <Plus className="h-4 w-4" />
                Can't find "{typed}"? Add it
              </button>
            </li>
          )}
          {matches.length === 0 && (typed === '' || exact || !onAddRequest) && (
            <li className="px-3 py-2 text-sm text-gray-400">No gyms yet</li>
          )}
        </ul>
      )}
    </div>
  )
}
```

> **Review corrections applied after this task was implemented.** The code block above is the as-planned version; `src/components/GymPicker.tsx` is authoritative.
>
> 1. **`role="combobox"` and `aria-expanded` removed.** The popup is a plain `<ul>` of buttons with no `aria-controls`, `listbox`/`option` roles or arrow-key navigation, so the attributes announced keyboard semantics that did not exist — worse than the `GymInput` they replace, which claimed nothing. Owner chose removal over building the full ARIA combobox pattern; Tab and Enter still reach and activate every row.
> 2. **The `[value]` sync effect became a render-time adjustment.** The effect tripped `react-hooks/set-state-in-effect` on a textbook instance of what that rule catches, and needed an `eslint-disable` to hold the lint baseline. React's documented "adjusting state when a prop changes" pattern removes the suppression and the extra render pass that flashed stale text for a frame.
> 3. **The blur timer is cleared on unmount.** Without it, a sheet closing inside the 150ms window still fired `onCommit` against a torn-down parent closure.
> 4. **`exact` now folds with `foldGymText`** rather than `toLowerCase`, matching how `filterGyms` matches. An accented label that was already listed used to also offer "Add it". The empty state's now-unreachable `exact` term went with it.
>
> Step 2 below is stale: this project's Tailwind config is `tailwind.config.ts`, not `.js`, and `khaki-100`/`khaki-700` are both confirmed present.

- [ ] **Step 2: Check the `khaki` shades exist**

Run: `grep -n "khaki" tailwind.config.js`
Expected: a `khaki` palette with `100` and `700`. If those two shades are absent, use the shades that are defined (or `sage`), rather than adding new ones.

- [ ] **Step 3: Build, test and lint green, then commit**

Run: `npm run build && npx vitest run && npm run lint 2>&1 | tail -3`
Expected: build exit 0, tests PASS, lint `16 problems`. `GymPicker` has no consumer yet — an exported component that nothing imports is fine, `noUnusedLocals` only flags unused locals inside a file.

```bash
git add src/components/GymPicker.tsx
git commit -m "Pick a gym from the registry instead of typing one"
```

---

### Task 6: `AddGymSheet` — the deliberate create, behind a duplicate check

**Files:**
- Create: `src/components/AddGymSheet.tsx`

**Interfaces:**
- Consumes: `useCreateGym`, `useGymSuggestions` (Task 4); `nearDuplicateGyms`, `isPlausibleGymName`, `gymLabel` (Tasks 1-2); `BottomSheet`; `errorMessage` from `src/utils/errors.ts`.
- Produces: `<AddGymSheet open initialName onClose onAdded />` where `onAdded: (label: string) => void`.

- [ ] **Step 1: Write the component**

Create `src/components/AddGymSheet.tsx`:

```tsx
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { BottomSheet } from './BottomSheet'
import { useCreateGym, useGymSuggestions } from '../hooks/useGymSuggestions'
import { nearDuplicateGyms, isPlausibleGymName, gymLabel } from '../utils/gymRegistry'
import { errorMessage } from '../utils/errors'
import type { GymMatch } from '../utils/gymRegistry'

const INPUT = 'w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500'

function reasonLabel(reason: GymMatch['reason']): string {
  if (reason === 'exact') return 'Same gym'
  if (reason === 'branch') return 'Another branch'
  return 'Very similar'
}

/**
 * Adding a gym, as a deliberate act. A climber standing in an unlisted gym is
 * never blocked — but the near-duplicate check goes in front of the create, so
 * "Klatreverkeet" gets one chance to become "Klatreverket" before it becomes a
 * second boulder list and a second leaderboard.
 */
export function AddGymSheet({
  open, initialName, onClose, onAdded,
}: {
  open: boolean
  initialName: string
  onClose: () => void
  onAdded: (label: string) => void
}) {
  const { data: gyms = [] } = useGymSuggestions()
  const create = useCreateGym()
  const [name, setName] = useState(initialName)
  const [city, setCity] = useState('')
  const [candidates, setCandidates] = useState<GymMatch[] | null>(null)

  useEffect(() => {
    if (open) { setName(initialName); setCity(''); setCandidates(null) }
  }, [open, initialName])

  const trimmedCity = city.trim() === '' ? null : city.trim()

  const add = async () => {
    try {
      const gym = await create.mutateAsync({ name: name.trim(), city: trimmedCity })
      onAdded(gym.label)
      toast.success(`Added ${gym.label}`)
      onClose()
    } catch (e) {
      // A Supabase { data, error } throw is not an Error instance, so
      // e instanceof Error is false and e.message is the only way to the
      // server's actual reason.
      toast.error(errorMessage(e, 'Could not add that gym'))
    }
  }

  const check = () => {
    if (!isPlausibleGymName(name)) {
      toast.error('That does not look like a gym name')
      return
    }
    const hits = nearDuplicateGyms(name.trim(), trimmedCity, gyms)
    if (hits.length > 0) { setCandidates(hits); return }
    void add()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Add a gym">
      {candidates === null ? (
        <div className="space-y-4">
          <div>
            <label htmlFor="add-gym-name" className="block text-sm font-medium text-gray-700 mb-1">Gym</label>
            <input
              id="add-gym-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Klatreverket"
              className={INPUT}
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="add-gym-city" className="block text-sm font-medium text-gray-700 mb-1">
              City or area <span className="text-gray-400">(optional)</span>
            </label>
            <input
              id="add-gym-city"
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="e.g. Torshov"
              className={INPUT}
            />
            <p className="mt-1 text-xs text-gray-400">
              Chains have branches — this is what keeps them apart.
            </p>
          </div>
          <p className="text-xs text-gray-400">
            Will be listed as <span className="font-medium text-gray-600">{gymLabel(name, trimmedCity) || '…'}</span>
          </p>
          <button
            type="button"
            onClick={check}
            disabled={name.trim() === '' || create.isPending}
            className="w-full rounded-lg bg-sage-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {create.isPending ? 'Adding…' : 'Add gym'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Is it one of these? Picking an existing gym keeps everyone's beta in one place.
          </p>
          <ul className="space-y-2">
            {candidates.map(({ gym, reason }) => (
              <li key={gym.id}>
                <button
                  type="button"
                  onClick={() => { onAdded(gym.label); onClose() }}
                  className="w-full flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-left hover:bg-sage-50"
                >
                  <span className="flex-1 text-sm font-medium">{gym.label}</span>
                  <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-400">
                    {reasonLabel(reason)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void add()}
            disabled={create.isPending}
            className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 disabled:opacity-40"
          >
            {create.isPending ? 'Adding…' : `No — add ${gymLabel(name, trimmedCity)}`}
          </button>
        </div>
      )}
    </BottomSheet>
  )
}
```

- [ ] **Step 2: Build, test and lint green, then commit**

Run: `npm run build && npx vitest run && npm run lint 2>&1 | tail -3`
Expected: build exit 0, tests PASS, lint `16 problems`. Like `GymPicker`, this component has no consumer until Task 7.

```bash
git add src/components/AddGymSheet.tsx
git commit -m "Check for a near-duplicate before adding a gym"
```

---

### Task 7: Swap the four call sites, delete the free-text path

This is the task that turns the build green again. Four surfaces mint gym strings today; all four move to `GymPicker`, and the old free-text path is deleted rather than left dark.

**Files:**
- Modify: `src/components/AddGymBoulderSheet.tsx` (import at line 6, `resolveGym` at 58-63, its use at 108, `GymInput` at 147)
- Modify: `src/components/DefaultGymsEditor.tsx`
- Modify: `src/pages/NewSessionPage.tsx` (import at line 7, `GymInput` at line 78)
- Modify: `src/pages/GymGradingPage.tsx` (the input + datalist at lines 63-74)
- Modify: `src/types/index.ts` (delete the now-unused `GymSuggestion` interface)
- Delete: `src/components/GymInput.tsx`
- Delete: `src/utils/gymSuggestions.ts`
- Delete: `src/utils/__tests__/gymSuggestions.test.ts`

**Interfaces:**
- Consumes: `GymPicker` (Task 5), `AddGymSheet` (Task 6).
- Produces: no new exports.

- [ ] **Step 1: `NewSessionPage` — the simplest swap first**

In `src/pages/NewSessionPage.tsx`, change the import on line 7:

```tsx
import { GymPicker } from '../components/GymPicker'
import { AddGymSheet } from '../components/AddGymSheet'
```

Add state inside the component, next to the existing hooks:

```tsx
const [addingGym, setAddingGym] = useState<string | null>(null)
```

(Ensure `useState` is imported from `react` in this file; add it to the existing import if not.)

Replace the `Controller`'s `render` body:

```tsx
render={({ field }) => (
  <>
    <GymPicker
      value={field.value}
      onChange={field.onChange}
      placeholder="Pick your gym"
      onAddRequest={setAddingGym}
    />
    <AddGymSheet
      open={addingGym !== null}
      initialName={addingGym ?? ''}
      onClose={() => setAddingGym(null)}
      onAdded={field.onChange}
    />
  </>
)}
```

The placeholder loses "Kilter Board..." on purpose: a session's location is now a registry gym. Outdoor and boards are out of scope for v1, and reopening either means reopening this field.

- [ ] **Step 2: `AddGymBoulderSheet` — swap the picker and delete `resolveGym`**

In `src/components/AddGymBoulderSheet.tsx`:

Change line 6:

```tsx
import { GymPicker } from './GymPicker'
import { AddGymSheet } from './AddGymSheet'
```

Delete `resolveGym` entirely (lines 55-63, comment included) — the picker can only emit a registered label, so snapping a typed string to a known spelling has nothing left to do:

```tsx
  // Snap a typed gym to its known spelling (case-insensitively) so the boulder
  // lands under the same gym string everyone else's discover feed filters on.
  // No match (a genuinely new gym) just publishes what was typed.
  const resolveGym = (typed: string): string => {
    const trimmed = typed.trim()
    const known = [...defaultGyms, ...gymSuggestions.map(s => s.name)]
    return known.find(k => k.toLowerCase() === trimmed.toLowerCase()) ?? trimmed
  }
```

At line 108, use the value directly:

```tsx
        gym: effectiveGym,
```

`gymSuggestions` was `resolveGym`'s only consumer, so remove its destructure and the now-unused import — `noUnusedLocals` makes both build errors:

```tsx
  const { data: gymSuggestions = [] } = useGymSuggestions()
```

and the `useGymSuggestions` import line.

Add the sheet state next to the other `useState` calls:

```tsx
  const [addingGym, setAddingGym] = useState<string | null>(null)
```

Replace the `GymInput` at line 147, keeping it a sibling of the surrounding markup:

```tsx
          <GymPicker
            value={gym}
            onChange={v => { setGym(v); setColor('') }}
            placeholder="Pick your gym"
            onAddRequest={setAddingGym}
          />
          <AddGymSheet
            open={addingGym !== null}
            initialName={addingGym ?? ''}
            onClose={() => setAddingGym(null)}
            onAdded={label => { setGym(label); setColor('') }}
          />
```

`AddGymSheet` renders a `BottomSheet` from inside `AddGymBoulderSheet`'s own sheet. Check on a phone viewport in Task 9 that the inner sheet sits above the outer one and that closing it does not close both.

- [ ] **Step 3: `DefaultGymsEditor` — selecting a gym adds it**

The old flow was type-then-press-Add. Selection is now unambiguous, so the button goes.

Replace `src/components/DefaultGymsEditor.tsx`'s imports and the top of the component:

```tsx
import { useState } from 'react'
import { X } from 'lucide-react'
import { GymPicker } from './GymPicker'
import { AddGymSheet } from './AddGymSheet'
import { useGymSuggestions } from '../hooks/useGymSuggestions'
import { addGym, removeGym, moveToFront } from '../utils/defaultGyms'

export function DefaultGymsEditor({
  value, onChange, showPopular = false,
}: {
  value: string[]
  onChange: (gyms: string[]) => void
  showPopular?: boolean
}) {
  const { data: suggestions = [] } = useGymSuggestions()
  const [addingGym, setAddingGym] = useState<string | null>(null)

  const add = (label: string) => {
    const next = addGym(value, label)
    if (next.length !== value.length) onChange(next)
  }

  const popular = suggestions
    .map(s => s.label)
    .filter(label => !value.some(g => g.toLowerCase() === label.toLowerCase()))
    .slice(0, 8)
```

Then replace the input row (the `flex gap-2` block holding `GymInput` and the Add button) with:

```tsx
      <GymPicker
        value=""
        onChange={add}
        placeholder="Add a gym…"
        onAddRequest={setAddingGym}
        clearOnSelect
      />
      <AddGymSheet
        open={addingGym !== null}
        initialName={addingGym ?? ''}
        onClose={() => setAddingGym(null)}
        onAdded={add}
      />
```

`value=""` plus `clearOnSelect` is deliberate: this picker is an "add another" control rather than a bound field. Its `value` never changes, so `GymPicker`'s sync effect never re-fires and `clearOnSelect` is what empties the field after each pick.

The `draft` state and `commitDraft` are now unused — delete both. `noUnusedLocals` will name them if you miss one.

- [ ] **Step 4: `GymGradingPage` — replace the raw datalist**

In `src/pages/GymGradingPage.tsx`, add the import:

```tsx
import { GymPicker } from '../components/GymPicker'
```

Replace the input and datalist (lines 63-74) with:

```tsx
        <GymPicker
          value={gym}
          onChange={setGym}
          placeholder="Pick a gym"
        />
```

No `onAddRequest` here on purpose: an admin or setter configuring grading colours for a gym that does not exist yet is a mistake, not a new gym. `useGymSuggestions`'s `gyms` local becomes unused — delete it and, if nothing else in the file uses the hook, its import.

- [ ] **Step 5: Delete the free-text path**

```bash
git rm src/components/GymInput.tsx src/utils/gymSuggestions.ts src/utils/__tests__/gymSuggestions.test.ts
```

`filterGymSuggestions` is replaced by `filterGyms`, which returns rows rather than names.

Its type goes with it — delete from `src/types/index.ts`:

```ts
export interface GymSuggestion {
  name: string
  uses: number
}
```

`GymOption` has replaced it everywhere. Task 4 kept it alive only so the branch stayed green while `gymSuggestions.ts` still existed.

- [ ] **Step 6: Verify nothing still references the deleted code**

Run: `grep -rn "GymInput\|filterGymSuggestions\|GymSuggestion\b" src`
Expected: no output. (`GymSuggestionRow` inside `useGymSuggestions.ts` is a different, local name and will not match `GymSuggestion\b`.)

- [ ] **Step 7: Build, test and lint green**

Run: `npm run build`
Expected: exit 0. Any failure here is a stranded import from Steps 1-5 — `noUnusedLocals` is doing its job; clear the named locals.

Run: `npx vitest run`
Expected: PASS. The `gymSuggestions` suite is gone; `gymRegistry` covers it.

Run: `npm run lint 2>&1 | tail -3`
Expected: `16 problems (15 errors, 1 warning)` — the same baseline, not one more.

- [ ] **Step 8: Commit**

```bash
git add -A src
git commit -m "Every gym field picks from the registry

The four surfaces that minted gym strings — the publish sheet, default gyms,
a session's location and the grading page — all pick a registered label now.
GymInput and filterGymSuggestions are deleted rather than left dark, and
AddGymBoulderSheet's resolveGym snap-to-known-spelling hack has nothing left
to do."
```

---

### Task 8: Admin — verify, rename, merge

The cleanup lever. Without it, this ships with no way to remove a joke name, which is the weakness the rejected normalise-only option had.

**Files:**
- Create: `src/hooks/useGymAdmin.ts`
- Create: `src/components/GymsAdmin.tsx`
- Modify: `src/pages/AdminPage.tsx` (the section list at lines 34-36)

**Interfaces:**
- Consumes: `rename_gym`, `merge_gyms`, `set_gym_verified`, `gym_merge_impact` (Task 3); `useGymSuggestions` (Task 4); `GymOption` (Task 1); `BottomSheet`; `errorMessage`.
- Produces: `useRenameGym()`, `useMergeGyms()`, `useSetGymVerified()`, `useGymMergeImpact(label)`, `<GymsAdmin />`.

- [ ] **Step 1: Write the admin hooks**

Create `src/hooks/useGymAdmin.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface GymMergeImpact {
  problems: number
  boulders: number
  sessions: number
  session_groups: number
  crews: number
  crew_plans: number
  award_rounds: number
  gradings: number
  climbers: number
  announcements: number
}

/** What a merge would rewrite. Admin-gated server-side. */
export function useGymMergeImpact(label: string | null) {
  return useQuery({
    queryKey: ['gym_merge_impact', label],
    queryFn: async (): Promise<GymMergeImpact> => {
      const { data, error } = await supabase.rpc('gym_merge_impact', { p_from: label! })
      if (error) throw error
      const row = (data as GymMergeImpact[] | null)?.[0]
      if (!row) throw new Error('Could not read the merge impact')
      return row
    },
    enabled: !!label,
  })
}

function useGymMutation<TVars>(fn: (vars: TVars) => Promise<void>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      // A rename or merge rewrites the gym string in twelve columns, so
      // anything keyed on a gym is now stale — not just the registry.
      queryClient.invalidateQueries()
    },
  })
}

export function useSetGymVerified() {
  return useGymMutation(async ({ id, verified }: { id: string; verified: boolean }) => {
    const { error } = await supabase.rpc('set_gym_verified', { p_id: id, p_verified: verified })
    if (error) throw error
  })
}

export function useRenameGym() {
  return useGymMutation(async ({ id, name, city }: { id: string; name: string; city: string | null }) => {
    const { error } = await supabase.rpc('rename_gym', { p_id: id, p_name: name, p_city: city })
    if (error) throw error
  })
}

export function useMergeGyms() {
  return useGymMutation(async ({ from, to }: { from: string; to: string }) => {
    const { error } = await supabase.rpc('merge_gyms', { p_from: from, p_to: to })
    if (error) throw error
  })
}
```

- [ ] **Step 2: Write the admin section**

Create `src/components/GymsAdmin.tsx`:

```tsx
import { useState } from 'react'
import { BadgeCheck, Pencil, Merge } from 'lucide-react'
import toast from 'react-hot-toast'
import { BottomSheet } from './BottomSheet'
import { useGymSuggestions } from '../hooks/useGymSuggestions'
import { useSetGymVerified, useRenameGym, useMergeGyms, useGymMergeImpact } from '../hooks/useGymAdmin'
import { gymLabel } from '../utils/gymRegistry'
import { errorMessage } from '../utils/errors'
import type { GymOption } from '../types'

const INPUT = 'w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500'

/** Climber-added and unverified first — that is the queue that needs looking at. */
function adminOrder(gyms: GymOption[]): GymOption[] {
  return [...gyms].sort((a, b) => {
    const aNeeds = a.climber_added && !a.verified
    const bNeeds = b.climber_added && !b.verified
    if (aNeeds !== bNeeds) return aNeeds ? -1 : 1
    return b.uses - a.uses || a.label.localeCompare(b.label)
  })
}

function MergeSheet({ from, gyms, onClose }: { from: GymOption; gyms: GymOption[]; onClose: () => void }) {
  const [targetId, setTargetId] = useState('')
  const merge = useMergeGyms()
  const { data: impact } = useGymMergeImpact(from.label)
  const target = gyms.find(g => g.id === targetId) ?? null

  const run = async () => {
    if (!target) return
    try {
      await merge.mutateAsync({ from: from.id, to: target.id })
      toast.success(`Merged into ${target.label}`)
      onClose()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not merge those gyms'))
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Everything logged at <span className="font-semibold">{from.label}</span> moves to the gym you pick.
        This cannot be undone.
      </p>
      <select value={targetId} onChange={e => setTargetId(e.target.value)} className={INPUT}>
        <option value="">Merge into…</option>
        {gyms.filter(g => g.id !== from.id).map(g => (
          <option key={g.id} value={g.id}>{g.label}</option>
        ))}
      </select>
      {impact && (
        <ul className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600 space-y-0.5">
          <li>{impact.problems} logged problems</li>
          <li>{impact.boulders} shared boulders</li>
          <li>{impact.sessions} sessions, {impact.session_groups} shared sessions</li>
          <li>{impact.crews} sendtrains, {impact.crew_plans} plans</li>
          <li>{impact.climbers} climbers' default gyms</li>
          <li>{impact.announcements} wall announcements</li>
          {impact.gradings > 0 && (
            <li className="font-semibold text-red-500">
              {impact.gradings} grading colours — discarded where the target already sets that colour
            </li>
          )}
          {impact.award_rounds > 0 && (
            <li className="font-semibold text-red-500">
              {impact.award_rounds} award rounds — discarded, with their votes, where the target already
              has a round that day
            </li>
          )}
        </ul>
      )}
      <button
        type="button"
        onClick={() => void run()}
        disabled={!target || merge.isPending}
        className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
      >
        {merge.isPending ? 'Merging…' : `Merge into ${target?.label ?? '…'}`}
      </button>
    </div>
  )
}

function RenameSheet({ gym, onClose }: { gym: GymOption; onClose: () => void }) {
  const [name, setName] = useState(gym.name)
  const [city, setCity] = useState(gym.city ?? '')
  const rename = useRenameGym()

  const run = async () => {
    try {
      await rename.mutateAsync({ id: gym.id, name: name.trim(), city: city.trim() || null })
      toast.success('Renamed')
      onClose()
    } catch (e) {
      // rename_gym raises rather than silently merging when the new name
      // already exists — surface that reason verbatim.
      toast.error(errorMessage(e, 'Could not rename that gym'))
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="rename-gym-name" className="block text-sm font-medium text-gray-700 mb-1">Gym</label>
        <input id="rename-gym-name" value={name} onChange={e => setName(e.target.value)} className={INPUT} />
      </div>
      <div>
        <label htmlFor="rename-gym-city" className="block text-sm font-medium text-gray-700 mb-1">
          City or area <span className="text-gray-400">(optional)</span>
        </label>
        <input id="rename-gym-city" value={city} onChange={e => setCity(e.target.value)} className={INPUT} />
      </div>
      <p className="text-xs text-gray-400">
        Will be listed as <span className="font-medium text-gray-600">{gymLabel(name, city) || '…'}</span>,
        and the old name is rewritten everywhere it was logged.
      </p>
      <button
        type="button"
        onClick={() => void run()}
        disabled={name.trim() === '' || rename.isPending}
        className="w-full rounded-lg bg-sage-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
      >
        {rename.isPending ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

/**
 * The cleanup lever. New gyms are instant and provisional, so something has to
 * be able to verify a real one, fix a spelling, and fold a duplicate back in.
 */
export function GymsAdmin() {
  const { data: gyms = [] } = useGymSuggestions()
  const setVerified = useSetGymVerified()
  const [renaming, setRenaming] = useState<GymOption | null>(null)
  const [merging, setMerging] = useState<GymOption | null>(null)

  const toggle = async (gym: GymOption) => {
    try {
      await setVerified.mutateAsync({ id: gym.id, verified: !gym.verified })
    } catch (e) {
      toast.error(errorMessage(e, 'Could not change that gym'))
    }
  }

  return (
    <div>
      <h2 className="text-base font-semibold mb-3">Gyms</h2>
      <p className="text-xs text-gray-400 mb-2">
        Climber-added gyms come first. Verifying one floats it to the top of the picker; merging moves
        everything logged at one gym to another and cannot be undone.
      </p>
      <ul className="space-y-2">
        {adminOrder(gyms).map(gym => (
          <li key={gym.id} className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium">{gym.label}</p>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">
                {gym.uses} logged{gym.climber_added ? ' · climber-added' : ''}{gym.verified ? ' · verified' : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void toggle(gym)}
              title={gym.verified ? 'Unverify' : 'Verify'}
              aria-label={gym.verified ? `Unverify ${gym.label}` : `Verify ${gym.label}`}
              className={gym.verified ? 'text-sage-700' : 'text-gray-300 hover:text-gray-500'}
            >
              <BadgeCheck size={18} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => setRenaming(gym)}
              title="Rename"
              aria-label={`Rename ${gym.label}`}
              className="text-gray-400 hover:text-gray-700"
            >
              <Pencil size={16} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => setMerging(gym)}
              title="Merge into another gym"
              aria-label={`Merge ${gym.label}`}
              className="text-gray-400 hover:text-red-600"
            >
              <Merge size={16} strokeWidth={1.75} />
            </button>
          </li>
        ))}
      </ul>

      {/* Sheets are siblings of the heading, never children of it. */}
      <BottomSheet open={renaming !== null} onClose={() => setRenaming(null)} title="Rename gym">
        {renaming && <RenameSheet gym={renaming} onClose={() => setRenaming(null)} />}
      </BottomSheet>
      <BottomSheet open={merging !== null} onClose={() => setMerging(null)} title="Merge gym">
        {merging && <MergeSheet from={merging} gyms={gyms} onClose={() => setMerging(null)} />}
      </BottomSheet>
    </div>
  )
}
```

- [ ] **Step 3: Mount it on the admin page**

In `src/pages/AdminPage.tsx`, add the import next to the others:

```tsx
import { GymsAdmin } from '../components/GymsAdmin'
```

and add the section to the list at lines 34-36:

```tsx
      <CoachPromptAdmin />
      <GymsAdmin />
      <ProblemTagsAdmin />
      <ChallengeTagsAdmin />
```

- [ ] **Step 4: Check the icon names exist**

Run: `grep -rn "\"lucide-react\"" package.json && node -e "const i=require('lucide-react');for(const n of ['BadgeCheck','Pencil','Merge','Check','Plus'])if(!i[n])throw new Error('missing icon: '+n);console.log('icons ok')"`
Expected: `icons ok`. If `Merge` is missing in this version, use `GitMerge`.

- [ ] **Step 5: Build, test and lint green**

Run: `npm run build && npx vitest run && npm run lint 2>&1 | tail -3`
Expected: build exit 0, tests PASS, lint `16 problems (15 errors, 1 warning)`.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useGymAdmin.ts src/components/GymsAdmin.tsx src/pages/AdminPage.tsx
git commit -m "Verify, rename and merge gyms from the admin page"
```

---

### Task 9: Manual pass and release

No component tests exist in this project by design, so this pass is the verification — not a formality.

**Files:** none (verification and release only).

- [ ] **Step 1: Confirm the automated checks from a clean tree**

Run: `npm run build && npx vitest run && npm run lint 2>&1 | tail -3`
Expected: build exit 0; all tests PASS; lint exactly `16 problems (15 errors, 1 warning)`.

Run: `git status --short`
Expected: empty.

- [ ] **Step 2: Confirm migration 092 is applied**

In the Supabase dashboard: `select count(*) from gyms;` returns the backfilled rows, and
`select proname from pg_proc where proname in ('fold_gym_text','create_gym','rename_gym','merge_gyms','set_gym_verified','gym_merge_impact','rewrite_gym_label','gym_suggestions') order by 1;`
returns all eight. If not, Task 3 Step 10 is unfinished — the app will fail at the picker.

- [ ] **Step 3: Manual pass, phone viewport (~390×844)**

Run: `npm run dev`, then walk all of it:

1. **Existing gym, session flow** — New Session → Location. Typing filters; typing a gibberish string leaves the field empty on blur (nothing committed). Pick a gym, save, and confirm the session shows that gym.
2. **New gym** — type a name that does not exist → "Can't find … ? Add it" → name + city → Add. It appears selected immediately, and shows the **new** chip when reopened.
3. **Duplicate interstitial** — add again with a one-character misspelling of a gym you know exists. "Is it one of these?" must list it. Pick the suggestion: no second gym is created. Then repeat and choose "No — add …": confirm it does create a distinct gym, and clean it up in admin afterwards.
4. **Branch case** — add the same name with a different city. It must be offered as "Another branch", and choosing to add anyway must produce two distinct labels.
5. **Publish a boulder** — /gym-problems → the add sheet → gym picker. Check the inner `AddGymSheet` layers above the outer sheet, that closing it leaves the outer sheet open with the fields intact, and that the grading colours reload for the chosen gym.
6. **Default gyms** — onboarding and Profile. Picking a gym adds it to the list directly (no Add button). Primary stays first; "Make primary" still works; removing still works.
7. **Grading page** — the gym field is a picker with no add option.
8. **Merge, the real test** — pick two gyms with logged problems, note both leaderboards at /analysis/leaderboards, merge one into the other in Admin → Gyms, then confirm: one gym remains in every picker, the merged label is gone, **the two leaderboards are now one**, and the losing gym's climbers still have the surviving gym in their default gyms exactly once, with their primary unchanged.
9. **Rename collision** — rename a gym to exactly another gym's name. Expect the toast to say to merge instead, and no data to move.

- [ ] **Step 4: Note anything the pass found, and fix it before release**

Any failure in Step 3 is a bug in this branch, not a note for later. Fix, re-run Steps 1-3, then continue.

- [ ] **Step 5: Merge and release**

Use the `superpowers:finishing-a-development-branch` skill to decide how this integrates.

**The release gate for whoever pushes:** migration 092 must already be applied (Step 2 proves it). Pushing `main` auto-deploys via Vercel — a push is a release. `api/` is untouched by this branch, so there is no separately-checked edge-function surface to worry about.

- [ ] **Step 6: Update the notes that this changes**

Two memory entries are now wrong, and one is worth adding:
- `gym-grading-color-picker-status` — grading is still keyed on the gym string, but that string now comes from the registry.
- `outdoor-out-of-scope-v1` — reopening outdoor now also means reopening `sessions.location`, which this branch constrained to registry gyms.
- New: the gym registry itself — 092 pending/applied, and the fact that the label, not an id, is still the join key.

---

## Spec Coverage

| Spec section | Task |
|---|---|
| `gyms` table, indexes, RLS with no write policy | 3 (Steps 1) |
| `label` load-bearing, plain columns maintained by RPCs | 3 (Step 1) |
| `canonical_key` folds across the name/city boundary | 1, 3 (Steps 1, 7 smoke) |
| `create_gym` idempotent; no `beta_points` | 3 (Step 3) |
| `rename_gym` collision raises; merge chain; self-merge raises | 3 (Step 4) |
| Admin-only, not setters | 3 (Step 4), 8 |
| Twelve columns; target-wins conflict rule; ordered `default_gyms` | 3 (Step 2) |
| `rewrite_gym_label` shared by merge, rename and backfill | 3 (Steps 2, 5) |
| `canonicalGymKey`, `gymLabel`, `isPlausibleGymName` | 1 |
| `nearDuplicateGyms`, thresholds, containment guard, branch case | 2 |
| `filterGyms` (verified first, then uses) | 2 |
| TS/SQL fold divergence is benign; vectors mirrored in the smoke block | 1, 3 (Step 7) |
| `GymPicker` at all four surfaces, emitting a label | 5, 7 |
| "Can't find … ? Add it" → name + city → duplicate check | 5, 6 |
| **new** chip keyed on `climber_added` | 5 |
| `gym_suggestions` additive, registry-backed, excludes merged | 3 (Step 6), 4 |
| Every commit builds (Task 4 keeps `GymSuggestion` until Task 7 deletes it) | 4 (Step 1), 7 (Step 5) |
| Backfill: most-used spelling wins, no split guessed, variants collapsed | 3 (Step 5) |
| `GymsAdmin`: verify / rename / merge with impact counts | 8 |
| `BottomSheet` a sibling of the heading | 6, 8 |
| Release gate, ordering, closing `do` block | 3 (Steps 7, 10), 9 |
| Verification: Vitest, build, lint baseline, manual pass | 1, 2, 7, 8, 9 |
