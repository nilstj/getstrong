# Gym Name Autocomplete + Default Gym Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global gym-name typeahead to the session Location field and a default-gym setting that pre-fills it, so gym names stop drifting into many spellings.

**Architecture:** A `SECURITY DEFINER` SQL function returns distinct gym names (from session locations ∪ problem gyms) with usage counts; the client fetches that once, caches it, and a pure `filterGymSuggestions` helper drives a reusable controlled `GymInput` (text field + suggestion dropdown). A new `profiles.default_gym` column pre-fills the New Session Location field and is editable in settings.

**Tech Stack:** React 18 + TypeScript, `@tanstack/react-query`, `react-hook-form` (Controller), Supabase, Tailwind, Vitest (jsdom).

## Global Constraints

- **Suggestions are global**, served only via the `gym_suggestions()` SECURITY DEFINER function (sessions aren't globally readable). It returns only `{ name, uses }`, never session/problem rows.
- **Free typeahead, never strict:** `GymInput` is always a normal text input; the dropdown is assistive and any new name can be typed.
- **Scope:** the session **Location** field (`NewSessionPage`) and a **Default gym** field in settings (`ProfilePage`). Do NOT add the typeahead to `ProblemForm` — problems inherit the session location.
- **Settings default-gym saves on blur** (or on suggestion select), not per-keystroke.
- **Suggestion list is fetched once and filtered client-side** (no per-keystroke server calls).
- **Migrations are numbered SQL applied manually** (no CLI/local DB, no SQL test harness); make them re-runnable. Verify by reading + the provided query.
- **Tests exist only for pure utilities** (`src/utils/__tests__/`). Hooks/components verified via `npx tsc -b` + `npm run lint` (baseline 17, 0 new) + `npm run build`. TDD only for the pure helper in Task 2.
- **Naming/style:** React Query array keys, `useX` hooks, `sage-700` accent, inputs styled `w-full border rounded-lg px-3 py-2.5`. Follow existing patterns.

---

### Task 1: Migration — `profiles.default_gym` + `gym_suggestions()`

**Files:**
- Create: `supabase/migrations/050_gym_suggestions.sql`

**Interfaces:**
- Produces (relied on by Tasks 3): `profiles.default_gym text` (nullable); RPC `gym_suggestions() returns table(name text, uses bigint)`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/050_gym_suggestions.sql`:

```sql
-- Gym-name autocomplete + default gym. Additive: a per-user default gym, and a
-- read-only function exposing distinct gym names (with usage counts) across all
-- users so the Location typeahead can converge spellings. Sessions aren't
-- globally readable, so the function is SECURITY DEFINER and returns ONLY the
-- name strings + counts (no session/problem rows).

alter table profiles add column if not exists default_gym text;

create or replace function public.gym_suggestions()
returns table (name text, uses bigint) as $$
  select g.name, count(*) as uses
  from (
    select trim(location) as name from public.sessions where coalesce(trim(location), '') <> ''
    union all
    select trim(gym)      as name from public.problems where coalesce(trim(gym), '') <> ''
  ) g
  group by g.name
  order by uses desc, g.name asc;
$$ language sql stable security definer;
```

- [ ] **Step 2: Self-review the SQL**

Confirm: `default_gym` is additive `add column if not exists`, nullable. The function is `stable security definer`, unions trimmed non-empty `sessions.location` and `problems.gym`, groups by name, orders by `uses desc, name asc`. Returns only `name, uses`.

- [ ] **Step 3: Apply via the Supabase SQL editor and verify**

Apply `050_gym_suggestions.sql`, then:

```sql
select column_name from information_schema.columns
 where table_name = 'profiles' and column_name = 'default_gym';
select * from gym_suggestions() limit 5;
```
Expected: one `default_gym` row; the function returns up to 5 `(name, uses)` rows (possibly zero if no data yet).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/050_gym_suggestions.sql
git commit -m "feat: profiles.default_gym + gym_suggestions() function (migration 050)"
```

---

### Task 2: `GymSuggestion` type + `filterGymSuggestions` helper (TDD)

**Files:**
- Modify: `src/types/index.ts` (append)
- Create: `src/utils/gymSuggestions.ts`
- Test: `src/utils/__tests__/gymSuggestions.test.ts`

**Interfaces:**
- Produces (relied on by Tasks 3–4):
  - `interface GymSuggestion { name: string; uses: number }`
  - `filterGymSuggestions(list: GymSuggestion[], query: string, limit?: number): string[]` — trims `query`; case-insensitive substring match on `name`; preserves `list` order (popular-first); caps at `limit` (default 8); an empty/whitespace query returns the top `limit` names.

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/gymSuggestions.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { filterGymSuggestions } from '../gymSuggestions'
import type { GymSuggestion } from '../types'

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/gymSuggestions.test.ts`
Expected: FAIL — cannot resolve module `../gymSuggestions`.

- [ ] **Step 3: Write the helper**

Create `src/utils/gymSuggestions.ts`:

```ts
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
```

- [ ] **Step 4: Add the type**

Append to `src/types/index.ts`:

```ts
export interface GymSuggestion {
  name: string
  uses: number
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/gymSuggestions.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/utils/gymSuggestions.ts src/utils/__tests__/gymSuggestions.test.ts
git commit -m "feat: add GymSuggestion type and filterGymSuggestions helper"
```

---

### Task 3: `useGymSuggestions` hook + `default_gym` on the profile

**Files:**
- Create: `src/hooks/useGymSuggestions.ts`
- Modify: `src/hooks/useProfile.ts` (`Profile` interface + `useUpdateProfile`)

**Interfaces:**
- Consumes: `supabase`, `GymSuggestion` (Task 2).
- Produces (relied on by Tasks 4–5):
  - `useGymSuggestions()` → query returning `GymSuggestion[]`.
  - `Profile.default_gym: string | null`; `useUpdateProfile` accepts `default_gym`.

- [ ] **Step 1: Write the suggestions hook**

Create `src/hooks/useGymSuggestions.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { GymSuggestion } from '../types'

export function useGymSuggestions() {
  return useQuery({
    queryKey: ['gym_suggestions'],
    queryFn: async (): Promise<GymSuggestion[]> => {
      const { data, error } = await supabase.rpc('gym_suggestions')
      if (error) throw error
      return (data ?? []) as GymSuggestion[]
    },
    staleTime: 5 * 60 * 1000,
  })
}
```

- [ ] **Step 2: Add `default_gym` to the Profile type**

In `src/hooks/useProfile.ts`, add to the `Profile` interface (after `grade_preference`):

```ts
  default_gym: string | null
```

- [ ] **Step 3: Let `useUpdateProfile` accept `default_gym`**

In `src/hooks/useProfile.ts`, widen the `useUpdateProfile` mutation input:

```ts
    mutationFn: async (values: Partial<Pick<Profile, 'username' | 'avatar_url' | 'grade_preference' | 'default_gym'>>) => {
```

(The rest of the function is unchanged.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGymSuggestions.ts src/hooks/useProfile.ts
git commit -m "feat: useGymSuggestions hook + default_gym on profile"
```

---

### Task 4: `GymInput` component

**Files:**
- Create: `src/components/GymInput.tsx`

**Interfaces:**
- Consumes: `useGymSuggestions` (Task 3), `filterGymSuggestions` (Task 2).
- Produces (relied on by Task 5): `GymInput({ value, onChange, placeholder?, id?, onCommit? })` where `value: string`, `onChange: (v: string) => void`, `onCommit?: () => void` (called on blur and on suggestion select — used by settings to save).

- [ ] **Step 1: Write the component**

Create `src/components/GymInput.tsx`:

```tsx
import { useState, useRef } from 'react'
import { useGymSuggestions } from '../hooks/useGymSuggestions'
import { filterGymSuggestions } from '../utils/gymSuggestions'

export function GymInput({
  value, onChange, placeholder, id, onCommit,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  id?: string
  onCommit?: () => void
}) {
  const { data: suggestions = [] } = useGymSuggestions()
  const [open, setOpen] = useState(false)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const matches = filterGymSuggestions(suggestions, value)

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay so a suggestion mousedown/click registers before we close.
          blurTimer.current = setTimeout(() => { setOpen(false); onCommit?.() }, 150)
        }}
        className="w-full border rounded-lg px-3 py-2.5"
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {matches.map(name => (
            <li key={name}>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()} /* keep input focus so the click lands */
                onClick={() => {
                  if (blurTimer.current) clearTimeout(blurTimer.current)
                  onChange(name)
                  setOpen(false)
                  onCommit?.()
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-sage-50"
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck, lint, build**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: no type errors, no new lint errors (baseline 17), build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/GymInput.tsx
git commit -m "feat: GymInput — gym-name typeahead with suggestion dropdown"
```

---

### Task 5: Wire into New Session + Settings

**Files:**
- Modify: `src/pages/NewSessionPage.tsx`
- Modify: `src/pages/ProfilePage.tsx`

**Interfaces:**
- Consumes: `GymInput` (Task 4), `useProfile`/`useUpdateProfile` (Task 3), `react-hook-form` `Controller`.
- Produces: nothing.

- [ ] **Step 1: New Session — typeahead Location + default-gym prefill**

In `src/pages/NewSessionPage.tsx`:

Add imports / extend existing ones:

```tsx
import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { useProfile } from '../hooks/useProfile'
import { GymInput } from '../components/GymInput'
```

Destructure `control`, `setValue`, `getValues` from `useForm` (keep `register`, `handleSubmit`):

```tsx
  const { register, handleSubmit, control, setValue, getValues } = useForm<FormValues>({ defaultValues: { /* unchanged */ } })
  const { data: profile } = useProfile()
```

Pre-fill the Location with the default gym once the profile loads, without clobbering anything the user already typed:

```tsx
  useEffect(() => {
    if (profile?.default_gym && !getValues('location')) {
      setValue('location', profile.default_gym)
    }
  }, [profile?.default_gym, getValues, setValue])
```

Replace the Location `<input {...register('location', { required: true })} … />` with a `Controller`-wrapped `GymInput`:

```tsx
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
          <Controller
            name="location"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <GymInput
                value={field.value}
                onChange={field.onChange}
                placeholder="Gym name, Kilter Board, crag..."
              />
            )}
          />
        </div>
```

(`required` still enforced via the `Controller` rules; the rest of the form is unchanged.)

- [ ] **Step 2: Settings — Default gym field**

In `src/pages/ProfilePage.tsx`, add imports:

```tsx
import { GymInput } from '../components/GymInput'
```

Add local state seeded from the profile (place with the other hooks/state near the top of the component):

```tsx
  const [defaultGym, setDefaultGym] = useState('')
  useEffect(() => { setDefaultGym(profile?.default_gym ?? '') }, [profile?.default_gym])
```

(Ensure `useState`/`useEffect` are imported — extend the existing `react` import.)

Render a "Default Gym" block immediately after the "Grade Scale" settings block (it saves on blur / suggestion select; clearing to empty saves `null`):

```tsx
        <div className="w-full">
          <p className="text-xs text-gray-400 text-center mb-2 uppercase tracking-wider font-medium">Default Gym</p>
          <GymInput
            value={defaultGym}
            onChange={setDefaultGym}
            placeholder="Your home gym"
            onCommit={() => {
              const trimmed = defaultGym.trim()
              if (trimmed !== (profile?.default_gym ?? '')) {
                updateProfile.mutate({ default_gym: trimmed === '' ? null : trimmed })
              }
            }}
          />
        </div>
```

- [ ] **Step 3: Typecheck, lint, build**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: no type errors, no new lint errors (baseline 17), build succeeds.

- [ ] **Step 4: Manual verification**

With migration 050 applied, `npm run dev`: on New Session, typing in Location shows matching gyms (popular-first); selecting one fills it. In Settings, set a Default Gym (typeahead works); it saves on blur. Start a new session → Location is pre-filled with the default gym, and is still editable.

- [ ] **Step 5: Commit**

```bash
git add src/pages/NewSessionPage.tsx src/pages/ProfilePage.tsx
git commit -m "feat: gym typeahead on New Session Location + default-gym setting"
```

---

## Self-Review

**Spec coverage:**
- Global suggestions via SECURITY DEFINER function → Task 1 ✓
- `profiles.default_gym` → Task 1 + Task 3 ✓
- `filterGymSuggestions` (substring, trim, popular-first, limit, empty→top-N) → Task 2 ✓
- `useGymSuggestions` cached → Task 3 ✓
- `GymInput` free typeahead dropdown → Task 4 ✓
- Session Location typeahead + default-gym prefill → Task 5 Step 1 ✓
- Settings default-gym field, save on blur, clear→null → Task 5 Step 2 ✓
- Problems untouched → no ProblemForm changes ✓
- Degrade to plain input on fetch failure → `useGymSuggestions([])` default + `matches.length > 0` guard in Task 4 ✓

**Placeholder scan:** No TBD/TODO; every code step is complete.

**Type consistency:** `GymSuggestion {name,uses}` defined in Task 2, consumed by Tasks 3–4. `filterGymSuggestions(list, query, limit?)` signature matches across Tasks 2/4. `useGymSuggestions(): GymSuggestion[]` matches Task 3→4. `GymInput({value,onChange,placeholder?,id?,onCommit?})` matches Task 4 (def) and Task 5 (uses — New Session omits `onCommit`, Settings uses it). `default_gym` on `Profile` + `useUpdateProfile` (Task 3) consumed in Task 5. ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-24-gym-name-autocomplete.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
