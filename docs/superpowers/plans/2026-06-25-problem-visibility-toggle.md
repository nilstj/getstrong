# Problem Visibility Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Private/Public visibility toggle to a problem so that marking it Public links it to a shared boulder (join an existing one or create a new one), reusing the existing crew/points/beta machinery.

**Architecture:** "Public" is *derived* — it means `problems.gym_problem_id` is set. No schema change. The `ProblemForm` gains a segmented Private/Public control (indoor only) that reports a transient `makePublic` flag. After a problem is saved Public, `SessionDetailPage` opens a `BoulderLinkSheet` (the match-or-create UI extracted from the retired `GymProblemMatcher`) to join or create a boulder and claim onto it. Editing a Public problem back to Private unclaims it (the boulder stays for others).

**Tech Stack:** React 18 + TypeScript + Vite, `@tanstack/react-query`, `react-hook-form`, `react-hot-toast`, Tailwind (`sage-700` accent), `lucide-react`, `react-router-dom`.

## Global Constraints

- No DB migration: visibility is derived from `problems.gym_problem_id` — never add a column.
- `makePublic` is a transient form flag, NOT a `Problem`/DB field. It must never reach an `addProblem`/`updateProblem` mutate object (Postgres rejects unknown columns).
- Public is indoor-only (a shared boulder needs a gym). The toggle is hidden when outdoor.
- ESLint baseline is **17 problems** — introduce **0 new**. `noUnusedLocals`/`noUnusedParameters` are ON: any unused import/local fails `npx tsc -b` and the Vercel build.
- **Lint gotcha (verified):** `@typescript-eslint/no-unused-vars` runs with default options here — `ignoreRestSiblings` is **false** and there is **no** `^_` ignore pattern. So a `_`-prefixed or destructured-but-unused `makePublic` binding **fails lint**. Two safe idioms only: (a) destructure `makePublic` and genuinely *use* it (like the existing `tagIds`), or (b) never bind it. This plan keeps `makePublic` out of payloads where it isn't used by **emitting the key from `ProblemForm` only when the toggle is shown** (`!isOutdoor && !prefill`), so the from-gym handler needs no change.
- Verification per task: `npx tsc -b` (clean) + `npm run lint` (≤17) + `npm run build` (succeeds). There is no SQL/component test harness here; only pure utils are unit-tested, and this feature introduces no new pure logic, so no new unit tests.
- Accent color `sage-700`; match existing Tailwind idioms in the touched files.

---

### Task 1: Extract `BoulderLinkSheet` component

Create a standalone match-or-create sheet by relocating the sheet body + join/create logic out of `GymProblemMatcher`. It is opened programmatically (controlled `open` prop) rather than owning its own trigger button. Not wired into any page yet — this task only creates the component and verifies it compiles.

**Files:**
- Create: `src/components/BoulderLinkSheet.tsx`

**Interfaces:**
- Consumes (existing hooks, unchanged): `useMatchingGymProblems({ gym, color })`, `useCreateGymProblem()` (input `{ gym, color, wall_angle, name, image_url, beta_video_url }`), `useClaimGymProblem()` (input `{ problemId, gymProblemId }`), `daysUntil(expires_at, now)`.
- Produces: `export function BoulderLinkSheet({ problem, open, onClose, onDone }: { problem: Problem; open: boolean; onClose: () => void; onDone: () => void })`. Calls `onDone()` after a successful join or create+claim.

- [ ] **Step 1: Create the component file**

Create `src/components/BoulderLinkSheet.tsx`:

```tsx
import toast from 'react-hot-toast'
import { Plus } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import {
  useMatchingGymProblems,
  useCreateGymProblem,
  useClaimGymProblem,
} from '../hooks/useGymProblems'
import { daysUntil } from '../utils/gymProblems'
import type { Problem } from '../types'

export function BoulderLinkSheet({
  problem,
  open,
  onClose,
  onDone,
}: {
  problem: Problem
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const { data: matches = [], isLoading } = useMatchingGymProblems({
    gym: problem.gym,
    color: problem.color,
  })
  const create = useCreateGymProblem()
  const claim = useClaimGymProblem()

  const join = (gymProblemId: string) => {
    claim.mutate(
      { problemId: problem.id, gymProblemId },
      {
        onSuccess: () => onDone(),
        onError: () => toast.error('Could not join'),
      },
    )
  }

  const createNew = () => {
    create.mutate(
      {
        gym: problem.gym!,
        color: problem.color,
        wall_angle: null,
        name: problem.name,
        image_url: problem.image_url,
        beta_video_url: problem.beta_video_url,
      },
      {
        onSuccess: gp => join(gp.id),
        onError: () => toast.error('Could not create boulder'),
      },
    )
  }

  const now = new Date()

  return (
    <BottomSheet open={open} onClose={onClose} title="Publish to the gym">
      <p className="text-sm text-gray-500 mb-4">
        {[problem.color, problem.gym].filter(Boolean).join(' at ') || 'Share this boulder'}. Is it one of these?
      </p>

      {isLoading ? (
        <p className="text-sm text-gray-400">Searching…</p>
      ) : (
        <div className="space-y-2">
          {matches.map(gp => {
            const left = daysUntil(gp.expires_at, now)
            return (
              <button
                key={gp.id}
                onClick={() => join(gp.id)}
                disabled={claim.isPending}
                className="w-full flex items-center gap-3 p-3 border rounded-xl text-left hover:bg-gray-50 disabled:opacity-50"
              >
                {gp.image_url && (
                  <img src={gp.image_url} alt="" className="w-12 h-12 object-cover rounded-lg" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {gp.name || `${gp.color ?? ''} ${gp.wall_angle ?? ''}`.trim() || 'Shared boulder'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {left >= 0 ? `${left} days left` : 'expired'}
                  </p>
                </div>
              </button>
            )
          })}
          {matches.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">
              No matching boulder yet. Be the first to log it.
            </p>
          )}

          <button
            onClick={createNew}
            disabled={create.isPending || claim.isPending}
            className="w-full flex items-center justify-center gap-2 p-3 mt-2 border border-dashed border-sage-300 rounded-xl text-sm font-medium text-sage-700 hover:bg-sage-50 disabled:opacity-50"
          >
            <Plus size={15} strokeWidth={2.2} /> No, it&apos;s new — create it
          </button>
        </div>
      )}
    </BottomSheet>
  )
}
```

Notes:
- When `problem.color` is null, `useMatchingGymProblems` returns no matches, so the sheet naturally shows only the "create it" action (spec: no-color → create-only).
- The component is not yet imported anywhere; `noUnusedLocals` only flags unused locals *within* a compiled file, not an un-imported module, so this compiles clean.

- [ ] **Step 2: Verify it compiles and lints**

Run: `npx tsc -b && npm run lint`
Expected: tsc clean; lint reports ≤17 problems (no new ones).

- [ ] **Step 3: Commit**

```bash
git add src/components/BoulderLinkSheet.tsx
git commit -m "feat: BoulderLinkSheet — extractable match-or-create boulder sheet

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Visibility toggle + add-path publish + retire `GymProblemMatcher`

Add the Private/Public segmented control to `ProblemForm` (indoor only, hidden when prefilled-from-gym) and thread a transient `makePublic` flag through the submit payload — emitted **only when the toggle is shown**, so the from-gym handler is untouched. Wire the add-new path to open `BoulderLinkSheet` on a Public save, relocate the crew indicator onto the card, and delete the now-unused `GymProblemMatcher`.

The edit form will also render the toggle (it's indoor, no prefill), so this task also makes `EditProblemSheet` *drop* `makePublic` before saving — edit saves keep working; publishing/unpublishing via edit is wired in Task 3.

**Files:**
- Modify: `src/components/ProblemForm.tsx` (props type ~27; state ~44; submit payload ~116; indoor fields ~179)
- Modify: `src/pages/SessionDetailPage.tsx` (import ~33; `linkProblem` state ~82; `handleAddProblem` ~115; card render ~315–316; `BoulderLinkSheet` render ~608; `EditProblemSheet` `onSubmit` ~634)
- Delete: `src/components/GymProblemMatcher.tsx`

**Interfaces:**
- Produces: `ProblemFormProps.onSubmit` payload type gains optional `makePublic?: boolean`. The key is present in the emitted object only for indoor, non-prefill forms; its value is `visibilityPublic`.
- Produces: `const [linkProblem, setLinkProblem] = useState<Problem | null>(null)` in `SessionDetailPage` — non-null renders `BoulderLinkSheet` for that problem.
- `handleAddProblem` destructures `makePublic` and uses it; `handleAddFromBoulder` is unchanged (no `makePublic` key reaches it).

- [ ] **Step 1: Add `makePublic` to the `onSubmit` prop type**

In `src/components/ProblemForm.tsx`, change the `onSubmit` line in `interface ProblemFormProps` (line ~27) from:

```tsx
  onSubmit: (values: Omit<Problem, 'id' | 'session_id' | 'user_id' | 'created_at' | 'grade_value_font' | 'grade_value_vscale' | 'gym_problem_id'> & { tagIds?: string[] }) => void
```

to:

```tsx
  onSubmit: (values: Omit<Problem, 'id' | 'session_id' | 'user_id' | 'created_at' | 'grade_value_font' | 'grade_value_vscale' | 'gym_problem_id'> & { tagIds?: string[]; makePublic?: boolean }) => void
```

- [ ] **Step 2: Add visibility state**

In `ProblemForm`, right after the `isOutdoor` state (line ~44), add:

```tsx
  const [visibilityPublic, setVisibilityPublic] = useState<boolean>(!!existing?.gym_problem_id)
```

- [ ] **Step 3: Emit `makePublic` only when the toggle is shown**

In `submit`, change the `onSubmit({ ... })` call (line ~116) to conditionally include the key as the last entry. The condition matches the toggle's render condition (Step 4):

```tsx
    onSubmit({
      tagIds: Array.from(selectedTagIds),
      name: values.name || null,
      grade_system: initialGradeSystem,
      grade_value: values.grade_value || null,
      color: isOutdoor ? null : (values.color || null),
      attempts: values.attempts,
      sent: values.sent,
      board: isOutdoor ? null : (values.board || null),
      board_angle: (!isOutdoor && values.board && values.board_angle !== '') ? Number(values.board_angle) : null,
      gym: isOutdoor ? null : (values.gym || null),
      crag: isOutdoor ? (values.crag || null) : null,
      image_url,
      beta_video_url: values.beta_video_url || null,
      notes: values.notes || null,
      ...(!isOutdoor && !prefill ? { makePublic: visibilityPublic } : {}),
    })
```

(Outdoor and from-gym forms therefore omit the `makePublic` key entirely — those handlers never see it.)

- [ ] **Step 4: Render the toggle as the first indoor-only field**

In the indoor-only block (`{!isOutdoor && ( <> ...`, line ~179–180), insert this control as the FIRST child of the fragment, before the existing Training Board `<div>`:

```tsx
      {!isOutdoor && (
        <>
          {!prefill && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Visibility</label>
              <div className="flex rounded-lg overflow-hidden border text-sm">
                <button
                  type="button"
                  onClick={() => setVisibilityPublic(false)}
                  className={`flex-1 py-2 font-medium transition-colors ${
                    !visibilityPublic ? 'bg-sage-700 text-white' : 'bg-white text-gray-500'
                  }`}
                >
                  🔒 Private
                </button>
                <button
                  type="button"
                  onClick={() => setVisibilityPublic(true)}
                  className={`flex-1 py-2 font-medium transition-colors ${
                    visibilityPublic ? 'bg-sage-700 text-white' : 'bg-white text-gray-500'
                  }`}
                >
                  🌐 Public
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Public boulders appear under “From gym” so others can log them, compare beta, and earn points.
              </p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Training Board (optional)</label>
```

(Everything from the Training Board `<div>` onward is unchanged.)

- [ ] **Step 5: Verify `ProblemForm` in isolation**

Run: `npx tsc -b && npm run lint`
Expected: tsc clean; lint ≤17. (`SessionDetailPage` still compiles: `handleAddProblem` receives an optional extra key that rides into `addProblem.mutate` for now — fixed in Step 8 before any commit.)

- [ ] **Step 6: Swap the import in `SessionDetailPage`**

In `src/pages/SessionDetailPage.tsx`, replace the matcher import (line ~33):

```tsx
import { GymProblemMatcher } from '../components/GymProblemMatcher'
```

with:

```tsx
import { BoulderLinkSheet } from '../components/BoulderLinkSheet'
```

- [ ] **Step 7: Add `linkProblem` state**

After the `openCommentProblemId` state (line ~82), add:

```tsx
  const [linkProblem, setLinkProblem] = useState<Problem | null>(null)
```

- [ ] **Step 8: Use `makePublic` in `handleAddProblem`**

Replace `handleAddProblem` (line ~115) so a Public add opens `BoulderLinkSheet` instead of toasting. Destructuring `makePublic` keeps it out of the mutate object, and it is genuinely used:

```tsx
  const handleAddProblem = ({ makePublic, ...values }: Omit<Problem, 'id' | 'session_id' | 'user_id' | 'created_at' | 'grade_value_font' | 'grade_value_vscale' | 'gym_problem_id'> & { tagIds?: string[]; makePublic?: boolean }) => {
    addProblem.mutate(
      { ...values, session_id: id! },
      {
        onSuccess: (created) => {
          setSheetOpen(false); setProblemMode('new'); setPickedBoulder(null)
          if (makePublic) {
            setLinkProblem(created)
          } else {
            toast.success('Problem added')
          }
        },
        onError: () => toast.error('Failed to save. Try again.'),
      },
    )
  }
```

(`handleAddFromBoulder` is left exactly as-is: the from-gym form omits `makePublic`, so nothing rides into its mutate.)

- [ ] **Step 9: Replace the card matcher with an inline crew indicator**

In the card render, replace line ~316 (`<GymProblemMatcher problem={problem} />`), keeping `<CallForHelp problem={problem} />` above it:

```tsx
                <CallForHelp problem={problem} />
                {problem.gym_problem_id && (
                  <Link
                    to={`/gym-problems/${problem.gym_problem_id}`}
                    className="inline-flex items-center gap-1 mt-1.5 text-xs text-sage-700 font-medium hover:underline"
                  >
                    🌐 On a shared boulder · View the crew
                  </Link>
                )}
```

(`Link` from `react-router-dom` is already imported and used in this file.)

- [ ] **Step 10: Render the `BoulderLinkSheet`**

Just before `{lightboxUrl && ...}` (line ~608), add:

```tsx
      {linkProblem && (
        <BoulderLinkSheet
          problem={linkProblem}
          open
          onClose={() => setLinkProblem(null)}
          onDone={() => { setLinkProblem(null); toast.success('Published to the gym') }}
        />
      )}
```

(Dismissing via `onClose` without joining/creating leaves the problem private — matches the spec's error-handling row.)

- [ ] **Step 11: Stop `EditProblemSheet` from sending `makePublic` to the DB**

The edit form renders the toggle (indoor, no prefill), so its payload now carries `makePublic`. Until Task 3 wires edit-publish, drop it. Change the `EditProblemSheet` `<ProblemForm>` `onSubmit` (line ~634) from:

```tsx
        onSubmit={({ tagIds = [], ...vals }) => onSave(vals, tagIds)}
```

to:

```tsx
        onSubmit={(payload) => {
          const { tagIds = [], ...vals } = payload
          delete vals.makePublic
          onSave(vals, tagIds)
        }}
```

(`vals` is typed `Omit<Problem, …> & { makePublic?: boolean }`; `makePublic` is optional, so `delete vals.makePublic` type-checks and binds no unused variable.)

- [ ] **Step 12: Delete the retired matcher**

```bash
git rm src/components/GymProblemMatcher.tsx
```

Confirm nothing else references it:

Run: `grep -rn "GymProblemMatcher" src/`
Expected: no matches.

- [ ] **Step 13: Verify**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: tsc clean; lint ≤17; build succeeds.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat: Private/Public visibility toggle with publish-on-add; retire GymProblemMatcher

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Edit-path publish / unpublish

Thread `makePublic` from the edit form through `EditProblemSheet.onSave` so editing can publish a private problem (open `BoulderLinkSheet`) or unpublish a public one (unclaim; the boulder stays for others).

**Files:**
- Modify: `src/pages/SessionDetailPage.tsx` (`EditProblemSheet` render `onSave` ~573; `EditProblemSheet` `onSave` type ~620 and `onSubmit` ~634)

**Interfaces:**
- Consumes: `linkProblem`/`setLinkProblem` + `BoulderLinkSheet` (Task 2), `claimGymProblem` (`useClaimGymProblem`, already declared at line ~105), `updateProblem` (line ~85).
- Produces: `EditProblemSheet.onSave` becomes `(values, tagIds, makePublic?: boolean) => void`.

- [ ] **Step 1: Widen `onSave` and forward `makePublic`**

In the `EditProblemSheet` definition (line ~613), change the `onSave` type (line ~620) from:

```tsx
  onSave: (values: Omit<Problem, 'id' | 'session_id' | 'user_id' | 'created_at' | 'grade_value_font' | 'grade_value_vscale' | 'gym_problem_id'>, tagIds: string[]) => void
```

to:

```tsx
  onSave: (values: Omit<Problem, 'id' | 'session_id' | 'user_id' | 'created_at' | 'grade_value_font' | 'grade_value_vscale' | 'gym_problem_id'>, tagIds: string[], makePublic?: boolean) => void
```

And change its `<ProblemForm>` `onSubmit` (line ~634, set in Task 2 to delete `makePublic`) to forward it instead:

```tsx
        onSubmit={(payload) => {
          const { tagIds = [], makePublic, ...vals } = payload
          onSave(vals, tagIds, makePublic)
        }}
```

(`makePublic` is now used — passed to `onSave` — so the destructure is lint-clean.)

- [ ] **Step 2: Branch the edit `onSave` handler**

In the `EditProblemSheet` render (line ~568), replace the `onSave` prop with the branching version:

```tsx
        <EditProblemSheet
          problem={editingProblem}
          sessionId={id!}
          gradeSystem={myProfile?.grade_preference ?? 'font'}
          onClose={() => setEditingProblem(null)}
          onSave={(values, tagIds, makePublic) => updateProblem.mutate(
            { id: editingProblem.id, sessionId: id!, tagIds, ...values },
            {
              onSuccess: () => {
                const isLinked = !!editingProblem.gym_problem_id
                if (makePublic && !isLinked) {
                  // Private → Public: pick/create a boulder for the just-saved problem.
                  setLinkProblem({ ...editingProblem, ...values })
                  setEditingProblem(null)
                } else if (!makePublic && isLinked) {
                  // Public → Private: unclaim (the boulder stays for others).
                  claimGymProblem.mutate(
                    { problemId: editingProblem.id, gymProblemId: null },
                    { onError: () => toast.error('Could not make private') },
                  )
                  setEditingProblem(null)
                  toast.success('Made private')
                } else {
                  setEditingProblem(null)
                  toast.success('Problem updated')
                }
              },
              onError: () => toast.error('Failed to update'),
            },
          )}
          isSaving={updateProblem.isPending}
        />
```

Notes:
- `{ ...editingProblem, ...values }` is a full `Problem`: it carries the *edited* gym/color (so the boulder match uses new values) while keeping the original `id` and the still-null `gym_problem_id`. `BoulderLinkSheet` claims onto `problem.id`; react-query invalidation then refreshes the card's `gym_problem_id`.
- Unpublish is a no-op when the problem isn't actually linked (the `isLinked` guard).

- [ ] **Step 3: Verify**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: tsc clean; lint ≤17; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/pages/SessionDetailPage.tsx
git commit -m "feat: publish/unpublish a problem from the edit form

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Manual QA (after Task 3)

Run `npm run dev` against a session whose location is a gym:
1. Add a New indoor problem with a photo, toggle **🌐 Public**, save → `BoulderLinkSheet` opens; "create it" → toast "Published to the gym"; the card shows "🌐 On a shared boulder · View the crew"; the boulder appears under add-to-session **From gym**.
2. Add another Public problem of the same gym+color → the sheet lists the first boulder to join.
3. Add a New problem left **🔒 Private** → no sheet, card has no crew link, not in From-gym.
4. Edit a private problem → **Public** → sheet opens → join/create links it.
5. Edit a public problem → **Private** → toast "Made private"; card crew link disappears; the boulder still shows in From-gym for others.
6. Confirm the old "Find this boulder's crew" button no longer appears anywhere; "View the crew" still reaches `/gym-problems/:id`.
7. Switch a problem to **🌲 Outdoor** → the Visibility toggle is hidden; saving sends no `makePublic`.

## Self-Review

**1. Spec coverage:**
- Toggle in ProblemForm, indoor-only, default Private, value flows to handler → Task 2 (steps 2–4) ✓
- Toggle initializes from `existing.gym_problem_id` on edit → Task 2 step 2 ✓
- Reusable match-or-create sheet extracted from `GymProblemMatcher` → Task 1 ✓
- No-color → create-only → Task 1 (matches empty when color null) ✓
- Add Public → run flow + claim → Task 2 steps 8, 10 ✓
- Add Private → unchanged → Task 2 step 8 (else branch) ✓
- Edit Private→Public → open sheet → Task 3 step 2 ✓
- Edit Public→Private → unclaim, boulder stays → Task 3 step 2 ✓
- Remove "Find this boulder's crew" button → Task 2 step 12 (file deleted) ✓
- Relocate "On a shared boulder · View the crew" onto card → Task 2 step 9 ✓
- Visibility derived from `gym_problem_id`, no migration → Global Constraints; no migration task ✓
- Error handling: link fails → problem stays saved/private (toasts on claim/create error; dismiss leaves private) → Tasks 1 & 2 ✓; outdoor toggle hidden → Task 2 steps 3–4 ✓; unpublish-when-unlinked no-op → Task 3 step 2 guard ✓

**2. Placeholder scan:** No TBD/TODO/"handle errors appropriately"; every code step shows full code. ✓

**3. Type consistency:** `makePublic?: boolean` is identical across `ProblemFormProps.onSubmit` and `EditProblemSheet.onSave`. `BoulderLinkSheet` props `{ problem, open, onClose, onDone }` match between Task 1 (definition) and Task 2/3 (usage). `setLinkProblem` takes `Problem | null`; both call sites pass a full `Problem` (`created`, and `{ ...editingProblem, ...values }`). `useClaimGymProblem` input `{ problemId, gymProblemId }` matches existing usage (`gymProblemId: null` to unclaim). ✓

**4. Lint safety:** Every `makePublic` binding is either used (`handleAddProblem`, Task 3 `onSubmit`/`onSave`) or deleted without binding (Task 2 step 11), and the from-gym handler never receives the key — consistent with the verified `no-unused-vars` gotcha in Global Constraints. ✓
