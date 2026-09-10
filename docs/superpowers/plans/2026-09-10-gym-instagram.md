# Instagram Handle on a Gym — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a gym in the registry an Instagram handle, set by an admin in Gyms admin, and show it as a glyph next to the gym name on the boulder page.

**Architecture:** A nullable `gyms.instagram_handle` column guarded by a check constraint, written only through a new `SECURITY DEFINER` RPC (`gyms` has no UPDATE policy at all — 092 made that choice deliberately). One app-wide cached query maps `label → handle`, and a thin `<GymInstagramLink>` consults it, reusing the `<InstagramLink>` component and the `src/utils/instagram.ts` parser already shipped for the climber-handle feature. **This feature adds no new pure logic and therefore no new tests.**

**Tech Stack:** React 18 + TypeScript, Vite, React Query (array query keys), Supabase (Postgres + RLS + `SECURITY DEFINER` RPCs), Tailwind (`sage`/`khaki`), `lucide-react`, `react-hot-toast`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-10-gym-instagram-design.md`

## Global Constraints

- **Migration release gate.** Migration `094` is applied **by hand in the Supabase dashboard**, never by tooling from this repo, and must be applied before the client that reads the column is deployed. **The gate is soft by design:** the handle is read by its own dedicated query, so before 094 lands that one query fails, the glyph is absent, and nothing else on the boulder page changes. (Contrast 093, where the column rode inside a select whose error is swallowed and every beta author silently became "Someone".)
- **Handle rule** — the check constraint and the client regex in `src/utils/instagram.ts` must stay character-identical: `^[A-Za-z0-9._]{1,30}$`.
- **`gyms` has a SELECT policy and NO insert/update/delete policy at all.** Every write goes through a `SECURITY DEFINER` function guarded by `assert_gym_admin()`. **Do not add an RLS write policy to `gyms`** — the RPC is the mechanism.
- **A plpgsql body is not validated at `CREATE`.** A migration can apply perfectly clean and the function still raise on its first call, so migration 094 ends with a `do` block that calls it and rolls back. Migration 092 sets this precedent.
- **No new pure logic, so no new tests.** `parseInstagramHandle`, `instagramUrl` and `<InstagramLink>` already exist and are tested. `npx vitest run` must show the **same count before and after** this branch. Only pure functions in `src/utils/` are tested here; there is no `@testing-library/react`, so hooks, components and pages are verified by `npm run build` plus a manual pass. **Do not add component or hook tests, and do not add a test framework for them.**
- **`noUnusedLocals` and `noUnusedParameters` are ON** — an unused local is a build-failing error that fails the Vercel deploy.
- **Lint baseline is 16 problems (15 errors, 1 warning)**, measured on branch `feature/gym-instagram` on 2026-09-10. New work adds **zero**. Re-measure with `npm run lint` if the branch has moved.
- **Supabase errors are not `Error` instances** — use `errorMessage(e, fallback)` from `src/utils/errors.ts`, never `e instanceof Error`.
- **`gym_suggestions()` and the `GymOption` type must not be touched.** Widening that function's return type means `DROP FUNCTION` + recreate, and 092 warns explicitly that the deployed client breaks during that window.
- **Copy rule.** Toasts are identical to `/profile`'s: `Instagram saved`, `Instagram removed`, `That doesn't look like an Instagram handle`. The input placeholder is `gym.handle` (deliberately **not** `/profile`'s `your.handle` — an admin editing this field is never editing their own).
- **Scope fence.** The glyph appears **only** next to the gym name on the boulder page. Not in `GymPicker`, `GymBoulderPicker`, `AddGymSheet`, Default Gyms on `/profile`, the session pages, or the home strip. No per-gym page. No climber-facing edit path.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/094_gym_instagram.sql` | **Create.** Column, check constraint, `set_gym_instagram` RPC, grants, and a self-test `do` block. |
| `src/hooks/useGymInstagram.ts` | **Create.** The app-wide cached `label → handle` read. Public (not admin) — its own file because every other gym hook in `useGymAdmin.ts` is an admin write. |
| `src/components/GymInstagramLink.tsx` | **Create.** Given a gym label, render the glyph or nothing. |
| `src/pages/CrewPage.tsx` | **Modify.** One element in the boulder's meta line. |
| `src/hooks/useGymAdmin.ts` | **Modify.** Add `useSetGymInstagram()` beside the other admin write mutations. |
| `src/components/GymsAdmin.tsx` | **Modify.** The handle field in the per-gym sheet; sheet and button relabelled. |

---

### Task 1: The column and its write path

Deliverable: reviewable SQL that adds the column, constrains it, and exposes the only way to write it. Nothing in the client reads it yet.

**Files:**
- Create: `supabase/migrations/094_gym_instagram.sql`

**Interfaces:**
- Consumes: `public.assert_gym_admin()` and `public.fold_gym_text(text)` from migration 092.
- Produces: `gyms.instagram_handle text` (nullable), and the RPC `public.set_gym_instagram(p_id uuid, p_handle text) returns void` — pass `null` or `''` to clear.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/094_gym_instagram.sql`:

```sql
-- A gym's Instagram handle, shown beside the gym name on the boulder page.
-- The one thing on a gym's feed that teaches movement is the new-set video:
-- you are looking at a boulder from one of that gym's sets, and this points at
-- the rest of it. Design:
-- docs/superpowers/specs/2026-09-10-gym-instagram-design.md
--
-- Stored as the bare handle, never a URL — the client builds the href from it
-- (src/utils/instagram.ts), so this column cannot point anywhere but Instagram.
--
-- RELEASE GATE: apply before deploying the client that reads the column. The
-- gate is SOFT by design: the handle is read by its own dedicated query
-- (useGymInstagramHandles), not by the boulder query, so until this lands that
-- one query fails, the glyph is absent, and nothing else on the boulder page
-- changes. Contrast 093, which rode inside a select whose error is swallowed
-- and so silently turned every beta author into "Someone".

alter table gyms add column if not exists instagram_handle text;

-- A charset-and-length guard, character-identical to HANDLE in
-- src/utils/instagram.ts and to the same constraint on profiles (093). Its real
-- job is that a stored value can never hold the characters that would let it
-- escape the https://instagram.com/ prefix the client builds. A well-formed but
-- unissued handle (a lone '.', a trailing dot) still stores, and renders a dead
-- link. Dropped first so this file stays re-runnable after a failed apply.
alter table gyms drop constraint if exists gyms_instagram_handle_format;
alter table gyms add constraint gyms_instagram_handle_format
  check (instagram_handle is null or instagram_handle ~ '^[A-Za-z0-9._]{1,30}$');

-- gyms has a SELECT policy and NO insert/update/delete policy at all (092), so
-- every write goes through a SECURITY DEFINER function. This is
-- set_gym_verified's shape exactly, admin guard included. Kept separate from
-- rename_gym on purpose: a rename rewrites a gym string across twelve columns,
-- while this touches one field on one row, and an admin fixing a handle must
-- not trigger a rename.
--
-- nullif(btrim(...)) means clearing the field stores null rather than '', so the
-- check constraint never sees an empty string.
create or replace function public.set_gym_instagram(p_id uuid, p_handle text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_gym_admin();
  update public.gyms
     set instagram_handle = nullif(btrim(coalesce(p_handle, '')), '')
   where id = p_id;
  if not found then
    raise exception 'No such gym';
  end if;
end;
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC and grants are cumulative, so the
-- grant below narrows nothing by itself — the revoke is what does. Same posture
-- as every function in 092.
revoke execute on function public.set_gym_instagram(uuid, text) from public, anon;
grant  execute on function public.set_gym_instagram(uuid, text) to authenticated;

-- A plpgsql body is not validated at CREATE: this file can apply perfectly
-- clean and set_gym_instagram still raise on its first call. So call it once
-- and roll back. A block with an EXCEPTION clause is a savepoint, so catching
-- the final raise below undoes everything this block did, smoke gym included.
-- 092 sets this precedent.
do $$
declare
  v_gym uuid;
begin
  insert into public.gyms (name, city, label, canonical_key)
  values ('Smoke Test Instagram Wall', null, 'Smoke Test Instagram Wall',
          public.fold_gym_text('Smoke Test Instagram Wall'))
  returning id into v_gym;

  -- The function body, and the admin guard inside it. Which branch runs depends
  -- on whether an admin profile sits behind auth.uid() in this session; either
  -- way the body has now been parsed and executed, which is the point. Both
  -- branches must end in a notice, never a raise: a migration that aborts for
  -- whoever happens to be applying it is broken, not thorough.
  begin
    perform public.set_gym_instagram(v_gym, '  moresends  ');
    assert (select instagram_handle from public.gyms where id = v_gym) = 'moresends',
      'set_gym_instagram did not store the trimmed handle';
    perform public.set_gym_instagram(v_gym, '');
    assert (select instagram_handle from public.gyms where id = v_gym) is null,
      'set_gym_instagram did not clear on empty input';
    raise notice 'set_gym_instagram ran end to end (admin profile in scope): stored, trimmed, and cleared';
  exception when others then
    if sqlerrm not like 'Only admins can manage gyms%' then
      raise;
    end if;
    raise notice 'assert_gym_admin raised as expected (no admin profile in scope): %', sqlerrm;
  end;

  -- The column and its constraint, exercised directly rather than through the
  -- admin-gated function, so this runs regardless of who is applying the file.
  update public.gyms set instagram_handle = 'moresends' where id = v_gym;
  assert (select instagram_handle from public.gyms where id = v_gym) = 'moresends',
    'instagram_handle did not store a valid handle';

  begin
    update public.gyms set instagram_handle = 'not a handle' where id = v_gym;
    raise exception 'gyms_instagram_handle_format accepted a malformed handle';
  exception when check_violation then
    raise notice 'gyms_instagram_handle_format rejected a malformed handle, as expected';
  end;

  raise exception 'smoke complete, rolling back';
exception when others then
  if sqlerrm <> 'smoke complete, rolling back' then
    raise;
  end if;
  raise notice 'set_gym_instagram smoke: function body, admin guard, column and constraint all exercised, all rolled back. READ THE NOTICES ABOVE.';
end $$;
```

Two things to hold onto while writing this. The handle passed to the RPC in the smoke block must be a **valid** one (`moresends`, deliberately padded with spaces so `btrim` is exercised): an invalid one would raise `check_violation`, the handler would not match the admin-guard message, and the whole paste would abort for any admin applying the file. And the malformed-handle case is tested by the **direct** `update` further down instead, which runs whoever applies the file — that is what proves the constraint bites.

- [ ] **Step 2: Check the file against the two functions it depends on**

Both come from migration 092 and must exist with these exact names, or the smoke block fails in a way that reads like a broken file:

Run: `grep -n "function public.assert_gym_admin\|function public.fold_gym_text" supabase/migrations/092_gym_registry.sql`

Expected: one line for each.

- [ ] **Step 3: Confirm the regex matches the client character for character**

Run: `grep -n "A-Za-z0-9._" src/utils/instagram.ts supabase/migrations/093_profile_instagram.sql supabase/migrations/094_gym_instagram.sql`

Expected: `^[A-Za-z0-9._]{1,30}$` in all three, byte-identical.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/094_gym_instagram.sql
git commit -m "Give a gym somewhere to say where its sets get filmed"
```

**OWNER-ONLY, not part of this task:** applying 094 in the Supabase dashboard. Paste the whole file at once and read the notices it raises.

---

### Task 2: The glyph on the boulder page

Deliverable: a gym with a handle shows the glyph beside its name on `/gym-problems/:id`; a gym without one shows nothing.

**Files:**
- Create: `src/hooks/useGymInstagram.ts`
- Create: `src/components/GymInstagramLink.tsx`
- Modify: `src/pages/CrewPage.tsx` (one element in the boulder's meta line)

**Interfaces:**
- Consumes: `gyms.instagram_handle` from Task 1; `<InstagramLink handle={...} size={...} className={...} />` from `src/components/InstagramLink.tsx` (already shipped — it takes a **bare handle**, builds the href itself, and returns `null` when the handle is null).
- Produces:
  - `useGymInstagramHandles(): UseQueryResult<Map<string, string>>` — keyed by `gyms.label`.
  - `<GymInstagramLink gym={label} size={13} className="" />`.

- [ ] **Step 1: Write the read hook**

Create `src/hooks/useGymInstagram.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * `gyms.label` -> Instagram handle, for every gym that has one. Cached app-wide
 * and consulted by <GymInstagramLink>, so the glyph can render next to any gym
 * name without threading a handle through every query that carries a gym string.
 *
 * Keyed by label, not id, because the label is what all twelve gym columns in
 * this app actually store (see migration 092).
 *
 * `merged_into is null` matters: a gym folded into another keeps its row, and
 * without the filter it could supply a handle for a label the app no longer
 * writes anywhere.
 *
 * Deliberately its own query rather than a column on the boulder query. Before
 * migration 094 is applied this one fails, the glyph is simply absent, and
 * nothing else on the boulder page is affected.
 */
export function useGymInstagramHandles() {
  return useQuery({
    queryKey: ['gym_instagram_handles'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gyms')
        .select('label, instagram_handle')
        .not('instagram_handle', 'is', null)
        .is('merged_into', null)
      if (error) throw error
      const byLabel = new Map<string, string>()
      for (const row of data ?? []) {
        byLabel.set(row.label as string, row.instagram_handle as string)
      }
      return byLabel
    },
  })
}
```

- [ ] **Step 2: Write the glyph component**

Create `src/components/GymInstagramLink.tsx`:

```tsx
import { useGymInstagramHandles } from '../hooks/useGymInstagram'
import { InstagramLink } from './InstagramLink'

/**
 * The Instagram glyph shown after a gym's name — its new-set videos live there.
 * Give it the gym label (the string every gym column stores); it consults the
 * app-wide handle map and renders a link, or nothing.
 *
 * Renders inline; safe to drop next to any gym name anywhere.
 */
export function GymInstagramLink({
  gym,
  size = 13,
  className = '',
}: { gym?: string | null; size?: number; className?: string }) {
  const { data: handles } = useGymInstagramHandles()
  if (!gym) return null
  return <InstagramLink handle={handles?.get(gym) ?? null} size={size} className={className} />
}
```

The hook is called before the early return, so the rules of hooks hold.

- [ ] **Step 3: Put it in the boulder's meta line**

In `src/pages/CrewPage.tsx`, add the import beside the other component imports:

```ts
import { GymInstagramLink } from '../components/GymInstagramLink'
```

Then find this line in the caption block (it is the only occurrence):

```tsx
              {boulder.gym && <><span className="text-gray-300">·</span><span>{boulder.gym}</span></>}
```

and replace it with:

```tsx
              {boulder.gym && <><span className="text-gray-300">·</span><span className="inline-flex items-center gap-1">{boulder.gym}<GymInstagramLink gym={boulder.gym} /></span></>}
```

The wrapping `inline-flex … gap-1` matters: that meta line is a `flex flex-wrap … gap-x-2` row, so an unwrapped glyph would become its own flex item sitting 8px from the gym name and equidistant from the next `·` separator — reading as a separate item rather than as part of the gym.

- [ ] **Step 4: Build, lint, and confirm the test count did not move**

Run: `npm run build`

Expected: no TypeScript errors.

Run: `npm run lint 2>&1 | tail -3`

Expected: `✖ 16 problems (15 errors, 1 warning)` — unchanged.

Run: `npx vitest run 2>&1 | grep -E "Test Files|Tests "`

Expected: the same counts as before this branch — this feature adds no pure logic, so nothing should have been added here.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGymInstagram.ts src/components/GymInstagramLink.tsx src/pages/CrewPage.tsx
git commit -m "Point at where a gym films its sets"
```

---

### Task 3: Setting the handle in Gyms admin

Deliverable: an admin opens a gym's sheet, types a handle, and it saves — independently of the rename button.

**Files:**
- Modify: `src/hooks/useGymAdmin.ts` (one exported mutation, beside the existing ones)
- Modify: `src/components/GymsAdmin.tsx` (the per-gym sheet: handle field; component and labels renamed)

**Interfaces:**
- Consumes: `useGymInstagramHandles()` from Task 2 (`Map<label, handle>`); `parseInstagramHandle(input)` from `src/utils/instagram.ts`, which returns `{ status: 'empty' } | { status: 'ok'; handle: string } | { status: 'invalid' }` — `empty` means the field was cleared (save `null`), `invalid` means a typo (toast, change nothing), and a lone `@` is `empty`; `errorMessage(e, fallback)` from `src/utils/errors.ts`.
- Produces: `useSetGymInstagram()` — a mutation over `{ id: string; handle: string | null }`.

- [ ] **Step 1: Add the admin mutation**

In `src/hooks/useGymAdmin.ts`, add this immediately after `useSetGymVerified`. It uses the file's existing private `useGymMutation` helper, whose `onSuccess` calls `queryClient.invalidateQueries()` with no key — which is what refreshes the handle map from Task 2:

```ts
/** Admin-only: set or clear a gym's Instagram handle (via RPC). `null` clears it. */
export function useSetGymInstagram() {
  return useGymMutation(async ({ id, handle }: { id: string; handle: string | null }) => {
    const { error } = await supabase.rpc('set_gym_instagram', { p_id: id, p_handle: handle })
    if (error) throw error
  })
}
```

- [ ] **Step 2: Rename the sheet, since it no longer only renames**

In `src/components/GymsAdmin.tsx`, three renames. The component:

```tsx
function EditGymSheet({ gym, onClose }: { gym: GymOption; onClose: () => void }) {
```

its use site near the foot of the file:

```tsx
      <BottomSheet open={renaming !== null} onClose={() => setRenaming(null)} title="Edit gym">
        {renaming && <EditGymSheet gym={renaming} onClose={() => setRenaming(null)} />}
      </BottomSheet>
```

and the row button that opens it:

```tsx
            <button
              type="button"
              onClick={() => setRenaming(gym)}
              title="Edit"
              aria-label={`Edit ${gym.label}`}
              className="text-gray-400 hover:text-gray-700"
            >
              <Pencil size={16} strokeWidth={1.75} />
            </button>
```

Leave the `renaming` state variable's name alone — it is local, and churning it buys nothing.

- [ ] **Step 3: Add the handle field to the sheet**

In `src/components/GymsAdmin.tsx`, extend the imports:

```ts
import { useState, useEffect } from 'react'
```

```ts
import { useSetGymVerified, useRenameGym, useMergeGyms, useGymMergeImpact, useSetGymInstagram } from '../hooks/useGymAdmin'
import { useGymInstagramHandles } from '../hooks/useGymInstagram'
import { parseInstagramHandle } from '../utils/instagram'
```

Inside `EditGymSheet`, after the existing `rename` line, add:

```tsx
  const { data: handles } = useGymInstagramHandles()
  const savedHandle = handles?.get(gym.label) ?? null
  const [instagram, setInstagram] = useState(savedHandle ?? '')
  const setGymInstagram = useSetGymInstagram()

  // The handle map may still be loading when this sheet mounts, so the field
  // has to pick the value up when it lands.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setInstagram(savedHandle ?? '') }, [savedHandle])

  const saveInstagram = () => {
    const parsed = parseInstagramHandle(instagram)
    if (parsed.status === 'invalid') {
      toast.error("That doesn't look like an Instagram handle")
      return
    }
    const next = parsed.status === 'empty' ? null : parsed.handle
    // Blur fires on every exit from the field; only write when it changed.
    if (next === savedHandle) return
    setGymInstagram.mutate({ id: gym.id, handle: next }, {
      onSuccess: () => toast.success(next ? 'Instagram saved' : 'Instagram removed'),
      onError: (e: unknown) => toast.error(errorMessage(e, 'Could not save that handle')),
    })
  }
```

Then add this block in the JSX directly after the city field's `</div>` and before the `<p>` that previews the label:

```tsx
      <div>
        <label htmlFor="edit-gym-instagram" className="block text-sm font-medium text-gray-700 mb-1">
          Instagram <span className="text-gray-400">(optional)</span>
        </label>
        <div className="flex items-center gap-1.5 w-full rounded-lg border border-gray-200 px-3 py-2.5 focus-within:ring-2 focus-within:ring-sage-500">
          <span className="text-sm text-gray-400">@</span>
          <input
            id="edit-gym-instagram"
            value={instagram}
            onChange={e => setInstagram(e.target.value)}
            onBlur={saveInstagram}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            placeholder="gym.handle"
            maxLength={30}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 min-w-0 text-sm bg-transparent outline-none"
          />
        </div>
        <p className="mt-1 text-xs text-gray-400">
          Shown next to the gym on its boulders. Saves on its own — the button below only renames.
        </p>
      </div>
```

The field deliberately does **not** ride the sheet's Save button: that button calls `rename_gym`, which rewrites the gym string across twelve columns, and an admin fixing a handle must not trigger a rename. Enter blurs the field, and blur is the only save path, so there is exactly one place a write can start.

- [ ] **Step 4: Build, lint, and confirm the test count did not move**

Run: `npm run build`

Expected: no TypeScript errors. If it reports an unused import, you have left one behind — `noUnusedLocals` fails the deploy.

Run: `npm run lint 2>&1 | tail -3`

Expected: `✖ 16 problems (15 errors, 1 warning)` — unchanged. If it grew by one on `react-hooks/set-state-in-effect`, the disable comment above the new effect is missing.

Run: `npx vitest run 2>&1 | grep -E "Test Files|Tests "`

Expected: unchanged counts.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGymAdmin.ts src/components/GymsAdmin.tsx
git commit -m "Let an admin say where a gym films its sets"
```

---

## Release checklist

- [ ] Migration `094_gym_instagram.sql` applied in the Supabase dashboard as **one whole-file paste**, and its notices read. Expect one of `set_gym_instagram ran end to end` / `assert_gym_admin raised as expected`, then the constraint notice, then the rollback notice. Any other outcome — especially an abort — means the file did not do what it claims; do not treat a failed paste as "the guard working".
- [ ] Confirm the column and constraint landed:
  ```sql
  select column_name from information_schema.columns
   where table_name = 'gyms' and column_name = 'instagram_handle';
  select conname from pg_constraint where conname = 'gyms_instagram_handle_format';
  select 1 from pg_proc where proname = 'set_gym_instagram';
  ```
  Expected: one row from each.
- [ ] `npx vitest run` green, at the same count as before the branch.
- [ ] `npm run build` green.
- [ ] `npm run lint` still at 16 problems.
- [ ] **Manual pass at phone width** (needs 094 applied and an admin account): in Gyms admin, open a gym's sheet with the pencil, type a handle, tap outside → **Instagram saved**; reopen the sheet and confirm it persisted; open a boulder at that gym and confirm the glyph sits right after the gym name in the meta line and opens Instagram in a new tab; confirm a boulder at a gym with no handle shows no glyph and no gap; type `not a handle` → **That doesn't look like an Instagram handle**, and the stored value is untouched; clear the field → **Instagram removed**, and the glyph is gone from the boulder.
- [ ] Merged to `main` (pushing `main` auto-deploys via Vercel — a push is a release).
