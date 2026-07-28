# Publish a Gym Boulder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a climber publish a shared boulder straight from `/gym-problems`, with a grade, instead of only as a by-product of logging a private problem inside a session.

**Architecture:** Migration 075 replaces the 7-argument `create_gym_problem` with an 8-argument version that also writes `community_grade`; the new parameter defaults to null so the currently deployed client keeps working. A new self-contained sheet component collects gym, photo, grade and colours and calls the existing `useCreateGymProblem` hook, and a FAB on the Gym problems page opens it. No claim, no `Problem` row, no session.

**Tech Stack:** PostgreSQL / Supabase (plpgsql, `SECURITY DEFINER`, Storage), React 19, TypeScript, TanStack Query v5, Tailwind (custom `sage` palette), lucide-react, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-28-publish-a-gym-boulder-design.md`

## Global Constraints

- **Publishing does NOT join the boulder.** No `Problem` row, no `claim_gym_problem`, no session. `created_by` records the publisher; the sendtrain stays empty until someone logs a send. A freshly published boulder showing an empty sendtrain is correct, not a bug to paper over.
- **The bottom-bar `+` is not touched.** It keeps going to `/sessions/new`. The only new entry point is a FAB on `/gym-problems`.
- **Fields are exactly:** gym, photo, grade, gym-grading colour, hold colour. No wall angle, no name, no setter, no beta video. `gym_problems.name` is written as `null` — this app removed problem names.
- **Only the gym is required.** `create_gym_problem` raises `'gym is required'` without it, so the submit button stays disabled until a gym is set. Everything else may be null.
- **The grade dropdown offers the publisher's own scale** — `FONT_GRADES_ORDERED` when `profile.grade_preference` is `'font'`, `V_GRADES` when it is `'v_scale'` — and the chosen string is stored verbatim. Do not normalise or convert between scales.
- **A blank grade stores null,** never an empty string.
- **Migration 075 must drop the 7-argument `create_gym_problem` and create an 8-argument one** whose new parameter has `default null`. Adding a parameter does not replace a function; it creates a second signature, and a 7-argument call would then be ambiguous.
- **Do not apply the migration.** Migrations are applied by hand in the Supabase dashboard. Write the file and stop.
- **New SQL carries** `set search_path = public, pg_temp`, and the `first_logger` photo gate from 074 must survive verbatim.
- **`npm run build` must pass** (`tsc -b` with `noUnusedLocals`).
- **`npm run lint` must not add problems. Measure the baseline yourself first** with `npm run lint` before changing anything, and report both numbers — the baseline drifts, so a number quoted in a doc is not evidence.
- **`npx vitest run` must pass** — 137 tests across 17 files at the time of writing; confirm the count yourself.
- **Only pure functions in `src/utils/` get tests.** This project has no `@testing-library/react`. Do not write component or hook tests and do not add test tooling. This work adds no pure utils, so it adds no tests.
- **Tailwind classes only.** No inline `style` attributes, no CSS files.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/075_gym_problem_community_grade.sql` | *(create)* Drop the 7-arg `create_gym_problem`, create the 8-arg version, write `community_grade`. |
| `src/hooks/useGymProblems.ts` | *(modify)* `useCreateGymProblem` accepts `community_grade` and passes `p_community_grade`. |
| `src/components/BoulderLinkSheet.tsx` | *(modify)* Pass `community_grade: null` so the existing publish-from-a-session path keeps compiling and behaving identically. |
| `src/components/AddGymBoulderSheet.tsx` | *(create)* The form: gym, photo, grade, gym-grading colour, hold colour. Owns its field state and the image upload. |
| `src/pages/CrewsPage.tsx` | *(modify)* Add the FAB that opens the sheet. |

Task order keeps the tree green and the feature reachable only once it works: SQL first (no client depends on it yet), then the hook plus its two call sites in one task (so no call site is ever left with the wrong shape), then the sheet, then the FAB that reveals it.

---

### Task 1: Migration 075 — accept a grade at creation

**Files:**
- Create: `supabase/migrations/075_gym_problem_community_grade.sql`

**Interfaces:**
- Consumes: `gym_problems` (044), `beta_points` (046), and the current 7-argument `create_gym_problem` from `074_beta_points_scheme.sql`.
- Produces: `create_gym_problem(p_gym, p_color, p_wall_angle, p_name, p_image_url, p_beta_video_url default null, p_hold_color default null, p_community_grade default null)`. Task 2 calls it with all 8 named arguments.

Facts already verified — do not re-derive:
- `gym_problems.community_grade` already exists (`044_gym_problems.sql:12`). No `alter table` is needed.
- The current function is the 7-argument version in `074_beta_points_scheme.sql`, which itself photo-gates the `first_logger` award and carries `set search_path = public, pg_temp`.
- `051_boulder_video.sql:8` and `068_gym_problem_hold_color.sql:8` already dropped the 5- and 6-argument versions, so the 7-argument one is the only survivor.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/075_gym_problem_community_grade.sql` with exactly this content:

```sql
-- Let the publisher state a boulder's grade at creation.
--
-- community_grade has existed since 044 ("crowd consensus; null until enough
-- data") but nothing ever wrote it, so every consumer — the home story strip,
-- CrewsSection, GymBoulderPicker, CreateBattleSheet — has been rendering a blank
-- grade. The climber standing at the wall publishing the boulder is the
-- best-placed person in the system to say what it is.
--
-- Adding a parameter does NOT replace a function, it creates a second signature,
-- and a 7-arg call against both would be ambiguous. So drop the 7-arg version and
-- create an 8-arg one whose new parameter defaults to null — which also means a
-- client still sending only the old 7 named arguments resolves here cleanly, so
-- this migration is safe to apply before the new client is deployed.
--
-- Body is 074's verbatim, including the first_logger photo gate; the only changes
-- are the new parameter and community_grade in the insert.

drop function if exists public.create_gym_problem(text, text, text, text, text, text, text);

create or replace function public.create_gym_problem(
  p_gym             text,
  p_color           text,
  p_wall_angle      text,
  p_name            text,
  p_image_url       text,
  p_beta_video_url  text default null,
  p_hold_color      text default null,
  p_community_grade text default null
)
returns gym_problems as $$
declare
  v_user_id uuid := auth.uid();
  v_row     gym_problems;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if p_gym is null or length(trim(p_gym)) = 0 then
    raise exception 'gym is required';
  end if;

  insert into public.gym_problems
    (gym, color, hold_color, wall_angle, name, image_url, beta_video_url, community_grade, created_by)
  values
    (trim(p_gym), p_color, p_hold_color, p_wall_angle, p_name, p_image_url, p_beta_video_url,
     nullif(trim(coalesce(p_community_grade, '')), ''), v_user_id)
  returning * into v_row;

  -- first_logger: 10 points, ONLY with a photo. No photo means no row at all, so
  -- the ledger never claims a zero-point award happened.
  if p_image_url is not null and length(trim(p_image_url)) > 0 then
    insert into public.beta_points (user_id, gym, gym_problem_id, points, reason, cycle_month)
    values (v_user_id, v_row.gym, v_row.id, 10, 'first_logger',
            to_char((now() at time zone 'utc'), 'YYYY-MM'));
  end if;

  return v_row;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;
```

`nullif(trim(coalesce(p_community_grade, '')), '')` is what turns a blank grade
into null rather than an empty string — the readers all test truthiness, and `''`
would render as a stray separator.

- [ ] **Step 2: Read it back against 074**

Run: `diff <(sed -n '/^create or replace function public.create_gym_problem/,/^\$\$ language plpgsql/p' supabase/migrations/074_beta_points_scheme.sql) <(sed -n '/^create or replace function public.create_gym_problem/,/^\$\$ language plpgsql/p' supabase/migrations/075_gym_problem_community_grade.sql)`

Expected: differences ONLY in the parameter list (the added `p_community_grade`),
the insert's column list and value list (the added `community_grade`), and
whitespace from reformatting that insert across lines. If the diff shows any
change to the auth check, the gym check, the photo gate, the points value, the
`cycle_month` expression or the `return`, you have drifted — fix it.

- [ ] **Step 3: Confirm the drop targets the right signature**

Run: `grep -n "drop function if exists public.create_gym_problem" supabase/migrations/*.sql`

Expected: three hits — `051` (5-arg), `068` (6-arg), and your new `075` with
exactly seven `text` arguments. Seven is deliberate: it is the signature 074
defined, and it is what must go so the 8-arg version is unambiguous.

- [ ] **Step 4: Confirm nothing else changed**

Run: `npm run build && npx vitest run`

Expected: build clean; tests pass. This task touches no TypeScript, so any
movement means you edited something you shouldn't have.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/075_gym_problem_community_grade.sql
git commit -m "Add migration 075: accept a community grade at boulder creation"
```

**Do not apply this migration.** The human applies it in the Supabase dashboard.

---

### Task 2: Hook accepts a grade

**Files:**
- Modify: `src/hooks/useGymProblems.ts` (the `useCreateGymProblem` mutation)
- Modify: `src/components/BoulderLinkSheet.tsx` (its `create.mutate` call)

**Interfaces:**
- Consumes: the 8-argument RPC from Task 1.
- Produces: `useCreateGymProblem()` whose `mutate` takes
  `{ gym: string; color: string | null; hold_color: string | null; wall_angle: string | null; name: string | null; image_url: string | null; beta_video_url: string | null; community_grade: string | null }`
  and resolves to a `GymProblem`. Task 3 calls it with exactly that shape.

- [ ] **Step 1: Add the field to the mutation**

In `src/hooks/useGymProblems.ts`, inside `useCreateGymProblem`, add
`community_grade: string | null` to the `values` type and `p_community_grade:
values.community_grade` to the `supabase.rpc('create_gym_problem', { … })`
argument object. Leave the existing `onSuccess` invalidation of
`['gym_problems']` exactly as it is — it is what makes a new boulder appear in
the list and the home strip without any extra work.

- [ ] **Step 2: Update the existing call site**

`src/components/BoulderLinkSheet.tsx` publishes a boulder from a session problem.
It must keep behaving exactly as today — that path has no grade to offer, because
a private problem's grade is the climber's own opinion, not the boulder's. In its
`createNew` function, add one line to the object passed to `create.mutate`:

```tsx
        beta_video_url: problem.beta_video_url,
        community_grade: null,
```

- [ ] **Step 3: Verify the build catches nothing else**

Run: `npm run build`

Expected: clean. The new required field means `tsc` fails at any call site you
missed, so a clean build here is the proof that both are updated.

- [ ] **Step 4: Confirm there are exactly two call sites**

Run: `grep -rn "useCreateGymProblem\|community_grade" src/hooks/useGymProblems.ts src/components/BoulderLinkSheet.tsx`

Expected: the hook's definition and its `p_community_grade` line, plus
`BoulderLinkSheet`'s import, its `const create = useCreateGymProblem()`, and its
new `community_grade: null`.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGymProblems.ts src/components/BoulderLinkSheet.tsx
git commit -m "Pass a community grade through the create-boulder hook"
```

---

### Task 3: AddGymBoulderSheet

**Files:**
- Create: `src/components/AddGymBoulderSheet.tsx`

**Interfaces:**
- Consumes: `useCreateGymProblem()` from Task 2, with the 8-field shape given there.
- Produces: `<AddGymBoulderSheet open={boolean} onClose={() => void} />`. Task 4 renders it.

Existing pieces this composes, with their real shapes — do not reinvent them:

```ts
BottomSheet   // { open, onClose, title, children } — renders its own backdrop,
              // sticky header and × button; returns null when open is false
useProfile()  // no arg = signed-in user; .default_gyms is string[];
              // .grade_preference is 'font' | 'v_scale'
useGymGradings(gym: string | null)  // GymGrading[] = { gym, color_name, rank, points }[],
              // ordered by rank ascending (easiest first)
TapeGraphic({ color, size })  // from './Chip' — a gym grading colour swatch
HoldGraphic({ color, size })  // from './Chip' — a tinted hold silhouette
HOLD_COLORS   // from '../utils/holdColors' — { name: string; hex: string }[]
FONT_GRADES_ORDERED, V_GRADES  // from '../utils/grades' — string[]
useAuth()     // { user } — user.id, needed for the storage path
supabase      // from '../lib/supabase'
```

No test: this project has no React test harness. Verification is the build plus
Task 4's manual pass.

- [ ] **Step 1: Create the component**

Create `src/components/AddGymBoulderSheet.tsx`:

```tsx
import { useState, useRef } from 'react'
import { Camera, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { BottomSheet } from './BottomSheet'
import { TapeGraphic, HoldGraphic } from './Chip'
import { useAuth } from '../providers/AuthProvider'
import { useProfile } from '../hooks/useProfile'
import { useGymGradings } from '../hooks/useGymGradings'
import { useCreateGymProblem } from '../hooks/useGymProblems'
import { HOLD_COLORS } from '../utils/holdColors'
import { FONT_GRADES_ORDERED, V_GRADES } from '../utils/grades'
import { supabase } from '../lib/supabase'

// Copied verbatim from ProblemForm so the two forms are visually identical.
const INPUT = 'w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500'
const PILL = 'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors'
const PILL_ON = 'border-sage-700 bg-sage-700 text-white'
const PILL_OFF = 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'

/** Row label in the compact two-column layout the problem form uses. */
function RowLabel({ children }: { children: React.ReactNode }) {
  return <span className="pt-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">{children}</span>
}

/**
 * Publishes a shared boulder straight to a gym — no session, no private problem,
 * no claim. The publisher is recorded as created_by and earns first_logger; they
 * join the sendtrain later by logging a send like anyone else.
 */
export function AddGymBoulderSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const create = useCreateGymProblem()

  const defaultGyms = profile?.default_gyms ?? []
  const [gym, setGym] = useState('')
  const [grade, setGrade] = useState('')
  const [color, setColor] = useState('')
  const [holdColor, setHoldColor] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // The gym drives which grading colours exist, so it has to be chosen first.
  const effectiveGym = gym || defaultGyms[0] || ''
  const { data: gymGradings = [] } = useGymGradings(effectiveGym || null)
  const grades = profile?.grade_preference === 'v_scale' ? V_GRADES : FONT_GRADES_ORDERED

  const reset = () => {
    setGym(''); setGrade(''); setColor(''); setHoldColor('')
    setFile(null); setPreviewUrl(null)
  }

  const close = () => { reset(); onClose() }

  const pickFile = (f: File | null) => {
    setFile(f)
    setPreviewUrl(f ? URL.createObjectURL(f) : null)
  }

  const submit = async () => {
    if (!effectiveGym) return

    let image_url: string | null = null
    if (file && user) {
      setUploading(true)
      try {
        const ext = file.name.split('.').pop() ?? 'jpg'
        const path = `${user.id}/${Date.now()}.${ext}`
        const { error } = await supabase.storage.from('problem-images').upload(path, file, { upsert: true })
        if (!error) {
          image_url = supabase.storage.from('problem-images').getPublicUrl(path).data.publicUrl
        }
      } finally {
        setUploading(false)
      }
    }

    create.mutate(
      {
        gym: effectiveGym,
        color: color || null,
        hold_color: holdColor || null,
        wall_angle: null,
        // This app has no problem names; the column is written as null everywhere.
        name: null,
        image_url,
        beta_video_url: null,
        community_grade: grade || null,
      },
      {
        onSuccess: () => { toast.success('Published to the gym'); close() },
        onError: () => toast.error('Could not publish this boulder'),
      },
    )
  }

  const busy = uploading || create.isPending

  return (
    <BottomSheet open={open} onClose={close} title="Add a gym boulder">
      <div className="grid grid-cols-[68px_1fr] items-start gap-x-2.5 gap-y-2.5">
        <RowLabel>Gym</RowLabel>
        <div>
          {defaultGyms.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {defaultGyms.map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => { setGym(g); setColor('') }}
                  aria-pressed={effectiveGym === g}
                  className={`${PILL} ${effectiveGym === g ? PILL_ON : PILL_OFF}`}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
          <input
            type="text"
            value={gym}
            onChange={e => { setGym(e.target.value); setColor('') }}
            placeholder="e.g. Boulders Oslo"
            className={INPUT}
          />
        </div>

        <RowLabel>Photo</RowLabel>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => pickFile(e.target.files?.[0] ?? null)}
          />
          {previewUrl ? (
            <div className="relative inline-block">
              <img src={previewUrl} alt="Boulder preview" className="h-16 w-16 rounded-lg border object-cover" />
              <button
                type="button"
                onClick={() => pickFile(null)}
                aria-label="Remove photo"
                className="absolute -right-2 -top-2 rounded-full border bg-white p-0.5 shadow"
              >
                <X className="h-3.5 w-3.5 text-gray-600" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`${PILL} ${PILL_OFF} inline-flex items-center gap-1.5`}
            >
              <Camera className="h-3.5 w-3.5" /> Add photo
            </button>
          )}
          <p className="mt-1 text-[11px] text-gray-400">Earns 10 points with a photo.</p>
        </div>

        <RowLabel>Grade</RowLabel>
        <select value={grade} onChange={e => setGrade(e.target.value)} className={INPUT}>
          <option value="">Select grade</option>
          {grades.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        <RowLabel>Gym grade</RowLabel>
        <div>
          {!effectiveGym ? (
            <p className="pt-1.5 text-xs text-gray-400">Set the gym above to pick its grading colours.</p>
          ) : gymGradings.length === 0 ? (
            <p className="pt-1.5 text-xs text-gray-400">No grading colours set for {effectiveGym} yet.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              {gymGradings.map(g => {
                const selected = color.toLowerCase() === g.color_name.toLowerCase()
                return (
                  <button
                    key={g.color_name}
                    type="button"
                    onClick={() => setColor(selected ? '' : g.color_name)}
                    title={`${g.color_name} · ${g.points} pts`}
                    aria-label={g.color_name}
                    aria-pressed={selected}
                    className={`grid place-items-center rounded-md p-1 transition ${selected ? 'bg-sage-50 ring-2 ring-sage-600' : 'hover:bg-gray-100'}`}
                  >
                    <TapeGraphic color={g.color_name} size={18} />
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <RowLabel>Hold</RowLabel>
        <div className="flex flex-wrap items-center gap-1">
          {HOLD_COLORS.map(c => {
            const selected = holdColor === c.name
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => setHoldColor(selected ? '' : c.name)}
                title={c.name}
                aria-label={c.name}
                aria-pressed={selected}
                className={`grid place-items-center rounded-md p-1 transition ${selected ? 'bg-sage-50 ring-2 ring-sage-600' : 'hover:bg-gray-100'}`}
              >
                <HoldGraphic color={c.name} size={18} />
              </button>
            )
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={!effectiveGym || busy}
        className="mt-5 w-full rounded-2xl bg-sage-700 py-3 text-sm font-medium text-white transition-opacity disabled:opacity-60"
      >
        {busy ? 'Publishing…' : 'Publish to the gym'}
      </button>
    </BottomSheet>
  )
}
```

Four things in there are deliberate:

- **`effectiveGym`** falls back to the first default gym, so a climber with one gym
  never has to touch the field — but typing a different gym overrides it.
- **Changing the gym clears `color`.** Grading colours are per gym, so a colour
  picked for one gym is meaningless at another.
- **The photo helper line** is the only place in the app that tells you a photo is
  worth 10 points. Since migration 074, publishing without one earns nothing.
- **`busy` covers both the upload and the mutation**, so a double-tap can't publish
  twice while the image is still going up.

- [ ] **Step 2: Verify the build**

Run: `npm run build && npm run lint`

Expected: build clean; lint at the baseline you measured before starting, with no
new problems. The component is unused until Task 4, which `noUnusedLocals` does
not flag for an exported component.

- [ ] **Step 3: Commit**

```bash
git add src/components/AddGymBoulderSheet.tsx
git commit -m "Add a sheet for publishing a gym boulder directly"
```

---

### Task 4: The FAB on the Gym problems page

**Files:**
- Modify: `src/pages/CrewsPage.tsx`

**Interfaces:**
- Consumes: `<AddGymBoulderSheet open onClose />` from Task 3, and the existing
  `FAB` component, whose props are exactly `{ onClick: () => void; label?: string }`.
  `FAB` positions itself `fixed bottom-24 right-4 z-40` — it needs no wrapper and no
  layout changes around it.
- Produces: the feature, reachable.

`src/pages/CrewsPage.tsx` is currently 11 lines: a heading, a subtitle and
`<CrewsSection />`.

- [ ] **Step 1: Add the FAB and the sheet**

Replace the whole of `src/pages/CrewsPage.tsx` with:

```tsx
import { useState } from 'react'
import { CrewsSection } from '../components/CrewsSection'
import { AddGymBoulderSheet } from '../components/AddGymBoulderSheet'
import { FAB } from '../components/FAB'

export function CrewsPage() {
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="p-4 pb-32 space-y-4">
      <h1 className="text-xl font-bold">Gym problems</h1>
      <p className="text-sm text-gray-500">Shared boulders from your gyms — jump on a sendtrain, add beta, compare points.</p>
      <CrewsSection />

      <FAB onClick={() => setAddOpen(true)} label="Add a gym boulder" />
      <AddGymBoulderSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}
```

This mirrors how `SessionDetailPage.tsx:354` and `ChallengesPage.tsx:232` already
pair a `FAB` with a sheet.

- [ ] **Step 2: Verify build, lint and tests**

Run: `npm run build && npm run lint && npx vitest run`

Expected: build clean; lint at the baseline with no new problems; all tests pass.

- [ ] **Step 3: Check it in the browser**

Run `npm run dev` and open `http://localhost:5173/gym-problems`.

Confirm, **before** migration 075 is applied — publishing will fail at this point
and that is the expected result, because the client now sends 8 named arguments to a
7-argument function:

- The FAB appears bottom-right and opens the sheet.
- Your default gyms show as chips with the first one active; the grading-colour row
  populates for a gym that has colours and shows the "No grading colours set for …"
  line for one that doesn't.
- The grade dropdown lists your own scale (Font or V).
- `Publish to the gym` is disabled with no gym set.
- Tapping Publish shows the error toast "Could not publish this boulder" — that is
  the missing migration, not a bug in this task. Note it in your report and move on.

- [ ] **Step 4: Commit**

```bash
git add src/pages/CrewsPage.tsx
git commit -m "Open the add-boulder sheet from a FAB on Gym problems"
```

---

## Final verification

- [ ] `npm run build` — clean
- [ ] `npm run lint` — no new problems versus the baseline measured at the start
- [ ] `npx vitest run` — all tests pass
- [ ] `git log --oneline -4` — four commits, one per task
- [ ] `grep -rn "claim_gym_problem" src/components/AddGymBoulderSheet.tsx` — no
      matches, confirming publishing does not join the boulder

## Release gate

**Apply `supabase/migrations/075_gym_problem_community_grade.sql` in the Supabase
dashboard before deploying this client.** The new client sends `p_community_grade`,
which a 7-argument function rejects — publishing would fail with the error toast
until the migration lands. Applying 075 first is safe for the currently deployed
client, because the new parameter defaults to null and a 7-named-argument call
resolves to the new function.

Manual checks worth running **after** applying 075, since no automated test covers
plpgsql here:

| Action | Expected |
|---|---|
| Publish with a photo and a grade | Boulder appears in Gym problems and in the Latest strip **with the grade as its caption**; `beta_points` gains a `first_logger` 10 |
| Publish without a photo | Boulder appears; **no** `beta_points` row |
| Publish with no grade selected | Boulder appears; `community_grade` is null, caption blank as before |
| Open the new boulder | Sendtrain is empty and you are not on it — publishing does not join |
| Publish the old way, from a session problem | Still works, still stores no grade |
