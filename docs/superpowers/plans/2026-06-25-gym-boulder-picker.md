# Gym Boulder Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a climber add a problem to a session by picking from the session gym's existing shared boulders shown as a photo mosaic, opening a prefilled Add Problem form that logs the problem and claims it onto the boulder.

**Architecture:** Reuses the Crew `gym_problems` data and the existing `useAddProblem` + `useClaimGymProblem` flow — no migration. A new `useGymBoulders(gym)` hook lists active boulders for the session's gym; a `GymBoulderPicker` renders a 3-column photo mosaic; tapping a tile opens `ProblemForm` (gaining a `prefill` prop) seeded from the boulder; on save the problem is created then claimed onto the boulder.

**Tech Stack:** React 18 + TypeScript, `@tanstack/react-query`, Supabase, Tailwind, `react-hot-toast`, Vitest (jsdom).

## Global Constraints

- **No migration / no schema change.** Reuses `gym_problems`, `problems`, and the `claim_gym_problem` RPC.
- **Source = shared `gym_problems`**; **gym scope = the session's `location`** (no gym selector); **only boulders with a non-empty `image_url` are shown** (photos-only mosaic).
- **Tap opens a prefilled `ProblemForm`** (confirm attempts/sent/grade); on save → create problem (`useAddProblem`) then `useClaimGymProblem`. The boulder's photo is reused as the problem `image_url` (no re-upload).
- **`existing` (edit) takes precedence over `prefill`** in `ProblemForm`; with neither set, behavior is unchanged.
- **Tests exist only for pure utilities** (`src/utils/__tests__/`). Components/hooks verified via `npx tsc -b` + `npm run lint` (baseline 17, 0 new) + `npm run build`. TDD only for the pure helper in Task 1.
- **Naming/style:** React Query array keys, `useX` hooks, `sage-700` accent, `lucide-react` icons. Follow existing patterns.

---

### Task 1: `ProblemPrefill` type + `boulderToPrefill` helper (TDD)

**Files:**
- Modify: `src/types/index.ts` (append)
- Create: `src/utils/boulderPrefill.ts`
- Test: `src/utils/__tests__/boulderPrefill.test.ts`

**Interfaces:**
- Consumes: `GymProblem` (existing type).
- Produces (relied on by Tasks 3–5):
  - `interface ProblemPrefill { name: string | null; color: string | null; grade_value: string | null; image_url: string | null; gym: string | null }`
  - `boulderToPrefill(gp: GymProblem): ProblemPrefill`

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/boulderPrefill.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { boulderToPrefill } from '../boulderPrefill'
import type { GymProblem } from '../types'

const boulder: GymProblem = {
  id: 'gp1', gym: 'Boulders Oslo', wall_angle: 'overhang', color: 'Blue',
  community_grade: '6B', name: 'The Prow', image_url: 'https://x/p.jpg',
  created_by: 'u1', set_at: '2026-06-01', expires_at: '2026-07-01',
  status: 'active', created_at: '2026-06-01T00:00:00Z',
}

describe('boulderToPrefill', () => {
  it('maps boulder fields to new-problem defaults', () => {
    expect(boulderToPrefill(boulder)).toEqual({
      name: 'The Prow', color: 'Blue', grade_value: '6B',
      image_url: 'https://x/p.jpg', gym: 'Boulders Oslo',
    })
  })
  it('preserves nulls (no name/color/grade/photo)', () => {
    expect(boulderToPrefill({ ...boulder, name: null, color: null, community_grade: null, image_url: null }))
      .toEqual({ name: null, color: null, grade_value: null, image_url: null, gym: 'Boulders Oslo' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/utils/__tests__/boulderPrefill.test.ts`
Expected: FAIL — cannot resolve module `../boulderPrefill`.

- [ ] **Step 3: Write the helper**

Create `src/utils/boulderPrefill.ts`:

```ts
import type { GymProblem, ProblemPrefill } from '../types'

// New-problem field defaults derived from a shared boulder.
export function boulderToPrefill(gp: GymProblem): ProblemPrefill {
  return {
    name: gp.name,
    color: gp.color,
    grade_value: gp.community_grade,
    image_url: gp.image_url,
    gym: gp.gym,
  }
}
```

- [ ] **Step 4: Add the type**

Append to `src/types/index.ts`:

```ts
export interface ProblemPrefill {
  name: string | null
  color: string | null
  grade_value: string | null
  image_url: string | null
  gym: string | null
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/utils/__tests__/boulderPrefill.test.ts` then `npx tsc -b`
Expected: tests PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/utils/boulderPrefill.ts src/utils/__tests__/boulderPrefill.test.ts
git commit -m "feat: add ProblemPrefill type and boulderToPrefill helper"
```

---

### Task 2: `useGymBoulders` hook

**Files:**
- Modify: `src/hooks/useGymProblems.ts` (add the hook)

**Interfaces:**
- Consumes: `supabase`, `isActiveBoulder` (from `../utils/gymProblems`, already imported in this file), `GymProblem`.
- Produces (relied on by Task 4): `useGymBoulders(gym: string)` → query returning `GymProblem[]` (active boulders for the gym, newest first).

- [ ] **Step 1: Add the hook**

In `src/hooks/useGymProblems.ts`, add (the file already imports `useQuery`, `supabase`, `isActiveBoulder`, and `GymProblem`):

```ts
export function useGymBoulders(gym: string) {
  const g = gym.trim()
  return useQuery({
    queryKey: ['gym_boulders', g.toLowerCase()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gym_problems')
        .select('*')
        .eq('status', 'active')
        .ilike('gym', g)
        .order('created_at', { ascending: false })
      if (error) throw error
      const now = new Date()
      return (data as GymProblem[]).filter(gp => isActiveBoulder(gp, now))
    },
    enabled: g.length > 0,
  })
}
```

(If `isActiveBoulder`/`GymProblem` are not already imported in this file, add them: `import { gymProblemMatches, isActiveBoulder } from '../utils/gymProblems'` and the `GymProblem` type import. Check the existing imports first and only add what's missing.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useGymProblems.ts
git commit -m "feat: add useGymBoulders hook (active boulders for a gym, newest first)"
```

---

### Task 3: `ProblemForm` `prefill` prop

**Files:**
- Modify: `src/components/ProblemForm.tsx`

**Interfaces:**
- Consumes: `ProblemPrefill` (Task 1).
- Produces (relied on by Task 5): `ProblemForm` accepts an optional `prefill?: ProblemPrefill` seeding a NEW problem's `name`/`color`/`grade_value`/`gym`/`image_url`.

- [ ] **Step 1: Add the prop and thread it through defaults**

In `src/components/ProblemForm.tsx`:

Import the type (extend the existing `../types` import): add `ProblemPrefill`.

Add to `ProblemFormProps`:

```ts
  /** Pre-fills a NEW problem's fields from a shared boulder (distinct from `existing`/edit mode). */
  prefill?: ProblemPrefill
```

Destructure it in the component signature (alongside `defaultGym`):

```ts
export function ProblemForm({ onSubmit, isSubmitting, initialGradeSystem = 'font', existing, existingTagIds, defaultGym, prefill }: ProblemFormProps) {
```

Update the `useState` for the image preview:

```ts
  const [previewUrl, setPreviewUrl] = useState<string | null>(existing?.image_url ?? prefill?.image_url ?? null)
```

Update the relevant `defaultValues` (only these four lines change):

```ts
      name: existing?.name ?? prefill?.name ?? '',
      grade_value: existing?.grade_value ?? prefill?.grade_value ?? '',
      color: existing?.color ?? prefill?.color ?? '',
      ...
      gym: existing?.gym ?? prefill?.gym ?? defaultGym ?? '',
```

Update the submit's `image_url` source so a prefilled boulder photo is reused when no new file is chosen:

```ts
    let image_url = previewUrl && !selectedFile ? (existing?.image_url ?? prefill?.image_url ?? null) : null
```

(Everything else in `ProblemForm` is unchanged. `existing` still wins over `prefill` everywhere.)

- [ ] **Step 2: Typecheck, lint, build**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: no type errors, no new lint errors (baseline 17), build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/ProblemForm.tsx
git commit -m "feat: ProblemForm prefill prop for seeding a new problem from a boulder"
```

---

### Task 4: `GymBoulderPicker` component

**Files:**
- Create: `src/components/GymBoulderPicker.tsx`

**Interfaces:**
- Consumes: `useGymBoulders` (Task 2), `GymProblem`.
- Produces (relied on by Task 5): `GymBoulderPicker({ gym, onPick }: { gym: string; onPick: (gp: GymProblem) => void })`.

- [ ] **Step 1: Write the component**

Create `src/components/GymBoulderPicker.tsx`:

```tsx
import { useGymBoulders } from '../hooks/useGymProblems'
import type { GymProblem } from '../types'

export function GymBoulderPicker({
  gym, onPick,
}: { gym: string; onPick: (gp: GymProblem) => void }) {
  const trimmed = gym.trim()
  const { data: boulders = [], isLoading } = useGymBoulders(trimmed)
  const photos = boulders.filter(b => !!b.image_url)

  if (!trimmed) {
    return <p className="text-sm text-gray-400 text-center py-8">Set a gym on this session (Location) to browse its boulders.</p>
  }
  if (isLoading) {
    return <p className="text-sm text-gray-400 text-center py-8">Loading boulders…</p>
  }
  if (photos.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">No shared boulders with photos at {trimmed} yet — log a new one.</p>
  }

  return (
    <div className="grid grid-cols-3 gap-0.5">
      {photos.map(b => (
        <button
          key={b.id}
          type="button"
          onClick={() => onPick(b)}
          className="aspect-square overflow-hidden bg-gray-100"
          title={b.name ?? b.color ?? 'boulder'}
        >
          <img src={b.image_url ?? ''} alt={b.name ?? b.color ?? 'boulder'} className="w-full h-full object-cover" />
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck, lint, build**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: no type errors, no new lint errors, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/GymBoulderPicker.tsx
git commit -m "feat: GymBoulderPicker — photo mosaic of a gym's shared boulders"
```

---

### Task 5: Wire the picker into the add-to-session sheet

**Files:**
- Modify: `src/pages/SessionDetailPage.tsx`

**Interfaces:**
- Consumes: `GymBoulderPicker` (Task 4), `boulderToPrefill` (Task 1), `useClaimGymProblem` (existing, `src/hooks/useGymProblems.ts`), `GymProblem`, the existing `useAddProblem`/`handleAddProblem`.
- Produces: nothing.

**Design:** In the add-sheet "problem" tab, a `[New · From gym]` toggle. "From gym" shows `GymBoulderPicker` for `session.location`. Picking a boulder swaps to a prefilled `ProblemForm`; saving creates the problem then claims it onto the boulder. State resets when the sheet closes.

- [ ] **Step 1: Imports + state + handlers**

In `src/pages/SessionDetailPage.tsx`, add imports:

```tsx
import { GymBoulderPicker } from '../components/GymBoulderPicker'
import { boulderToPrefill } from '../utils/boulderPrefill'
import { useClaimGymProblem } from '../hooks/useGymProblems'
import type { GymProblem } from '../types'  // add to the existing ../types import if present
```

Add state + the claim hook near the other hooks/state (the main component already has `useState`, `addProblem`, `id`, `session`, `myProfile`):

```tsx
  const [problemMode, setProblemMode] = useState<'new' | 'gym'>('new')
  const [pickedBoulder, setPickedBoulder] = useState<GymProblem | null>(null)
  const claimGymProblem = useClaimGymProblem()
```

Add the from-boulder submit handler next to `handleAddProblem`:

```tsx
  const handleAddFromBoulder = (
    values: Omit<Problem, 'id' | 'session_id' | 'user_id' | 'created_at' | 'grade_value_font' | 'grade_value_vscale' | 'gym_problem_id'> & { tagIds?: string[] },
  ) => {
    const boulder = pickedBoulder
    if (!boulder) return
    addProblem.mutate(
      { ...values, session_id: id! },
      {
        onSuccess: (created) => {
          claimGymProblem.mutate(
            { problemId: created.id, gymProblemId: boulder.id },
            { onError: () => toast.error('Logged, but linking to the boulder failed') },
          )
          setSheetOpen(false)
          setPickedBoulder(null)
          setProblemMode('new')
          toast.success('Problem added')
        },
        onError: () => toast.error('Failed to save. Try again.'),
      },
    )
  }
```

(`addProblem.mutate`'s `onSuccess` receives the created `Problem` — `useAddProblem` returns `data as Problem`.)

- [ ] **Step 2: Reset picker state when the sheet closes**

Update the add-sheet `BottomSheet`'s `onClose` to clear the picker state:

```tsx
        onClose={() => { setSheetOpen(false); setPickedBoulder(null); setProblemMode('new') }}
```

- [ ] **Step 3: Render the toggle / picker / prefilled form in the "problem" tab**

Replace the `sheetTab === 'problem' ?` branch body (the current `<ProblemForm ... />`) with:

```tsx
        {sheetTab === 'problem' ? (
          pickedBoulder ? (
            <div>
              <button
                type="button"
                onClick={() => setPickedBoulder(null)}
                className="text-xs font-medium text-sage-700 hover:text-sage-900 mb-2"
              >
                ← Back to boulders
              </button>
              <ProblemForm
                onSubmit={handleAddFromBoulder}
                isSubmitting={addProblem.isPending}
                initialGradeSystem={myProfile?.grade_preference ?? 'font'}
                defaultGym={session.location}
                prefill={boulderToPrefill(pickedBoulder)}
              />
            </div>
          ) : (
            <div>
              <div className="flex rounded-lg overflow-hidden border mb-3 text-xs">
                {(['new', 'gym'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setProblemMode(m)}
                    className={`flex-1 py-1.5 font-medium transition-colors ${
                      problemMode === m ? 'bg-sage-700 text-white' : 'bg-white text-gray-600'
                    }`}
                  >
                    {m === 'new' ? 'New' : 'From gym'}
                  </button>
                ))}
              </div>
              {problemMode === 'new' ? (
                <ProblemForm
                  onSubmit={handleAddProblem}
                  isSubmitting={addProblem.isPending}
                  initialGradeSystem={myProfile?.grade_preference ?? 'font'}
                  defaultGym={session.location}
                />
              ) : (
                <GymBoulderPicker gym={session.location} onPick={setPickedBoulder} />
              )}
            </div>
          )
        ) : sheetTab === 'exercise' ? (
```

(Leave the `exercise`/`test`/`challenge` branches exactly as they are.)

- [ ] **Step 4: Typecheck, lint, build**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: no type errors, no new lint errors (baseline 17), build succeeds.

- [ ] **Step 5: Manual verification**

With `npm run dev` and migrations applied: open a session whose Location is a gym that has shared boulders with photos → Add → "From gym" → see the photo mosaic → tap a boulder → the form opens prefilled (photo, color, grade) → adjust attempts/sent → Save → the problem appears in the session and shows "On a shared boulder" (claimed onto the boulder / on its crew). "From gym" with no Location shows the set-a-gym message; a gym with no photo'd boulders shows the empty message.

- [ ] **Step 6: Commit**

```bash
git add src/pages/SessionDetailPage.tsx
git commit -m "feat: pick an existing gym boulder when adding a problem to a session"
```

---

## Self-Review

**Spec coverage:**
- Pick from shared boulders → Tasks 2/4/5 ✓
- Gym scope = session location, auto → Task 5 (`gym={session.location}`) ✓
- Photos-only mosaic → Task 4 (`.filter(b => !!b.image_url)`) ✓
- Tap → prefilled form → Task 5 (`pickedBoulder` → `ProblemForm prefill`) ✓
- Save logs + claims onto the boulder → Task 5 (`handleAddFromBoulder` → addProblem then claimGymProblem) ✓
- `prefill` distinct from `existing`, photo reused → Task 3 ✓
- Empty states (no location / no photo'd boulders) → Task 4 ✓
- `boulderToPrefill` unit-tested → Task 1 ✓
- No migration → confirmed (no SQL task) ✓

**Placeholder scan:** No TBD/TODO; every code step is complete.

**Type consistency:** `ProblemPrefill` (Task 1) consumed by Tasks 3/5 and produced by `boulderToPrefill`. `useGymBoulders(gym): GymProblem[]` (Task 2) consumed by Task 4. `GymBoulderPicker({gym,onPick})` (Task 4) matches Task 5's usage (`onPick={setPickedBoulder}`, `setPickedBoulder: (gp: GymProblem) => void`). `useClaimGymProblem().mutate({ problemId, gymProblemId })` matches the existing hook signature. `handleAddFromBoulder` uses the same `Omit<Problem, ...>` shape as `handleAddProblem`/`useAddProblem`. ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-25-gym-boulder-picker.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
