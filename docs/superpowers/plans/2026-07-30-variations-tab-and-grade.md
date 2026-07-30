# Variations Tab & Variation Grade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move boulder variations out of the Beta tab into their own counted tab, and let a variation carry its own grade so the app can say "the blue 6C goes at 7A without the crimp".

**Architecture:** One nullable column (`challenges.grade`) plus one new tab key. The comparison against the boulder's grade is **derived at render time by a pure function**, never stored, so it stays correct if either grade changes. The tab exists only when its panel has something to render, so tab and content can never disagree.

**Tech Stack:** React 18 + TypeScript, Vite, React Query (array query keys), Supabase (Postgres + RLS), Tailwind (`sage` palette), `lucide-react`, `react-hot-toast`, `BottomSheet` for modals, Vitest for pure utils.

**Spec:** [docs/superpowers/specs/2026-07-30-variations-tab-and-grade-design.md](../specs/2026-07-30-variations-tab-and-grade-design.md)

## Global Constraints

- **Vocabulary:** user-facing copy says **"variation"**, never "challenge", on the boulder page. A *challenge* is the portable dare at `/challenges`; a *variation* is a constraint on one specific shared boulder. The schema keeps saying `challenges`.
- **Build:** `npm run build` is `tsc -b && vite build`. `noUnusedLocals` and `noUnusedParameters` are ON — an unused local, import, or destructured prop is a build-failing error. `api/` is checked separately by Vercel; this plan touches no `api/` files.
- **Lint:** `npm run lint` has a baseline of pre-existing problems. **Measure it yourself before starting** (`npm run lint 2>&1 | grep problems`) and add **zero**. Do not trust a number quoted anywhere else.
- **Tests:** Vitest, and **only pure functions in `src/utils/`** are tested. There is no `@testing-library/react`. Hooks, components and pages are verified by `npm run build` plus a manual pass. Do not add component or hook tests.
- **Migrations are applied by hand in the Supabase dashboard**, never by tooling from this repo. Writing the `.sql` file is the deliverable.
- **Grades are free text stored in whichever scale the setter prefers** (`profile.grade_preference`, `'font' | 'v_scale'`). Converting Font↔V needs the gym's own `gym_gradings` mapping table, so **never compare across scales**.
- **Hooks cannot be called after an early return.** `CrewPage` returns early at line 246 (`if (!boulder)`); any new hook call goes above that, with the other hooks.
- **`BottomSheet` must never render inside a heading** — it inherits the font weight and is invalid markup.
- **Commit after every task.** Do not squash tasks together.

---

### Task 1: `gradeDelta` pure util

The only logic here worth testing: how a variation's grade reads against its boulder's.

**Files:**
- Create: `src/utils/gradeDelta.ts`
- Test: `src/utils/gradeDelta.test.ts`

**Interfaces:**
- Consumes: `FONT_GRADES_ORDERED`, `V_GRADES`, `gradeSystemFor` from `src/utils/grades.ts`. Both grade arrays are ordered easiest-first (`FONT_GRADES_ORDERED` starts `'3'`, ends `'9A'`; `V_GRADES` starts `'VB'`, ends `'V17'`), so a difference of indices within one array is a difference in grades. `gradeSystemFor(grade)` returns `'font' | 'v_scale'` by testing `/^v/i`.
- Produces: `gradeDelta(boulderGrade: string | null | undefined, variationGrade: string | null | undefined): string | null` — used by Task 5.

- [ ] **Step 1: Write the failing test**

Create `src/utils/gradeDelta.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { gradeDelta } from './gradeDelta'

describe('gradeDelta', () => {
  it('says how much harder a variation is', () => {
    expect(gradeDelta('6C', '7A')).toBe('2 harder than 6C')
  })

  it('says how much softer a variation is', () => {
    expect(gradeDelta('6C', '6B+')).toBe('1 softer than 6C')
  })

  it('says when a variation grades the same', () => {
    expect(gradeDelta('6C', '6C')).toBe('same as 6C')
  })

  it('works on the V scale too', () => {
    expect(gradeDelta('V4', 'V6')).toBe('2 harder than V4')
    expect(gradeDelta('V4', 'V3')).toBe('1 softer than V4')
  })

  it('spans the full width of each scale', () => {
    expect(gradeDelta('3', '9A')).toBe('22 harder than 3')
    expect(gradeDelta('VB', 'V17')).toBe('18 harder than VB')
  })

  it('has nothing to say when either grade is missing', () => {
    expect(gradeDelta(null, '7A')).toBeNull()
    expect(gradeDelta('6C', null)).toBeNull()
    expect(gradeDelta(undefined, undefined)).toBeNull()
    expect(gradeDelta('', '7A')).toBeNull()
  })

  it('refuses to compare across scales', () => {
    expect(gradeDelta('6C', 'V5')).toBeNull()
    expect(gradeDelta('V5', '6C')).toBeNull()
  })

  it('refuses to compare a grade it does not recognise', () => {
    expect(gradeDelta('6C', '7Z')).toBeNull()
    expect(gradeDelta('nonsense', '7A')).toBeNull()
    expect(gradeDelta('V4', 'V99')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/utils/gradeDelta.test.ts`
Expected: FAIL — `Failed to resolve import "./gradeDelta"`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/utils/gradeDelta.ts`:

```ts
import { FONT_GRADES_ORDERED, V_GRADES, gradeSystemFor } from './grades'

/**
 * How a variation's grade reads against its boulder's, as a phrase for display:
 * "2 harder than 6C". Derived at render time rather than stored, so it stays
 * true if either grade is later changed.
 *
 * Returns null whenever there is no honest comparison to make — a missing grade,
 * two different scales (converting Font↔V needs the gym's own mapping table), or
 * a string that isn't a grade we know. Both columns are free text, so an
 * unrecognised value is a real possibility, and a nonsense number would be worse
 * than saying nothing.
 */
export function gradeDelta(
  boulderGrade: string | null | undefined,
  variationGrade: string | null | undefined,
): string | null {
  if (!boulderGrade || !variationGrade) return null

  const system = gradeSystemFor(boulderGrade)
  if (system !== gradeSystemFor(variationGrade)) return null

  const scale = system === 'v_scale' ? V_GRADES : FONT_GRADES_ORDERED
  const from = scale.indexOf(boulderGrade)
  const to = scale.indexOf(variationGrade)
  if (from === -1 || to === -1) return null

  const steps = to - from
  if (steps === 0) return `same as ${boulderGrade}`
  return `${Math.abs(steps)} ${steps > 0 ? 'harder' : 'softer'} than ${boulderGrade}`
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run src/utils/gradeDelta.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/gradeDelta.ts src/utils/gradeDelta.test.ts
git commit -m "Add gradeDelta util comparing a variation's grade with its boulder's"
```

---

### Task 2: Migration 077

**Files:**
- Create: `supabase/migrations/077_variation_grade.sql`

**Interfaces:**
- Consumes: the `challenges` table, and `challenges.gym_problem_id` from migration 076.
- Produces: `challenges.grade text` nullable — read by Task 3's query, written by Task 3's mutations.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/077_variation_grade.sql`:

```sql
-- A variation can carry its own grade: eliminating a hold can make the same
-- boulder harder or softer than the original, and a climber wants to know which
-- before they pull on.
--
-- Free text, exactly like gym_problems.community_grade -- stored in whichever
-- scale the setter prefers (profiles.grade_preference), so a consumer may only
-- compare two grades within one scale. No check constraint: the grade
-- vocabularies live in src/utils/grades.ts and a constraint here would have to be
-- kept in step with them by hand.
--
-- ORDER: apply after 074, 075 and 076. See 076's header for why 074 must never be
-- re-run after 076.

alter table challenges add column if not exists grade text;
```

- [ ] **Step 2: Confirm no policy work is needed**

Writing `grade` needs an UPDATE policy on `challenges`. Confirm migration 076 already added one, so this migration needs nothing further:

```bash
grep -n "challenges for update" supabase/migrations/*.sql
```

Expected: one match, in `076_boulder_variations.sql`. If it is missing, stop and report — Task 3's regrade mutation would silently no-op.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/077_variation_grade.sql
git commit -m "Add migration 077: a variation carries its own grade"
```

---

### Task 3: Grade in the data layer

**Files:**
- Modify: `src/hooks/useVariations.ts`

**Interfaces:**
- Consumes: `challenges.grade` from Task 2.
- Produces, for Task 5:
  - `Variation` gains `grade: string | null`
  - `useCreateVariation()` mutation input gains `grade: string | null` — full input is now `{ gymProblemId, title, description, videoUrl, tags, grade }`
  - `useUpdateVariationGrade()` → mutation over `{ challengeId: string; gymProblemId: string; grade: string | null }`

- [ ] **Step 1: Add `grade` to the `Variation` interface**

In `src/hooks/useVariations.ts`, in the `Variation` interface, after `video_url`:

```ts
  video_url: string | null
  /** The setter's grade for the variation itself, which may be harder or softer
   *  than the boulder's. Free text in the setter's own scale; compare only
   *  within one scale (see utils/gradeDelta). */
  grade: string | null
```

- [ ] **Step 2: Select it**

In `useVariations`' first query, add `grade` to the select list so it reads:

```ts
        .select('id, title, description, video_url, grade, creator_id, created_at')
```

- [ ] **Step 3: Accept it when creating**

In `useCreateVariation`, add `grade` to the mutation's input type and to the insert:

```ts
    mutationFn: async (v: {
      gymProblemId: string
      title: string
      description: string | null
      videoUrl: string | null
      tags: string[]
      grade: string | null
    }) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase.from('challenges').insert({
        creator_id: user.id,
        gym_problem_id: v.gymProblemId,
        title: v.title,
        description: v.description,
        video_url: v.videoUrl,
        tags: v.tags,
        grade: v.grade,
        is_public: true,
      })
      if (error) throw error
    },
```

- [ ] **Step 4: Add the regrade mutation**

Append to `src/hooks/useVariations.ts`:

```ts
/**
 * Change a variation's grade. The only field a setter can edit from the boulder
 * page, and it exists because a variation has no delete path — without this, a
 * mis-graded variation would be permanent. Relies on the `challenges` UPDATE
 * policy added by migration 076; without it this silently affects zero rows.
 */
export function useUpdateVariationGrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { challengeId: string; gymProblemId: string; grade: string | null }) => {
      const { error } = await supabase
        .from('challenges')
        .update({ grade: v.grade })
        .eq('id', v.challengeId)
      if (error) throw error
    },
    onSuccess: (_data, v) => {
      qc.invalidateQueries({ queryKey: ['variations', v.gymProblemId] })
      qc.invalidateQueries({ queryKey: ['challenges'] })
    },
  })
}
```

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: FAILS, on `src/components/BoulderVariations.tsx` — its `useCreateVariation` call now lacks the required `grade` property. That is expected at this point; Task 5 supplies it. To keep this task's commit green on its own, add `grade: null` to that existing call site in `BoulderVariations.tsx` as a placeholder value only — Task 5 replaces it with the real control. Re-run `npm run build` and expect exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useVariations.ts src/components/BoulderVariations.tsx
git commit -m "Carry a variation's own grade through the data layer"
```

---

### Task 4: The Variations tab

**Files:**
- Modify: `src/utils/boulderNav.ts`
- Modify: `src/pages/CrewPage.tsx`
- Modify: `src/components/AppBar.tsx`
- Modify: `src/components/BoulderVariations.tsx`

**Interfaces:**
- Consumes: `useVariations(gymProblemId)` → `{ data?: Variation[]; isError: boolean }`.
- Produces: `BoulderTab` includes `'variations'`; the boulder page renders `BoulderVariations` under `activeTab === 'variations'`.

- [ ] **Step 1: Add the tab key**

In `src/utils/boulderNav.ts`, extend the union:

```ts
export type BoulderTab = 'beta' | 'sendtrain' | 'variations'
```

`CrewPage` declares `type Tab = BoulderTab`, so it picks this up with no further change.

- [ ] **Step 2: Query variations in `CrewPage`, above the early returns**

In `src/pages/CrewPage.tsx`, add the import beside the other hook imports:

```ts
import { useVariations } from '../hooks/useVariations'
```

Then add the hook call **with the other hook calls near the top of the component, above the `if (!boulder)` early return at line 246** — a hook after an early return breaks the rules of hooks:

```ts
  const { data: variations = [], isError: variationsError } = useVariations(id)
```

This costs no extra request: `BoulderVariations` uses the same `['variations', id]` array key, so React Query serves both from one cached result.

- [ ] **Step 3: Build the tab list**

Replace the `TABS` array (around line 364, just above `const displayGrade`) with:

```ts
  const variationsReadOnly = boulder.status !== 'active' || left < 0
  // The tab exists only when its panel has something to render, so tab and
  // content can never disagree: the query fails until migrations 076/077 are
  // applied, and an archived boulder with no variations renders nothing.
  const showVariationsTab = !variationsError && !(variationsReadOnly && variations.length === 0)

  const TABS: { key: Tab; label: string }[] = [
    { key: 'beta', label: 'Beta' },
    { key: 'sendtrain', label: 'Sendtrain' },
    ...(showVariationsTab ? [{ key: 'variations' as Tab, label: `Variations (${variations.length})` }] : []),
  ]

  // A notification can carry openTab: 'variations' while the tab is hidden.
  // Falling back beats rendering a blank hero screen.
  const activeTab: Tab = TABS.some(t => t.key === tab) ? tab : 'beta'
```

- [ ] **Step 4: Render against `activeTab`**

Still in `src/pages/CrewPage.tsx`, change the four tab comparisons to use `activeTab` instead of `tab`. Leave `setTab` alone — it stores the user's raw choice; `activeTab` is only for deciding what to show.

- In the tab row (around line 520): `tab === t.key` becomes `activeTab === t.key`.
- Also in the tab row, change the label class `text-sm` to `text-xs`: `Variations (0)` is the longest label this row has carried, and three `flex-1` tabs each get a third of a 375px phone.
- The sendtrain panel (around line 529): `{tab === 'sendtrain' && (` becomes `{activeTab === 'sendtrain' && (`.
- The beta panel (around line 583): `{tab === 'beta' && (` becomes `{activeTab === 'beta' && (`.

- [ ] **Step 5: Move the panel into its own tab**

In `src/pages/CrewPage.tsx`, remove the `<BoulderVariations …/>` element from the top of the beta panel (it currently sits directly above the `{/* Beta exchange overview */}` comment), so that block begins with its original first child again.

Then add a new panel immediately **after** the closing of the beta panel block:

```tsx
        {activeTab === 'variations' && (
          <BoulderVariations gymProblemId={id} readOnly={variationsReadOnly} />
        )}
```

Note `readOnly` now uses the `variationsReadOnly` const from Step 3 rather than repeating the expression, so the tab's visibility and the panel's own guard can't drift apart.

- [ ] **Step 6: Drop the panel's now-redundant heading**

In `src/components/BoulderVariations.tsx`, the panel's header row contains `<p className="text-xs font-semibold text-gray-500">🧩 Variations</p>` beside the ＋ Set a variation button. The tab label says "Variations" now, so remove that `<p>` while keeping the button and the row's layout — the button should stay right-aligned, so keep the `justify-between` container and the surrounding card.

- [ ] **Step 7: Point the notification at the new tab**

In `src/components/AppBar.tsx`, the `variation_cleared` navigation state currently reads `{ openTab: 'beta' }`. Change it to:

```ts
      ? { state: { openTab: 'variations' } satisfies BoulderNavState }
```

Leave the surrounding comment accurate — it explains that the clip lives on a particular tab, and that tab is now Variations. `openTab` still applies on mount only, which is documented in `boulderNav.ts` and unchanged.

- [ ] **Step 8: Verify build, tests and lint**

Run: `npm run build`
Expected: exit 0.

Run: `npx vitest run`
Expected: all pass.

Run: `npm run lint 2>&1 | grep problems`
Expected: the same count you measured before starting.

- [ ] **Step 9: Commit**

```bash
git add src/utils/boulderNav.ts src/pages/CrewPage.tsx src/components/AppBar.tsx src/components/BoulderVariations.tsx
git commit -m "Give variations their own counted tab on the boulder page"
```

---

### Task 5: The grade in the UI

**Files:**
- Modify: `src/components/BoulderVariations.tsx`
- Modify: `src/pages/CrewPage.tsx` (one new prop on the mount added in Task 4)

**Interfaces:**
- Consumes: `gradeDelta(boulderGrade, variationGrade)` from Task 1 (returns a phrase or `null`); `Variation.grade`, `useCreateVariation`'s `grade` input, and `useUpdateVariationGrade()` from Task 3; `FONT_GRADES_ORDERED` and `V_GRADES` from `src/utils/grades.ts`; `useProfile()` from `src/hooks/useProfile.ts`, whose data has `grade_preference: 'font' | 'v_scale'`; `Chip` from `src/components/Chip.tsx`, which takes `{ label, variant }` and renders a `sage-700` pill for `variant="grade"`.
- Produces: `BoulderVariations` gains a required prop `boulderGrade: string | null`.

- [ ] **Step 1: Pass the boulder's grade in**

In `src/pages/CrewPage.tsx`, the page already computes `const displayGrade = boulder.community_grade ?? crew?.communityGrade ?? null`. Pass it to the panel added in Task 4:

```tsx
        {activeTab === 'variations' && (
          <BoulderVariations gymProblemId={id} readOnly={variationsReadOnly} boulderGrade={displayGrade} />
        )}
```

- [ ] **Step 2: Accept the prop and thread it to both sheets**

In `src/components/BoulderVariations.tsx`, add `boulderGrade: string | null` to the `BoulderVariations` props type and destructure it. Pass it to both child sheets — `VariationSheet` and `SetVariationSheet` — adding `boulderGrade: string | null` to each of their props types too. `noUnusedLocals` is on, so wire it through in the same edit as the uses below rather than leaving any of them unused.

Add these imports to the file:

```ts
import { Chip } from './Chip'
import { useProfile } from '../hooks/useProfile'
import { FONT_GRADES_ORDERED, V_GRADES } from '../utils/grades'
import { gradeDelta } from '../utils/gradeDelta'
```

- [ ] **Step 3: Show the grade on each row**

In the variation list, the `variations.map(v => (…))` callback has an expression body. Give it a block body so the comparison is computed once, and add the chip beside the title and the phrase to the metadata line. The title row becomes a flex row so an ungraded variation looks exactly as it does today:

```tsx
          {variations.map(v => {
            const delta = gradeDelta(boulderGrade, v.grade)
            return (
              <button key={v.id} type="button" onClick={() => setSelected(v)}
                className="w-full text-left rounded-xl bg-gray-50 px-2.5 py-2 hover:bg-gray-100">
                <div className="flex items-start gap-1.5">
                  <p className="flex-1 text-sm font-medium text-gray-800 leading-snug">{v.title}</p>
                  {v.grade && <Chip label={v.grade} variant="grade" className="flex-shrink-0" />}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[11px] text-gray-400 truncate">
                    {v.creator_name ?? 'Someone'}
                  </span>
                  {delta && <span className="text-[11px] text-gray-400 truncate">{delta}</span>}
```

Leave the rest of the row — the clear avatars, the "n cleared" count and the play icon — exactly as it is, and close the new block body with `)` and `})` in place of the old `)`.

- [ ] **Step 4: Show and edit the grade in the detail sheet**

In `VariationSheet`, compute the comparison once in the component body, beside the existing `isCreator`:

```tsx
  const delta = gradeDelta(boulderGrade, variation.grade)
```

Then in the block holding the title, description and "set by" line, insert the grade display directly **after** the description and **before** the "set by" paragraph:

```tsx
          {variation.grade && (
            <div className="mt-1.5 flex items-center gap-2">
              <Chip label={variation.grade} variant="grade" />
              {delta && <span className="text-xs text-gray-500">{delta}</span>}
            </div>
          )}
```

Then, for the creator only, add the regrade control. Put it immediately after the existing "This is your variation…" line, inside the same `isCreator` branch, so a non-creator never sees a grade control:

```tsx
              <div className="mt-2 flex items-center gap-2">
                <select value={gradeDraft} onChange={e => setGradeDraft(e.target.value)}
                  className="flex-1 border rounded-lg px-2.5 py-2 text-sm">
                  <option value="">No grade</option>
                  {grades.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <button type="button" onClick={saveGrade} disabled={updateGrade.isPending}
                  className="rounded-lg bg-sage-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {updateGrade.isPending ? 'Saving…' : 'Save grade'}
                </button>
              </div>
```

backed by this state and handler in the component body — note the option list and the `grade_preference` lookup are identical to Step 5's, and the empty option matters because a setter must be able to clear a grade they set by mistake:

```tsx
  const { data: profile } = useProfile()
  const grades = profile?.grade_preference === 'v_scale' ? V_GRADES : FONT_GRADES_ORDERED
  const updateGrade = useUpdateVariationGrade()
  const [gradeDraft, setGradeDraft] = useState(variation.grade ?? '')

  const saveGrade = () => {
    updateGrade.mutate(
      { challengeId: variation.id, gymProblemId, grade: gradeDraft || null },
      {
        onSuccess: () => toast.success('Grade updated'),
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not save the grade'),
      },
    )
  }
```

**Two traps here, both of which will bite silently if you skip them.**

First, `VariationSheet`'s hooks run *above* its `if (!variation) return null` guard (`BoulderVariations.tsx:96-101`), and `variation` is typed `Variation | null`. So the initialiser must be `useState(variation?.grade ?? '')` — optional chaining, not `variation.grade`, which will not typecheck. `gymProblemId` is already a prop of this sheet.

Second, and worse: the sheet is **always mounted** — `BoulderVariations.tsx:85` renders it unconditionally and it returns `null` internally when nothing is selected. So `useState` initialises exactly once, while `variation` is still null, and `gradeDraft` would stay `''` no matter which variation you open. Tapping **Save grade** on a variation graded `7A` would then write `null` and erase it. Fix it at the mount by keying the sheet on the selection so it remounts each time:

```tsx
      <VariationSheet key={selected?.id ?? 'none'} variation={selected} onClose={() => setSelected(null)} gymProblemId={gymProblemId} readOnly={readOnly} />
```

Verify this by hand before committing: open a graded variation, confirm its select shows that grade rather than "No grade", close it, open a differently-graded one, and confirm the select updates.

Keep the sheet's existing clear-form logic untouched otherwise: the creator still sees the "this is your variation" line rather than a clear form, and a non-creator still sees the clear form exactly as before.

- [ ] **Step 5: Add the grade control to the set-a-variation sheet**

In `SetVariationSheet`, add optional grade state and a `<select>` between the "Detail" field and the "Demo video" field:

```tsx
  const { data: profile } = useProfile()
  const grades = profile?.grade_preference === 'v_scale' ? V_GRADES : FONT_GRADES_ORDERED
  const [grade, setGrade] = useState('')
```

```tsx
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Grade (optional)</label>
          <select value={grade} onChange={e => setGrade(e.target.value)}
            className="w-full border rounded-lg px-3 py-2.5">
            <option value="">No grade</option>
            {grades.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <p className="mt-1 text-xs text-gray-400">
            {boulderGrade
              ? `Harder or softer than the boulder's ${boulderGrade}? Say so.`
              : 'Grade the variation itself, if you can.'}
          </p>
        </div>
```

Pass `grade: grade || null` in the `useCreateVariation` mutation call, replacing the `grade: null` placeholder Task 3 left there, and reset `setGrade('')` alongside the other fields in the success handler.

- [ ] **Step 6: Verify build, tests and lint**

Run: `npm run build`
Expected: exit 0. An error about an unused prop means one of `boulderGrade`'s three hand-offs in Step 2 has no consumer yet.

Run: `npx vitest run`
Expected: all pass.

Run: `npm run lint 2>&1 | grep problems`
Expected: the same count you measured before starting.

- [ ] **Step 7: Commit**

```bash
git add src/components/BoulderVariations.tsx src/pages/CrewPage.tsx
git commit -m "Show, set and regrade a variation's own grade"
```

---

### Task 6: The two discovery surfaces land on the tab

A boulder marked as carrying a variation should open on the tab that marker advertises. Both list surfaces already navigate with `BoulderNavState`.

**Files:**
- Modify: `src/components/LatestProblemsStrip.tsx`
- Modify: `src/components/CrewsSection.tsx`

**Interfaces:**
- Consumes: `BoulderTab` including `'variations'` and the `BoulderNavState` type from `src/utils/boulderNav.ts` (Task 4); `BoulderSummary.hasVariation: boolean`, which already exists.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Open the Variations tab from the home strip**

In `src/components/LatestProblemsStrip.tsx`, the ring's `onClick` currently navigates with only `boulderIds`. Add `openTab` when the boulder carries a variation, keeping `boulderIds` so prev/next paging still works. Inside the existing `stories.map(b => { … })` block body, alongside the `label` const:

```tsx
            // The caption already says "· Variation" — honour what drew the tap
            // and land on that tab. openTab applies on mount, which is always the
            // case arriving from the dashboard.
            const navState: BoulderNavState = b.hasVariation
              ? { boulderIds: storyIds, openTab: 'variations' }
              : { boulderIds: storyIds }
```

and change the `onClick` to use it:

```tsx
              onClick={() => navigate(`/gym-problems/${b.id}`, { state: navState })}
```

The file already imports `BoulderNavState` as a type; the `satisfies BoulderNavState` on the old inline object goes away with it, since the const is now explicitly typed.

- [ ] **Step 2: Mark and link variations in the Gym problems overview**

In `src/components/CrewsSection.tsx`, `BoulderRow` is a single `<Link>` with `state={{ boulderIds } satisfies BoulderNavState}`. Replace that state with the same conditional shape:

```tsx
  const navState: BoulderNavState = b.hasVariation
    ? { boulderIds, openTab: 'variations' }
    : { boulderIds }
```

```tsx
      state={navState}
```

Then add the marker this row never had, immediately **after** the existing `{b.helpWanted && (…)}` badge so the two flags sit together:

```tsx
      {b.hasVariation && (
        <span title="Has a variation" aria-label="Has a variation" className="text-sm leading-none flex-shrink-0">🧩</span>
      )}
```

A 🧩 badge rather than the strip's `· Variation` text: this row's established idiom for a flag is an emoji beside 🆘, and its text budget already goes to the title and grade.

- [ ] **Step 3: Verify build, tests and lint**

Run: `npm run build`
Expected: exit 0. `noUnusedLocals` will catch a `navState` you forgot to use, and a stale `satisfies BoulderNavState` left on a removed inline object is a syntax error.

Run: `npx vitest run`
Expected: all pass.

Run: `npm run lint 2>&1 | grep problems`
Expected: the same count you measured before starting.

- [ ] **Step 4: Commit**

```bash
git add src/components/LatestProblemsStrip.tsx src/components/CrewsSection.tsx
git commit -m "Open the Variations tab from the strip and the gym problems list"
```

---

## Release gate

**Migration 077 must be applied by hand in the Supabase dashboard.** The full outstanding order is **074 → 075 → 076 → 077**, and **074 must never be re-run after 076** — it recreates `beta_points_reason_check` without the two variation reasons, and the award trigger has no exception handler, so a clear would fail outright rather than merely go unpaid.

Between 076 and 077 the Variations tab is hidden entirely, because `useVariations` selects `grade` and the query fails without the column. That is the intended degradation, not a bug — but it means 077 is required for the feature to be visible at all, not just for grading.

## Manual verification pass

- [ ] Tab row reads **Beta | Sendtrain | Variations (n)**, with `n` matching the rows inside, and the label fits without wrapping on a phone-width viewport.
- [ ] The tab is absent on a boulder whose variations query fails, and absent on an archived boulder with no variations; present on an archived boulder that has some, with no ＋ Set a variation button and no clear form.
- [ ] Set a variation graded **harder** than the boulder: the row shows the grade chip and "2 harder than 6C"; the detail sheet shows the same.
- [ ] Set one graded **softer**, and one with **no grade**: the softer one reads "1 softer than …", the ungraded one shows no chip and no phrase, and the row looks as it did before this change.
- [ ] On a boulder with **no** community grade, a graded variation shows its chip and **no** comparison phrase.
- [ ] As the setter, regrade a variation from the detail sheet and confirm it persists after a reload; clear the grade back to "No grade" and confirm that persists too.
- [ ] As a **non**-setter, confirm there is no grade control in the detail sheet.
- [ ] With a V-scale `grade_preference`, confirm the set sheet offers V grades and that a V-graded variation on a Font-graded boulder shows the chip with no comparison phrase.
- [ ] Tap a "cleared your variation" notification and confirm it opens the **Variations** tab.
- [ ] Tap a `· Variation`-marked ring in the home strip and confirm it opens the **Variations** tab; tap an unmarked one and confirm it still opens on Sendtrain as before.
- [ ] In the Gym problems overview, confirm a variation-bearing boulder shows a 🧩 beside any 🆘, that tapping it opens the **Variations** tab, and that prev/next paging still works from there (proving `boulderIds` survived).
