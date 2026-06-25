# Boulder Picker — Video Support + Richer Tiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let shared boulders carry a beta video, include photo-or-video boulders in the picker mosaic (video shown as a play tile), and overlay grade + gym color on every tile.

**Architecture:** Adds `gym_problems.beta_video_url` and captures it at boulder creation (reproducing migration 046's `create_gym_problem` plus the new column). The video threads through the `GymProblem` type, `useCreateGymProblem`, the matcher's create path, `boulderToPrefill`, and `ProblemForm` prefill, so a boulder stores the video and picking it logs a problem carrying it. `GymBoulderPicker` broadens its criteria to photo-or-video and renders photo / play-tile / overlay.

**Tech Stack:** React 18 + TypeScript, `@tanstack/react-query`, Supabase, Tailwind, `lucide-react`, Vitest (jsdom).

## Global Constraints

- **No new behavior for existing boulders** — `beta_video_url` is captured only at creation, so only boulders created after this ships can be video-bearing.
- **Video thumbnail = a Play-icon tile** (dark `bg-gray-800` + lucide `Play`), not a fetched poster. Beta videos are external links.
- **Picker criteria = `image_url || beta_video_url`** (was photo-only). `useGymBoulders` active/gym/expiry filtering is unchanged.
- **Every tile overlays** the grade (`community_grade`, if set) and the gym color as a text chip (`color`, if set); a photo that also has a video gets a small ▶ corner badge.
- **`create_gym_problem` must faithfully reproduce its migration-046 body** (auth/gym checks, boulder insert, `first_logger` `beta_points` insert) and only add the video column; drop the old 5-arg signature to avoid overload ambiguity. `SECURITY DEFINER` preserved.
- **Migrations are numbered SQL applied manually** (no CLI/local DB, no SQL test harness); re-runnable; verify by reading + a query.
- **Tests exist only for pure utilities.** Hooks/components verified via `npx tsc -b` + `npm run lint` (baseline 17, 0 new) + `npm run build`. TDD only for the helper in Task 2.
- **Naming/style:** React Query array keys, `useX` hooks, `sage-700` accent, `lucide-react` icons.

---

### Task 1: Migration 051 — `gym_problems.beta_video_url` + extend `create_gym_problem`

**Files:**
- Create: `supabase/migrations/051_boulder_video.sql`

**Interfaces:**
- Consumes: `gym_problems`, the migration-046 `create_gym_problem`, `beta_points`.
- Produces (relied on by Tasks 2–3): `gym_problems.beta_video_url text`; `create_gym_problem(p_gym, p_color, p_wall_angle, p_name, p_image_url, p_beta_video_url text default null)`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/051_boulder_video.sql`:

```sql
-- Boulder picker: shared boulders can carry a beta video. Adds the column and
-- captures it at creation. Reproduces migration 046's create_gym_problem body
-- (first_logger points) and only adds beta_video_url. The old 5-arg signature
-- is dropped so the 6-arg version isn't an ambiguous overload.

alter table gym_problems add column if not exists beta_video_url text;

drop function if exists public.create_gym_problem(text, text, text, text, text);

create or replace function public.create_gym_problem(
  p_gym            text,
  p_color          text,
  p_wall_angle     text,
  p_name           text,
  p_image_url      text,
  p_beta_video_url text default null
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

  insert into public.gym_problems (gym, color, wall_angle, name, image_url, beta_video_url, created_by)
  values (trim(p_gym), p_color, p_wall_angle, p_name, p_image_url, p_beta_video_url, v_user_id)
  returning * into v_row;

  -- first_logger points to the creator (preserved from migration 046).
  insert into public.beta_points (user_id, gym, gym_problem_id, points, reason, cycle_month)
  values (v_user_id, v_row.gym, v_row.id, 10, 'first_logger',
          to_char((now() at time zone 'utc'), 'YYYY-MM'));

  return v_row;
end;
$$ language plpgsql security definer;
```

- [ ] **Step 2: Self-review the SQL**

Confirm: `beta_video_url` added with `if not exists`; the old 5-arg `create_gym_problem` dropped before the 6-arg create; the new body is byte-for-byte migration 046 (auth check, gym check, boulder insert, first_logger `beta_points` insert, `return v_row`) plus `beta_video_url` in the insert column+value lists and the new defaulted param; `security definer` preserved.

- [ ] **Step 3: Apply via the Supabase SQL editor and verify**

Apply `051_boulder_video.sql`, then:

```sql
select column_name from information_schema.columns
 where table_name = 'gym_problems' and column_name = 'beta_video_url';
select pronargs from pg_proc where proname = 'create_gym_problem';
```
Expected: one `beta_video_url` row; `create_gym_problem` exists with `pronargs = 6` (and only one such function).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/051_boulder_video.sql
git commit -m "feat: gym_problems.beta_video_url + capture it in create_gym_problem (migration 051)"
```

---

### Task 2: Types + `boulderToPrefill` video mapping (TDD)

**Files:**
- Modify: `src/types/index.ts` (`GymProblem`, `ProblemPrefill`)
- Modify: `src/utils/boulderPrefill.ts`
- Test: `src/utils/__tests__/boulderPrefill.test.ts`

**Interfaces:**
- Produces (relied on by Tasks 3–4):
  - `GymProblem` gains `beta_video_url: string | null`.
  - `ProblemPrefill` gains `beta_video_url: string | null`.
  - `boulderToPrefill(gp)` additionally maps `beta_video_url ← gp.beta_video_url`.

- [ ] **Step 1: Update the test (RED)**

In `src/utils/__tests__/boulderPrefill.test.ts`, add `beta_video_url` to the fixture and both expected objects:

```ts
const boulder: GymProblem = {
  id: 'gp1', gym: 'Boulders Oslo', wall_angle: 'overhang', color: 'Blue',
  community_grade: '6B', name: 'The Prow', image_url: 'https://x/p.jpg',
  beta_video_url: 'https://insta/v', created_by: 'u1', set_at: '2026-06-01',
  expires_at: '2026-07-01', status: 'active', created_at: '2026-06-01T00:00:00Z',
}

describe('boulderToPrefill', () => {
  it('maps boulder fields to new-problem defaults', () => {
    expect(boulderToPrefill(boulder)).toEqual({
      name: 'The Prow', color: 'Blue', grade_value: '6B',
      image_url: 'https://x/p.jpg', beta_video_url: 'https://insta/v', gym: 'Boulders Oslo',
    })
  })
  it('preserves nulls (no name/color/grade/photo/video)', () => {
    expect(boulderToPrefill({ ...boulder, name: null, color: null, community_grade: null, image_url: null, beta_video_url: null }))
      .toEqual({ name: null, color: null, grade_value: null, image_url: null, beta_video_url: null, gym: 'Boulders Oslo' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/utils/__tests__/boulderPrefill.test.ts`
Expected: FAIL — `boulderToPrefill` result is missing `beta_video_url` (and tsc would flag the fixture's unknown `beta_video_url` until the type is updated).

- [ ] **Step 3: Update the types**

In `src/types/index.ts`, add to `GymProblem` (after `image_url`):

```ts
  beta_video_url: string | null
```

and to `ProblemPrefill` (after `image_url`):

```ts
  beta_video_url: string | null
```

- [ ] **Step 4: Update the helper**

In `src/utils/boulderPrefill.ts`, add the mapping to the returned object:

```ts
    image_url: gp.image_url,
    beta_video_url: gp.beta_video_url,
    gym: gp.gym,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/boulderPrefill.test.ts` then `npx tsc -b`
Expected: tests PASS; tsc reports errors at any `GymProblem` literal now missing `beta_video_url` (fix those in Step 6).

- [ ] **Step 6: Fix any other `GymProblem` literals tsc flags**

Run `npx tsc -b` and add `beta_video_url: null` (or a value) to any object literal typed as `GymProblem` that it flags (e.g. other test fixtures). Then `npx tsc -b` clean.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/utils/boulderPrefill.ts src/utils/__tests__/boulderPrefill.test.ts
git commit -m "feat: carry beta_video_url through GymProblem/ProblemPrefill + boulderToPrefill"
```

---

### Task 3: Capture video on create + carry into the prefilled form

**Files:**
- Modify: `src/hooks/useGymProblems.ts` (`useCreateGymProblem`)
- Modify: `src/components/GymProblemMatcher.tsx` (`createNew`)
- Modify: `src/components/ProblemForm.tsx` (prefill default)

**Interfaces:**
- Consumes: `GymProblem.beta_video_url` / `ProblemPrefill.beta_video_url` (Task 2), `create_gym_problem`'s new param (Task 1).
- Produces: boulders created via the matcher store the video; the prefilled `ProblemForm` seeds it.

- [ ] **Step 1: `useCreateGymProblem` accepts + sends the video**

In `src/hooks/useGymProblems.ts`, extend the mutation input type and the `.rpc` call:

```ts
    mutationFn: async (values: {
      gym: string
      color: string | null
      wall_angle: string | null
      name: string | null
      image_url: string | null
      beta_video_url: string | null
    }) => {
      const { data, error } = await supabase.rpc('create_gym_problem', {
        p_gym: values.gym,
        p_color: values.color,
        p_wall_angle: values.wall_angle,
        p_name: values.name,
        p_image_url: values.image_url,
        p_beta_video_url: values.beta_video_url,
      })
      if (error) throw error
      return data as GymProblem
    },
```

- [ ] **Step 2: The matcher passes the problem's video**

In `src/components/GymProblemMatcher.tsx`, in `createNew`'s `create.mutate({...})` first arg, add the video alongside `image_url`:

```tsx
        name: problem.name,
        image_url: problem.image_url,
        beta_video_url: problem.beta_video_url,
```

- [ ] **Step 3: `ProblemForm` prefill seeds the video**

In `src/components/ProblemForm.tsx`, change the `beta_video_url` default value:

```ts
      beta_video_url: existing?.beta_video_url ?? prefill?.beta_video_url ?? '',
```

(All other prefill chains already include `prefill`; `existing` still wins.)

- [ ] **Step 4: Typecheck, lint, build**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: no type errors, no new lint errors (baseline 17), build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGymProblems.ts src/components/GymProblemMatcher.tsx src/components/ProblemForm.tsx
git commit -m "feat: capture beta video on boulder creation and in the prefilled problem form"
```

---

### Task 4: `GymBoulderPicker` — photo-or-video criteria, play tiles, grade/color overlay

**Files:**
- Modify: `src/components/GymBoulderPicker.tsx`

**Interfaces:**
- Consumes: `useGymBoulders`, `GymProblem` (with `beta_video_url`), `lucide-react` `Play`.
- Produces: nothing.

- [ ] **Step 1: Rewrite the component**

Replace `src/components/GymBoulderPicker.tsx` with:

```tsx
import { Play } from 'lucide-react'
import { useGymBoulders } from '../hooks/useGymProblems'
import type { GymProblem } from '../types'

export function GymBoulderPicker({
  gym, onPick,
}: { gym: string; onPick: (gp: GymProblem) => void }) {
  const trimmed = gym.trim()
  const { data: boulders = [], isLoading } = useGymBoulders(trimmed)
  const media = boulders.filter(b => b.image_url || b.beta_video_url)

  if (!trimmed) {
    return <p className="text-sm text-gray-400 text-center py-8">Set a gym on this session (Location) to browse its boulders.</p>
  }
  if (isLoading) {
    return <p className="text-sm text-gray-400 text-center py-8">Loading boulders…</p>
  }
  if (media.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">No shared boulders with photos or videos at {trimmed} yet — log a new one.</p>
  }

  return (
    <div className="grid grid-cols-3 gap-0.5">
      {media.map(b => (
        <button
          key={b.id}
          type="button"
          onClick={() => onPick(b)}
          className="relative aspect-square overflow-hidden bg-gray-800"
          title={b.name ?? b.color ?? 'boulder'}
        >
          {b.image_url ? (
            <img src={b.image_url} alt={b.name ?? b.color ?? 'boulder'} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Play className="w-7 h-7 text-white fill-white" />
            </div>
          )}

          {b.image_url && b.beta_video_url && (
            <span className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5">
              <Play className="w-3 h-3 text-white fill-white" strokeWidth={0} />
            </span>
          )}

          {(b.community_grade || b.color) && (
            <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1.5 px-1.5 py-1 bg-gradient-to-t from-black/70 to-transparent">
              {b.community_grade && <span className="text-[11px] font-semibold text-white leading-none">{b.community_grade}</span>}
              {b.color && <span className="text-[10px] text-white/80 leading-none truncate">{b.color}</span>}
            </div>
          )}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck, lint, build**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: no type errors, no new lint errors (baseline 17), build succeeds.

- [ ] **Step 3: Manual verification**

With migration 051 applied: create a boulder from a problem that has a beta video (no photo) → it appears in the picker as a dark ▶ play tile with the grade/color overlay; a photo boulder shows its photo with the overlay (and a small ▶ badge if it also has a video); tapping either opens the prefilled form carrying the boulder's photo/video.

- [ ] **Step 4: Commit**

```bash
git add src/components/GymBoulderPicker.tsx
git commit -m "feat: boulder picker shows photo-or-video tiles with grade + color overlay"
```

---

## Self-Review

**Spec coverage:**
- `gym_problems.beta_video_url` + captured at creation → Task 1 (column + RPC) + Task 3 (hook + matcher) ✓
- Picker criteria photo-OR-video → Task 4 (`image_url || beta_video_url`) ✓
- Video thumbnail = play tile → Task 4 ✓
- Grade + color overlay on every tile → Task 4 ✓
- Photo+video → small ▶ badge → Task 4 ✓
- Video carried into prefilled problem → Task 2 (`boulderToPrefill`) + Task 3 (`ProblemForm` prefill default) ✓
- `create_gym_problem` faithfully reproduces 046 + drops old overload → Task 1 ✓
- Neither photo nor video → excluded → Task 4 (filter) ✓
- `boulderToPrefill` video mapping unit-tested → Task 2 ✓

**Placeholder scan:** No TBD/TODO; every code step is complete.

**Type consistency:** `GymProblem.beta_video_url` / `ProblemPrefill.beta_video_url` (Task 2) consumed by Tasks 3–4 and `boulderToPrefill`. `useCreateGymProblem` input `beta_video_url` (Task 3) matches the matcher's `create.mutate` arg (Task 3) and the RPC param `p_beta_video_url` (Task 1). `ProblemForm` prefill chain matches the existing `existing?.X ?? prefill?.X ?? …` pattern. Picker reads `b.beta_video_url`/`b.image_url`/`b.community_grade`/`b.color` — all on `GymProblem`. ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-25-boulder-picker-video.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
