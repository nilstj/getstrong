# Multiple Default Gyms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each user have several default gyms (an ordered list, first = primary), and make choosing/creating a default gym part of registration via a first-login onboarding gate.

**Architecture:** Gyms stay free-text strings (no gyms table). The single `profiles.default_gym text` becomes `profiles.default_gyms text[]`. A pure helper normalizes the list and derives the primary. A shared `DefaultGymsEditor` component (built on the existing `GymInput` + `gym_suggestions()` RPC) powers both the profile screen and a new onboarding page. An `OnboardingGate` route wrapper redirects new users with no gyms to `/onboarding`.

**Tech Stack:** React 19, TypeScript (strict, `tsc -b`), React Router, TanStack Query, Supabase, Tailwind, Vitest, react-hot-toast.

## Global Constraints

- **`noUnusedLocals` fails the build.** After swapping `default_gym` → `default_gyms`, leave no unused imports, params, or locals. Verify with `npm run build`.
- **Migrations are applied manually in the Supabase dashboard before deploying dependent code.** The migration file is authored in-repo; a human applies it. Do not assume it runs automatically.
- **Only pure utilities are unit-tested.** UI/components/pages are verified by build + manual check, matching repo norms.
- **Primary gym = element 0** of the ordered `default_gyms` array. No separate primary column.
- **`SessionDetailPage` / `ProblemForm` are NOT changed** — their `defaultGym` derives from `session.location`, not the profile.

---

### Task 1: Database migration — `default_gyms` array

**Files:**
- Create: `supabase/migrations/060_default_gyms.sql`

**Interfaces:**
- Produces: `profiles.default_gyms text[] not null default '{}'`; removes `profiles.default_gym`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/060_default_gyms.sql`:

```sql
-- Multiple default gyms per user. Replaces the single profiles.default_gym text
-- with an ordered array of gym-name strings; element 0 is the primary/prefill gym.
-- Gyms remain free-text (no gyms table) — consistent with sessions.location and
-- problems.gym. See migration 050 for the original single default_gym column.

alter table profiles add column if not exists default_gyms text[] not null default '{}';

-- Backfill: carry each existing single default gym into the new array (one element).
update profiles
set default_gyms = array[trim(default_gym)]
where default_gym is not null
  and trim(default_gym) <> ''
  and default_gyms = '{}';

alter table profiles drop column if exists default_gym;
```

- [ ] **Step 2: Apply it manually in the Supabase dashboard**

Per the project workflow, run the SQL above in the Supabase SQL editor (or hand it to whoever manages migrations). Confirm `profiles` now has a `default_gyms` column and no `default_gym` column.
Expected: `select default_gyms from profiles limit 1;` succeeds; `select default_gym from profiles limit 1;` errors with "column does not exist".

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/060_default_gyms.sql
git commit -m "feat: add default_gyms array column, drop single default_gym"
```

---

### Task 2: Pure helper — normalize list + derive primary

**Files:**
- Create: `src/utils/defaultGyms.ts`
- Test: `src/utils/__tests__/defaultGyms.test.ts`

**Interfaces:**
- Produces:
  - `normalizeGyms(gyms: string[]): string[]` — trims each, drops empties, dedupes case-insensitively keeping the first occurrence, preserves order.
  - `primaryGym(gyms: string[]): string | null` — first element of `normalizeGyms`, or `null` if none.
  - `addGym(gyms: string[], name: string): string[]` — appends `name` then normalizes (no-op if already present, case-insensitive).
  - `removeGym(gyms: string[], name: string): string[]` — removes entries equal to `name` (case-insensitive, trimmed), preserves order.
  - `moveToFront(gyms: string[], name: string): string[]` — moves the matching entry to index 0 (sets primary); no-op if absent.

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/defaultGyms.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeGyms, primaryGym, addGym, removeGym, moveToFront } from '../defaultGyms'

describe('normalizeGyms', () => {
  it('trims entries and drops empties/whitespace', () => {
    expect(normalizeGyms(['  Boulders Oslo ', '', '   '])).toEqual(['Boulders Oslo'])
  })
  it('dedupes case-insensitively, keeping the first occurrence', () => {
    expect(normalizeGyms(['Boulders', 'boulders', 'Klatreverket'])).toEqual(['Boulders', 'Klatreverket'])
  })
  it('preserves order', () => {
    expect(normalizeGyms(['B', 'A', 'C'])).toEqual(['B', 'A', 'C'])
  })
})

describe('primaryGym', () => {
  it('returns the first normalized entry', () => {
    expect(primaryGym(['  ', 'Boulders', 'Klatreverket'])).toBe('Boulders')
  })
  it('returns null for an empty/blank list', () => {
    expect(primaryGym(['', '  '])).toBeNull()
    expect(primaryGym([])).toBeNull()
  })
})

describe('addGym', () => {
  it('appends a new gym', () => {
    expect(addGym(['Boulders'], 'Klatreverket')).toEqual(['Boulders', 'Klatreverket'])
  })
  it('does not add a case-insensitive duplicate', () => {
    expect(addGym(['Boulders'], 'boulders')).toEqual(['Boulders'])
  })
  it('ignores blank input', () => {
    expect(addGym(['Boulders'], '   ')).toEqual(['Boulders'])
  })
})

describe('removeGym', () => {
  it('removes a matching entry case-insensitively', () => {
    expect(removeGym(['Boulders', 'Klatreverket'], 'boulders')).toEqual(['Klatreverket'])
  })
})

describe('moveToFront', () => {
  it('moves the matching entry to the front', () => {
    expect(moveToFront(['A', 'B', 'C'], 'B')).toEqual(['B', 'A', 'C'])
  })
  it('is a no-op when the entry is absent', () => {
    expect(moveToFront(['A', 'B'], 'Z')).toEqual(['A', 'B'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/utils/__tests__/defaultGyms.test.ts`
Expected: FAIL — cannot find module `../defaultGyms`.

- [ ] **Step 3: Implement the helper**

Create `src/utils/defaultGyms.ts`:

```ts
export function normalizeGyms(gyms: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of gyms) {
    const name = raw.trim()
    if (name === '') continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

export function primaryGym(gyms: string[]): string | null {
  return normalizeGyms(gyms)[0] ?? null
}

export function addGym(gyms: string[], name: string): string[] {
  return normalizeGyms([...gyms, name])
}

export function removeGym(gyms: string[], name: string): string[] {
  const key = name.trim().toLowerCase()
  return normalizeGyms(gyms.filter(g => g.trim().toLowerCase() !== key))
}

export function moveToFront(gyms: string[], name: string): string[] {
  const key = name.trim().toLowerCase()
  const normalized = normalizeGyms(gyms)
  const idx = normalized.findIndex(g => g.toLowerCase() === key)
  if (idx <= 0) return normalized
  const [picked] = normalized.splice(idx, 1)
  return [picked, ...normalized]
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/utils/__tests__/defaultGyms.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/defaultGyms.ts src/utils/__tests__/defaultGyms.test.ts
git commit -m "feat: add default-gyms list helpers (normalize, primary, add/remove/reorder)"
```

---

### Task 3: `DefaultGymsEditor` component + flip client to `default_gyms`

This task is atomic: it swaps the `Profile` type field and updates every consumer in the same commit so the build stays green.

**Files:**
- Create: `src/components/DefaultGymsEditor.tsx`
- Modify: `src/hooks/useProfile.ts` (Profile type + `useUpdateProfile` whitelist)
- Modify: `src/pages/NewSessionPage.tsx` (prefill)
- Modify: `src/pages/ProfilePage.tsx` (use `DefaultGymsEditor`)

**Interfaces:**
- Consumes: `normalizeGyms`, `addGym`, `removeGym`, `moveToFront` from `src/utils/defaultGyms.ts`; `GymInput` from `src/components/GymInput.tsx`; `useGymSuggestions` from `src/hooks/useGymSuggestions.ts`.
- Produces:
  - `DefaultGymsEditor({ value, onChange, showPopular }: { value: string[]; onChange: (gyms: string[]) => void; showPopular?: boolean })` — self-contained editor: an add-input, optional popular-gym quick-add chips, and the ordered list with per-row remove + "Make primary".
  - `Profile.default_gyms: string[]` (was `default_gym: string | null`).
  - `useUpdateProfile` accepts `{ default_gyms?: string[] }`.

- [ ] **Step 1: Create the `DefaultGymsEditor` component**

Create `src/components/DefaultGymsEditor.tsx`:

```tsx
import { useState } from 'react'
import { X } from 'lucide-react'
import { GymInput } from './GymInput'
import { useGymSuggestions } from '../hooks/useGymSuggestions'
import { addGym, removeGym, moveToFront } from '../utils/defaultGyms'

export function DefaultGymsEditor({
  value, onChange, showPopular = false,
}: {
  value: string[]
  onChange: (gyms: string[]) => void
  showPopular?: boolean
}) {
  const [draft, setDraft] = useState('')
  const { data: suggestions = [] } = useGymSuggestions()

  const commitDraft = () => {
    const next = addGym(value, draft)
    if (next.length !== value.length) onChange(next)
    setDraft('')
  }

  const popular = suggestions
    .map(s => s.name)
    .filter(name => !value.some(g => g.toLowerCase() === name.toLowerCase()))
    .slice(0, 8)

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="flex-1">
          <GymInput
            value={draft}
            onChange={setDraft}
            placeholder="Add a gym…"
          />
        </div>
        <button
          type="button"
          onClick={commitDraft}
          disabled={draft.trim() === ''}
          className="px-4 rounded-lg bg-sage-700 text-white text-sm font-medium disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {showPopular && popular.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {popular.map(name => (
            <button
              key={name}
              type="button"
              onClick={() => onChange(addGym(value, name))}
              className="px-3 py-1.5 rounded-full border border-gray-200 text-sm text-gray-600 hover:bg-sage-50"
            >
              + {name}
            </button>
          ))}
        </div>
      )}

      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((name, i) => (
            <li key={name} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
              <span className="flex-1 text-sm font-medium">{name}</span>
              {i === 0 ? (
                <span className="text-[10px] uppercase tracking-wide font-semibold text-sage-700">Primary</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onChange(moveToFront(value, name))}
                  className="text-xs text-sage-700 font-medium"
                >
                  Make primary
                </button>
              )}
              <button
                type="button"
                onClick={() => onChange(removeGym(value, name))}
                className="text-gray-400 hover:text-gray-600"
                aria-label={`Remove ${name}`}
              >
                <X size={16} strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Flip the `Profile` type and update whitelist**

In `src/hooks/useProfile.ts`, change the type field (line 11) and the `useUpdateProfile` `Pick` (line 39):

```ts
// line 11 — in interface Profile:
  default_gyms: string[]
```

```ts
// line 39 — mutationFn signature:
    mutationFn: async (values: Partial<Pick<Profile, 'username' | 'avatar_url' | 'grade_preference' | 'default_gyms'>>) => {
```

- [ ] **Step 3: Update `NewSessionPage` prefill**

In `src/pages/NewSessionPage.tsx`, replace the effect (lines 34-38) so it prefills from the primary (first) default gym:

```tsx
  const primaryGym = profile?.default_gyms?.[0]

  useEffect(() => {
    if (primaryGym && !getValues('location')) {
      setValue('location', primaryGym)
    }
  }, [primaryGym, getValues, setValue])
```

- [ ] **Step 4: Replace the Default Gym block on `ProfilePage`**

In `src/pages/ProfilePage.tsx`:

Replace the state + sync effect (lines 36, 39-40):

```tsx
  const [gyms, setGyms] = useState<string[]>([])
```

```tsx
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setGyms(profile?.default_gyms ?? []) }, [profile?.default_gyms])
```

Replace the "Default Gym" block (lines 169-182) with a multi-gym editor that commits on change:

```tsx
        <div className="w-full">
          <p className="text-xs text-gray-400 text-center mb-2 uppercase tracking-wider font-medium">Default Gyms</p>
          <DefaultGymsEditor
            value={gyms}
            onChange={next => {
              setGyms(next)
              updateProfile.mutate({ default_gyms: next })
            }}
          />
        </div>
```

Add the import near the other component imports (with line 16's `GymInput` import — `GymInput` is still used indirectly by the editor but no longer referenced directly in this file, so remove its import to satisfy `noUnusedLocals`):

```tsx
import { DefaultGymsEditor } from '../components/DefaultGymsEditor'
```

Remove the now-unused `import { GymInput } from '../components/GymInput'` line (line 16).

- [ ] **Step 5: Typecheck + build**

Run: `npm run build`
Expected: PASS — no TypeScript errors, no `noUnusedLocals` failures. If it flags a stray `GymInput` or `defaultGym` reference, remove it.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS — existing tests plus Task 2's helper tests are green.

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, open the app, go to Profile. Add two gyms, confirm the first shows "Primary", use "Make primary" on the second (it moves to top), remove one. Create a new session and confirm Location prefills with the primary gym.

- [ ] **Step 8: Commit**

```bash
git add src/components/DefaultGymsEditor.tsx src/hooks/useProfile.ts src/pages/NewSessionPage.tsx src/pages/ProfilePage.tsx
git commit -m "feat: multi-gym profile editor; switch client to default_gyms array"
```

---

### Task 4: First-login onboarding gate + page

**Files:**
- Create: `src/pages/OnboardingPage.tsx`
- Create: `src/components/OnboardingGate.tsx`
- Modify: `src/App.tsx` (route wiring)

**Interfaces:**
- Consumes: `DefaultGymsEditor` (Task 3); `useProfile`, `useUpdateProfile` (`default_gyms`); `useAuth`.
- Produces: `OnboardingGate` (route element wrapping the app, redirects to `/onboarding` when `default_gyms` is empty); `OnboardingPage` (`/onboarding` route).

- [ ] **Step 1: Create `OnboardingGate`**

Create `src/components/OnboardingGate.tsx`:

```tsx
import { Navigate, Outlet } from 'react-router-dom'
import { useProfile } from '../hooks/useProfile'

export function OnboardingGate() {
  const { data: profile, isLoading } = useProfile()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (profile && (profile.default_gyms?.length ?? 0) === 0) {
    return <Navigate to="/onboarding" replace />
  }

  return <Outlet />
}
```

- [ ] **Step 2: Create `OnboardingPage`**

Create `src/pages/OnboardingPage.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useProfile, useUpdateProfile } from '../hooks/useProfile'
import { DefaultGymsEditor } from '../components/DefaultGymsEditor'
import { normalizeGyms } from '../utils/defaultGyms'

export function OnboardingPage() {
  const navigate = useNavigate()
  const { data: profile } = useProfile()
  const updateProfile = useUpdateProfile()
  const [gyms, setGyms] = useState<string[]>([])

  // Already onboarded? Skip straight to the app.
  useEffect(() => {
    if (profile && (profile.default_gyms?.length ?? 0) > 0) {
      navigate('/dashboard', { replace: true })
    }
  }, [profile, navigate])

  const handleContinue = () => {
    const next = normalizeGyms(gyms)
    if (next.length === 0) return
    updateProfile.mutate(
      { default_gyms: next },
      {
        onSuccess: () => navigate('/dashboard', { replace: true }),
        onError: () => toast.error('Could not save your gyms'),
      },
    )
  }

  return (
    <div className="max-w-md mx-auto p-6 pt-12 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Where do you climb?</h1>
        <p className="text-sm text-gray-500">
          Pick your regular gyms or add a new one. The first is your primary — we'll use it to
          pre-fill new sessions. You can change these anytime on your profile.
        </p>
      </div>

      <DefaultGymsEditor value={gyms} onChange={setGyms} showPopular />

      <button
        type="button"
        onClick={handleContinue}
        disabled={normalizeGyms(gyms).length === 0 || updateProfile.isPending}
        className="w-full bg-sage-700 text-white py-3 rounded-xl font-medium disabled:opacity-50"
      >
        {updateProfile.isPending ? 'Saving…' : 'Continue'}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Wire routes in `App.tsx`**

In `src/App.tsx`, add imports:

```tsx
import { OnboardingPage } from './pages/OnboardingPage'
import { OnboardingGate } from './components/OnboardingGate'
```

Restructure the protected routes so `/onboarding` is reachable (auth-only, outside the gate) and all app routes sit behind `OnboardingGate`. Replace the `<Route element={<ProtectedRoute />}>` block (lines 30-45):

```tsx
            <Route element={<ProtectedRoute />}>
              <Route path="/onboarding" element={<OnboardingPage />} />
              <Route element={<OnboardingGate />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/crews" element={<CrewsPage />} />
                <Route path="/sessions" element={<SessionsPage />} />
                <Route path="/sessions/new" element={<NewSessionPage />} />
                <Route path="/sessions/:id" element={<SessionDetailPage />} />
                <Route path="/sessions/:id/edit" element={<EditSessionPage />} />
                <Route path="/friends/sessions/:sessionId" element={<FriendSessionPage />} />
                <Route path="/challenges" element={<ChallengesPage />} />
                <Route path="/analysis" element={<AnalysisPage />} />
                <Route path="/help" element={<HelpPage />} />
                <Route path="/gym-problems/:id" element={<CrewPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/profile" element={<ProfilePage />} />
              </Route>
            </Route>
```

Note: `OnboardingGate` renders inside `ProtectedRoute`'s chrome only if it is itself inside the `ProtectedRoute` element. Because `ProtectedRoute` renders `<Outlet />` within `AppBar`/`BottomNav`, both `/onboarding` and the gated routes appear inside the app chrome. That is acceptable; the onboarding page is self-contained and the bottom nav simply links back into gated routes (which bounce to `/onboarding` until gyms are set).

- [ ] **Step 4: Typecheck + build**

Run: `npm run build`
Expected: PASS — no TypeScript or `noUnusedLocals` errors.

- [ ] **Step 5: Manual verification**

Run `npm run dev`. Simulate a new user: in the Supabase dashboard set your profile's `default_gyms` to `'{}'` (empty), reload the app. You should be redirected to `/onboarding`. Confirm popular gyms appear as chips, add one via chip and one via the input, mark a primary, click Continue → lands on the dashboard. Reload — you are NOT redirected again. Manually clear `default_gyms` again and confirm the redirect returns.

- [ ] **Step 6: Commit**

```bash
git add src/pages/OnboardingPage.tsx src/components/OnboardingGate.tsx src/App.tsx
git commit -m "feat: first-login onboarding gate to choose or create default gyms"
```

---

## Self-Review

**Spec coverage:**
- Multiple defaults per user (ordered, first = primary) → Task 1 (column), Task 2 (helper), Task 3 (editor + prefill). ✓
- Keep free-text, no gyms table → Task 1 uses `text[]`; no new tables. ✓
- Choose OR create at signup → Task 4 onboarding uses `DefaultGymsEditor` (popular chips = choose; input = create). ✓
- First-login onboarding gate, works for email + OAuth (post-auth) → Task 4 `OnboardingGate` inside `ProtectedRoute`. ✓
- Profile multi-gym management → Task 3 Step 4. ✓
- Consumer prefill via `default_gyms[0]` → Task 3 Step 3 (NewSessionPage); `SessionDetailPage` deliberately untouched (uses `session.location`). ✓
- Pure helper unit-tested → Task 2. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows full code. ✓

**Type consistency:** `default_gyms: string[]` used identically in `useProfile`, `DefaultGymsEditor`, `NewSessionPage`, `OnboardingGate`, `OnboardingPage`. Helper names (`normalizeGyms`, `addGym`, `removeGym`, `moveToFront`, `primaryGym`) match between Task 2 definitions and Task 3/4 usage. ✓
