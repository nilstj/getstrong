# Caution Beta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a climber post a "watch out" on a shared boulder — naming the move that hurts people and what to do instead — as a kind of beta rather than a hazard flag.

**Architecture:** Two columns (`kind`, `risk_move`) on the existing `boulder_beta` table, so a caution inherits that table's RLS, its cascade with the boulder, and the `beta_posted` anti-farm guard. Posting pays the normal 5 points; confirming with "me too" pays nobody, because that count drives the ⚠️ badge. Setters at the boulder's gym get notified. Adds the app's first two beta-deletion paths: author retraction (plain delete under existing RLS) and admin removal (a raising RPC).

**Tech Stack:** React 19 + TypeScript, Vite, React Query (array query keys), Supabase (Postgres + RLS + `security definer` RPCs), Tailwind (`sage`/`khaki` palettes), `lucide-react`, `react-hot-toast`, Vitest.

**Spec:** [docs/superpowers/specs/2026-08-25-caution-beta-design.md](../specs/2026-08-25-caution-beta-design.md)

## Global Constraints

- **Build:** `npm run build` = `tsc -b && vite build`. `noUnusedLocals` and `noUnusedParameters` are ON — an unused local or import is a **build-failing error**, which fails the Vercel deploy.
- **Lint:** `npm run lint` has a baseline of pre-existing problems. New work must add **zero**. **Measure the baseline yourself before the first edit** (`npm run lint 2>&1 | grep ✖`) — it drifts, so a number quoted here is not evidence. It was 16 problems (15 errors, 1 warning) on a clean tree on 2026-08-25.
- **Tests:** Vitest, and **only pure functions in `src/utils/`** are tested. There is no `@testing-library/react` — hooks, components and pages are verified by `npm run build` plus the manual pass in Task 9. Do not add component tests.
- **Migrations are applied BY HAND in the Supabase dashboard, never by tooling from this repo.** Write the file; do not attempt to run it. Task 1 is a release gate: it must be applied before Tasks 4–8 can be manually verified, and before the client is deployed.
- **Migration 090 depends on migration 074** (it reproduces 074's `mark_beta_worked`, and 074 introduced the `beta_posted`/`engagement` reasons). Confirm 074 is applied before applying 090.
- **Vocabulary:** the internal name is `caution`; **user-facing copy always says "Watch out"**, never "hazard", "danger" or "injury". A caution is *beta*, not a comment or a flag. Never write copy that describes a body part, an injury or its severity.
- **Points must never be mintable by a client.** `beta_points` has no insert policy; every award stays inside a `security definer` function.
- Patterns: React Query array query keys; hooks named `useX`; `sage`/`khaki` Tailwind; `lucide-react` icons; `react-hot-toast` for feedback.

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/090_caution_beta.sql` | **Create.** Columns, constraints, index, `mark_beta_worked` guard, setter fan-out trigger, `admin_delete_beta`, smoke block. |
| `src/utils/riskMoves.ts` | **Create.** The move vocabulary + `riskMoveLabel`. Pure, tested. |
| `src/utils/riskMoves.test.ts` | **Create.** Tests for the above. |
| `src/types/index.ts` | **Modify.** `BetaKind` type, `kind`/`risk_move` on `BoulderBeta`, `'boulder_caution'` on `NotificationType`. |
| `src/utils/betaSort.ts` | **Modify.** Pin cautions above tips. |
| `src/utils/betaSort.test.ts` | **Modify.** Factory gains the new fields; two new cases. |
| `src/hooks/useBoulderBeta.ts` | **Modify.** Select and carry the new columns; use `betaSort`; insert a caution; two delete mutations. |
| `src/pages/CrewPage.tsx` | **Modify.** Composer toggle + move chips; `⚠️ Watch out ×N` badge; wire deletes. |
| `src/components/BetaThreadCard.tsx` | **Modify.** Amber caution treatment, move chip, "me too" label, delete affordance. |
| `src/components/AppBar.tsx` | **Modify.** Render and route the `boulder_caution` notification. |

**Two corrections to the spec, already accounted for above.** The spec named `src/utils/betaSort.ts` and `src/components/BetaCard.tsx`. Both are **dead code** — nothing imports either. The live sort is an inline comparator inside `useBoulderBetaThread`, and the live card is `BetaThreadCard.tsx`. Task 3 therefore wires the hook to `betaSort` (which was written for exactly this list) instead of extending a util nobody calls, and Tasks 5–6 target `BetaThreadCard.tsx`. `BetaCard.tsx` is left alone — see the note after Task 9.

---

### Task 1: Migration 090

**Files:**
- Create: `supabase/migrations/090_caution_beta.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `boulder_beta.kind text` (`'beta'|'caution'`), `boulder_beta.risk_move text`, `public.admin_delete_beta(p_beta_id uuid) returns void`, notification type string `'boulder_caution'` with `data` keys `risk_move` and `gym`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/090_caution_beta.sql`:

```sql
-- Caution beta: a "watch out" on a shared boulder is a KIND OF BETA, not a
-- hazard flag. The climber names the move that hurts people and says what to do
-- instead, which is movement knowledge; "careful on this one" is not.
--
-- It lives on boulder_beta rather than in a table of its own so it inherits
-- that table's own-writes RLS, its `on delete cascade` to gym_problems (a
-- caution dies when the boulder is stripped or expires, so there is no stale
-- warning to retire), and the beta_posted guard that stops points being farmed.
--
-- The move is the subject, never the injury: no body part, no severity, no
-- diagnosis, and nothing about a third party. Corroboration count carries the
-- weight a severity scale would, and asks nobody for their medical history.

-- ── 1. columns ───────────────────────────────────────────────────────────────
alter table boulder_beta
  add column if not exists kind text not null default 'beta',
  add column if not exists risk_move text;

alter table boulder_beta drop constraint if exists boulder_beta_kind_check;
alter table boulder_beta add constraint boulder_beta_kind_check
  check (kind in ('beta', 'caution'));

-- A caution needs a move AND words about it; a plain beta carries no move.
-- Existing rows take kind='beta' with risk_move null, so this validates against
-- live data with no backfill.
alter table boulder_beta drop constraint if exists boulder_beta_caution_shape;
alter table boulder_beta add constraint boulder_beta_caution_shape check (
  (kind = 'beta' and risk_move is null)
  or (kind = 'caution'
      and risk_move is not null and btrim(risk_move) <> ''
      and body is not null and btrim(body) <> '')
);

-- Mirrors gym_problem_help_open_idx (057): the badge counts cautions per boulder.
create index if not exists boulder_beta_caution_idx
  on boulder_beta (gym_problem_id) where kind = 'caution';

-- ── 2. "me too" is free ──────────────────────────────────────────────────────
-- Reproduces 074 §4c's mark_beta_worked and adds ONE guard: a caution pays
-- nobody for being confirmed. Paying would put a price on the count that drives
-- the ⚠️ badge, which is the one number here that must not be worth farming.
-- Posting is unaffected — award_beta_posted (074 §4a) is untouched, so a caution
-- pays the normal 5 when it's the author's first beta on that boulder.
create or replace function public.mark_beta_worked(p_beta_id uuid)
returns void as $$
declare
  v_user_id uuid := auth.uid();
  v_author  uuid;
  v_gpid    uuid;
  v_gym     text;
  v_kind    text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select b.user_id, b.gym_problem_id, b.kind into v_author, v_gpid, v_kind
    from public.boulder_beta b where b.id = p_beta_id;
  if v_author is null then
    raise exception 'beta not found';
  end if;

  insert into public.boulder_beta_worked (beta_id, user_id)
  values (p_beta_id, v_user_id)
  on conflict (beta_id, user_id) do nothing;

  -- The mark is recorded; the awards below are not paid on a caution.
  if v_kind = 'caution' then
    return;
  end if;

  if v_author <> v_user_id then
    select gym into v_gym from public.gym_problems where id = v_gpid;

    -- Author: 5 points, once ever per beta (preserved from 053).
    update public.boulder_beta set awarded = true
      where id = p_beta_id and awarded = false;
    if found and v_gym is not null then
      insert into public.beta_points (user_id, gym, gym_problem_id, beta_id, points, reason, cycle_month)
      values (v_author, v_gym, v_gpid, p_beta_id, 5, 'helpful',
              to_char((now() at time zone 'utc'), 'YYYY-MM'));
    end if;

    -- Marker: 1 engagement point, once per (user, beta).
    if v_gym is not null and not exists (
      select 1 from public.beta_points
       where user_id = v_user_id and beta_id = p_beta_id and reason = 'engagement'
    ) then
      insert into public.beta_points (user_id, gym, gym_problem_id, beta_id, points, reason, cycle_month)
      values (v_user_id, v_gym, v_gpid, p_beta_id, 1, 'engagement',
              to_char((now() at time zone 'utc'), 'YYYY-MM'))
      on conflict do nothing;
    end if;
  end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- ── 3. tell the gym's setters ────────────────────────────────────────────────
-- gym_problems.setter is a community-editable TEXT NAME (056), not a user
-- reference, so there is no single setter to notify. Target instead every
-- setter-role profile whose default_gyms holds this boulder's gym.
create or replace function public.notify_setters_of_caution()
returns trigger as $$
declare
  v_gym    text;
  v_setter uuid;
begin
  if new.kind <> 'caution' then
    return new;
  end if;

  select gym into v_gym from public.gym_problems where id = new.gym_problem_id;
  if v_gym is null then
    return new;
  end if;

  -- Gym strings are compared case-insensitively everywhere else in this schema.
  for v_setter in
    select p.id from public.profiles p
     where p.is_setter = true
       and exists (
         select 1 from unnest(p.default_gyms) g where lower(g) = lower(v_gym)
       )
  loop
    -- create_notification (037) no-ops when recipient = actor, so a setter
    -- flagging their own boulder doesn't ping themselves.
    perform public.create_notification(
      v_setter, new.user_id, 'boulder_caution', new.gym_problem_id,
      jsonb_build_object('risk_move', new.risk_move, 'gym', v_gym)
    );
  end loop;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists on_boulder_caution_notify on boulder_beta;
create trigger on_boulder_caution_notify
  after insert on boulder_beta
  for each row execute procedure public.notify_setters_of_caution();

-- ── 4. removal ───────────────────────────────────────────────────────────────
-- An RPC rather than an admin RLS DELETE policy, deliberately: a client delete
-- that no policy permits removes zero rows and returns NO error, so the admin
-- would see a success toast and watch the beta stay on screen. This raises.
--
-- Scope is any beta, not only cautions — an abusive tip needs removing just as
-- much. The author's own retraction needs nothing here: "users manage own
-- boulder_beta" (052) is `for all`, so RLS has always permitted it.
create or replace function public.admin_delete_beta(p_beta_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (
    select 1 from profiles where id = auth.uid() and is_admin = true
  ) then
    raise exception 'Only admins can remove beta';
  end if;
  -- boulder_beta_worked (053), boulder_beta_comments and boulder_beta_reactions
  -- (058) all cascade on beta_id, and comment reactions cascade through the
  -- comment. beta_points.beta_id is `on delete set null` (074 §2), so points
  -- already earned stay — and the beta_posted guard keys on
  -- (user_id, gym_problem_id), which survives, so removal can't re-earn the 5.
  delete from boulder_beta where id = p_beta_id;
end;
$$;

revoke all on function public.admin_delete_beta(uuid) from public, anon;
grant execute on function public.admin_delete_beta(uuid) to authenticated;

-- ── 5. smoke test ────────────────────────────────────────────────────────────
-- A plpgsql body is NOT validated at create time: this can all apply perfectly
-- clean and still raise on the first real call. Exercise it here.
do $$
declare
  v_uid uuid;
  v_gp  uuid;
begin
  select id into v_uid from auth.users limit 1;
  select id into v_gp  from gym_problems limit 1;
  if v_uid is null or v_gp is null then
    raise notice '090 smoke test skipped: no users or boulders to test with';
    return;
  end if;

  begin
    insert into boulder_beta (gym_problem_id, user_id, body, kind, risk_move)
    values (v_gp, v_uid, 'smoke test', 'caution', 'heel_hook');
    -- This BEGIN block is an implicit savepoint, so raising here undoes the
    -- insert AND every notification the trigger just wrote. No residue.
    raise exception 'rollback smoke test';
  exception when others then
    if sqlerrm <> 'rollback smoke test' then raise; end if;
  end;

  begin
    insert into boulder_beta (gym_problem_id, user_id, body, kind)
    values (v_gp, v_uid, 'caution with no move', 'caution');
    raise exception 'boulder_beta_caution_shape did not fire';
  exception
    when check_violation then null;
    when others then
      if sqlerrm = 'boulder_beta_caution_shape did not fire' then raise; end if;
  end;

  raise notice '090 ok: caution insert, setter fan-out and shape constraint all behaved';
end $$;
```

- [ ] **Step 2: Verify the file is syntactically plausible and DO NOT apply it**

Run: `grep -c "create or replace function" supabase/migrations/090_caution_beta.sql`
Expected: `3`

Do **not** run this SQL. Migrations are applied by hand in the Supabase dashboard by the owner. Flag in your report that 090 is pending and that **074 must be applied first**.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/090_caution_beta.sql
git commit -m "Add migration 090: caution beta columns, free me-too, admin delete"
```

---

### Task 2: The move vocabulary

**Files:**
- Create: `src/utils/riskMoves.ts`
- Create: `src/utils/riskMoves.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `RISK_MOVES: readonly { id: string; label: string }[]` and `riskMoveLabel(id: string | null): string`. Task 4 renders the chips from `RISK_MOVES` and stores `id`; Tasks 5 and 8 render a stored value through `riskMoveLabel`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/riskMoves.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { RISK_MOVES, riskMoveLabel } from './riskMoves'

describe('RISK_MOVES', () => {
  it('has stable snake_case ids', () => {
    for (const m of RISK_MOVES) expect(m.id).toMatch(/^[a-z][a-z_]*$/)
  })

  it('has no duplicate ids', () => {
    const ids = RISK_MOVES.map(m => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('riskMoveLabel', () => {
  it('renders a known id', () => {
    expect(riskMoveLabel('heel_hook')).toBe('Heel-hook / drop-knee')
  })

  it('falls back to the raw stored value when the id is unknown', () => {
    // A vocabulary entry can be renamed or dropped; a row written before that
    // must still render something rather than an empty chip.
    expect(riskMoveLabel('some_retired_move')).toBe('some_retired_move')
  })

  it('renders nothing for a missing value', () => {
    expect(riskMoveLabel(null)).toBe('')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/utils/riskMoves.test.ts`
Expected: FAIL — `Failed to resolve import "./riskMoves"`

- [ ] **Step 3: Write the implementation**

Create `src/utils/riskMoves.ts`:

```ts
/**
 * The moves a caution can be about. Deliberately about MOVEMENT, never about
 * injuries: no body parts, no severity, no diagnosis. That keeps a caution a
 * piece of beta rather than a health record, and keeps the app clear of
 * special-category personal data entirely.
 *
 * Unlike HOLD_COLORS, which stores its display name, a caution stores the `id`
 * and renders the label through riskMoveLabel. These labels are phrases likely
 * to be reworded, and rewording one must not fork the stored data.
 */
export const RISK_MOVES = [
  { id: 'heel_hook', label: 'Heel-hook / drop-knee' },
  { id: 'big_span', label: 'Big span or gaston' },
  { id: 'crimp', label: 'Crimp or pocket' },
  { id: 'slap', label: 'Slap or dyno' },
  { id: 'top_out', label: 'Top-out' },
  { id: 'swing', label: 'The swing' },
  { id: 'landing', label: 'The landing' },
] as const

/** The label for a stored value, falling back to the value itself. */
export function riskMoveLabel(id: string | null): string {
  if (!id) return ''
  return RISK_MOVES.find(m => m.id === id)?.label ?? id
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/riskMoves.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/utils/riskMoves.ts src/utils/riskMoves.test.ts
git commit -m "Add the caution move vocabulary"
```

---

### Task 3: Types, sort order, and wiring the sort that was never wired

**Files:**
- Modify: `src/types/index.ts` (`BoulderBeta` at ~356, `NotificationType` at ~170)
- Modify: `src/utils/betaSort.ts`
- Modify: `src/utils/betaSort.test.ts`
- Modify: `src/hooks/useBoulderBeta.ts` (`BetaThread` at ~18, the select at ~72, the row type at ~80, the mapping at ~140, the sort at ~165)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export type BetaKind = 'beta' | 'caution'` in `src/types/index.ts`; `kind: BetaKind` and `risk_move: string | null` on both `BoulderBeta` and the `BetaThread` interface in `src/hooks/useBoulderBeta.ts`. Tasks 4–8 read `thread.kind` and `thread.risk_move`.

**Why this task touches the hook:** `betaSort` has tests and zero callers — the boulder page's real sort is a duplicate comparator inlined in `useBoulderBetaThread`. Extending only the util would pin nothing on screen. Wiring the hook to the util is what makes the caution rule take effect *and* what gives it test coverage, given components can't be tested here.

- [ ] **Step 1: Add the types**

In `src/types/index.ts`, add the kind type immediately above `export interface BoulderBeta {`:

```ts
/** A beta is either a tip ('beta') or a "watch out" about a move ('caution'). */
export type BetaKind = 'beta' | 'caution'
```

Then add two fields to `BoulderBeta`, after `body_type`:

```ts
  kind: BetaKind
  risk_move: string | null
```

And add `'boulder_caution'` to the `NotificationType` union, after `'variation_cleared'`:

```ts
  | 'boulder_caution'
```

- [ ] **Step 2: Update the test factory and write the failing tests**

In `src/utils/betaSort.test.ts`, replace the import and factory:

```ts
import { describe, it, expect } from 'vitest'
import { betaSort } from './betaSort'
import type { BoulderBeta, BetaKind } from '../types'

const beta = (id: string, worked_count: number, created_at: string, kind: BetaKind = 'beta'): BoulderBeta =>
  ({ id, gym_problem_id: 'g', user_id: 'u', body: 'x', video_url: null, section: null, body_type: null,
     kind, risk_move: kind === 'caution' ? 'heel_hook' : null,
     created_at, worked_count, worked_by_me: false })
```

Then append two cases inside the existing `describe('betaSort', …)` block:

```ts
  it('pins a caution above a tip however well the tip worked', () => {
    const list = [beta('tip', 9, '2026-01-09'), beta('caution', 0, '2026-01-01', 'caution')]
    expect([...list].sort(betaSort).map(b => b.id)).toEqual(['caution', 'tip'])
  })

  it('ranks cautions among themselves by how many climbers confirmed them', () => {
    const list = [beta('one', 1, '2026-01-02', 'caution'), beta('four', 4, '2026-01-01', 'caution')]
    expect([...list].sort(betaSort).map(b => b.id)).toEqual(['four', 'one'])
  })
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/utils/betaSort.test.ts`
Expected: FAIL — `pins a caution above a tip` gets `['tip','caution']`. (The two pre-existing cases still pass.)

- [ ] **Step 4: Implement the sort**

Replace the whole body of `src/utils/betaSort.ts`:

```ts
import type { BoulderBeta } from '../types'

/**
 * Rank beta for the boulder page: cautions first — what hurts people outranks
 * what sends fastest — then, within each group, most "worked for me" and most
 * recent. A caution's worked_count is its "me too" count, so the same tie-break
 * ranks corroboration.
 */
export function betaSort(a: BoulderBeta, b: BoulderBeta): number {
  const aCaution = a.kind === 'caution'
  const bCaution = b.kind === 'caution'
  if (aCaution !== bCaution) return aCaution ? -1 : 1
  if (b.worked_count !== a.worked_count) return b.worked_count - a.worked_count
  return b.created_at.localeCompare(a.created_at)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/utils/betaSort.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 6: Carry the columns through the hook**

In `src/hooks/useBoulderBeta.ts`, make four edits.

Add to the `BetaThread` interface, after `body_type`:

```ts
  kind: BetaKind
  risk_move: string | null
```

Extend the import on line 3 to bring in the two new types:

```ts
import type { BetaSection, BetaBodyType, BetaKind } from '../types'
```

and add the util import below it:

```ts
import { betaSort } from '../utils/betaSort'
```

Widen the select and its row type (the `select` string and the `as` cast must stay in step — extra columns in one and not the other is how this silently returns `undefined`):

```ts
        supabase
          .from('boulder_beta')
          .select('id, gym_problem_id, user_id, body, video_url, section, body_type, kind, risk_move, created_at')
          .eq('gym_problem_id', gymProblemId),
```

```ts
      const betas = (betasRes.data ?? []) as {
        id: string; gym_problem_id: string; user_id: string; body: string | null
        video_url: string | null; section: BetaSection | null; body_type: BetaBodyType | null
        kind: BetaKind; risk_move: string | null; created_at: string
      }[]
```

Carry them into the mapped thread, after `body_type: b.body_type,`:

```ts
        kind: b.kind,
        risk_move: b.risk_move,
```

- [ ] **Step 7: Replace the duplicated comparator with the util**

Replace these two lines:

```ts
      // Top beta first: most "worked for me", then most recent.
      threads.sort((a, b) => b.worked_count - a.worked_count || (a.created_at < b.created_at ? 1 : -1))
```

with:

```ts
      // Cautions first, then most "worked for me", then most recent — see
      // betaSort, which was written for this list. The comparator that used to
      // be inlined here was a duplicate of it and outranked nothing.
      threads.sort(betaSort)
```

- [ ] **Step 8: Verify the build and the full suite**

Run: `npm run build`
Expected: `✓ built` with no TypeScript errors. A `Property 'kind' is missing` error here means a `BoulderBeta` or `BetaThread` literal somewhere else needs the two new fields — fix it rather than making the fields optional.

Run: `npx vitest run`
Expected: PASS — all files, including the 4 `betaSort` cases and 5 `riskMoves` cases.

Run: `npm run lint 2>&1 | grep ✖`
Expected: the same count you measured before starting.

- [ ] **Step 9: Commit**

```bash
git add src/types/index.ts src/utils/betaSort.ts src/utils/betaSort.test.ts src/hooks/useBoulderBeta.ts
git commit -m "Pin cautions above tips, and wire up the sort that was never wired"
```

---

### Task 4: Post a caution

**Files:**
- Modify: `src/hooks/useBoulderBeta.ts` (`useAddBoulderBeta` at ~175)
- Modify: `src/pages/CrewPage.tsx` (composer at ~669-706, `submitBeta` at ~271, state at ~238)

**Interfaces:**
- Consumes: `RISK_MOVES` from Task 2; `BetaKind` from Task 3.
- Produces: `useAddBoulderBeta` accepts `{ gymProblemId, body, videoUrl, section, bodyType, kind, riskMove }`. Nothing later depends on the composer's internals.

- [ ] **Step 1: Widen the insert mutation**

In `src/hooks/useBoulderBeta.ts`, replace `useAddBoulderBeta` entirely:

```ts
export function useAddBoulderBeta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      gymProblemId: string
      body: string | null
      videoUrl: string | null
      section: BetaSection | null
      bodyType: BetaBodyType | null
      kind: BetaKind
      riskMove: string | null
    }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('boulder_beta')
        .insert({
          gym_problem_id: v.gymProblemId, user_id: user?.id, body: v.body,
          video_url: v.videoUrl, section: v.section, body_type: v.bodyType,
          // boulder_beta_caution_shape (090) rejects a caution with no move or
          // no words, and a plain beta that carries a move. The composer
          // disables submit on the same rule; this is the server's guard.
          kind: v.kind, risk_move: v.kind === 'caution' ? v.riskMove : null,
        })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['boulder_beta', v.gymProblemId] }),
  })
}
```

- [ ] **Step 2: Add composer state and submit logic**

In `src/pages/CrewPage.tsx`, add the import for the vocabulary alongside the existing util imports:

```ts
import { RISK_MOVES } from '../utils/riskMoves'
```

Add two state hooks immediately after `const [draftBody, setDraftBody] = useState<BetaBodyType | null>(null)`:

```ts
  // "Watch out" mode: the beta names the move that hurts people and what to do
  // instead. Both parts are required — see boulder_beta_caution_shape (090).
  const [draftCaution, setDraftCaution] = useState(false)
  const [draftRiskMove, setDraftRiskMove] = useState<string | null>(null)
```

Replace `submitBeta` entirely:

```ts
  const submitBeta = () => {
    const body = draft.trim()
    const videoUrl = draftVideo.trim() || null
    if (draftCaution) {
      // A caution with no move, or no words about it, is just "be careful".
      if (!body || !draftRiskMove) return
    } else if (!body && !videoUrl) {
      return
    }
    addBeta.mutate(
      {
        gymProblemId: id,
        body: body || null,
        videoUrl,
        section: draftSection,
        bodyType: draftBody,
        kind: draftCaution ? 'caution' : 'beta',
        riskMove: draftCaution ? draftRiskMove : null,
      },
      {
        onSuccess: () => {
          setDraft(''); setDraftVideo(''); setDraftSection(null); setDraftBody(null)
          setDraftCaution(false); setDraftRiskMove(null)
          toast.success(draftCaution ? 'Watch-out posted' : 'Beta shared')
        },
        onError: () => toast.error(draftCaution ? 'Could not post the watch-out' : 'Could not post beta'),
      },
    )
  }
```

- [ ] **Step 3: Add the toggle, the chips, and the submit rule to the composer**

In the "Share beta" block, replace the opening `<div>` and `<textarea>` so the whole card reflects caution mode:

```tsx
            {/* Share beta */}
            <div className={`rounded-2xl border bg-white p-3 space-y-2 ${
              draftCaution ? 'border-amber-300 ring-1 ring-amber-300' : 'border-gray-200'
            }`}>
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder={draftCaution
                  ? 'What should people do instead?'
                  : 'Share beta — how does the move go?'}
                rows={2}
                className="w-full resize-none text-sm focus:outline-none placeholder:text-gray-400"
              />
```

Immediately after the `draftVideo` input, add the toggle and chip row:

```tsx
              <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2">
                <button type="button"
                  onClick={() => { setDraftCaution(!draftCaution); setDraftRiskMove(null) }}
                  aria-pressed={draftCaution}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    draftCaution ? 'bg-amber-400 text-amber-950' : 'bg-gray-100 text-gray-600'
                  }`}>
                  ⚠️ Watch out
                </button>
                {draftCaution && RISK_MOVES.map(m => (
                  <button key={m.id} type="button"
                    onClick={() => setDraftRiskMove(draftRiskMove === m.id ? null : m.id)}
                    aria-pressed={draftRiskMove === m.id}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      draftRiskMove === m.id ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-900 border border-amber-200'
                    }`}>
                    {m.label}
                  </button>
                ))}
              </div>
              {draftCaution && (
                <p className="text-[11px] leading-snug text-amber-700">
                  Pick the move, then say what to do instead. Everyone at this gym
                  sees it, and the setters get told.
                </p>
              )}
```

Then update the submit button's `disabled` rule (leave the Section/For chip row above it untouched):

```tsx
                <button type="button" onClick={submitBeta}
                  disabled={addBeta.isPending || (draftCaution
                    ? (!draft.trim() || !draftRiskMove)
                    : (!draft.trim() && !draftVideo.trim()))}
                  className="inline-flex items-center gap-1.5 rounded-full bg-sage-700 px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
                  <Send size={14} /> {draftCaution ? 'Post watch-out' : 'Post beta'}
                </button>
```

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: `✓ built`, no errors.

Run: `npm run lint 2>&1 | grep ✖`
Expected: unchanged from your baseline.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBoulderBeta.ts src/pages/CrewPage.tsx
git commit -m "Let a climber post a watch-out on a boulder"
```

---

### Task 5: Render a caution

**Files:**
- Modify: `src/components/BetaThreadCard.tsx`
- Modify: `src/pages/CrewPage.tsx` (badge row at ~443)

**Interfaces:**
- Consumes: `riskMoveLabel` from Task 2; `thread.kind` / `thread.risk_move` from Task 3.
- Produces: nothing new.

- [ ] **Step 1: Make the card show a caution as a caution**

In `src/components/BetaThreadCard.tsx`, add the util import after the existing type imports:

```ts
import { riskMoveLabel } from '../utils/riskMoves'
```

Add a derived flag as the first line of the component body, above `const [reply, setReply] = useState('')`:

```ts
  const caution = thread.kind === 'caution'
```

Replace the outer `<div>`'s className so a caution reads amber, and so `best` never dresses a caution as "Top beta":

```tsx
    <div className={`rounded-2xl p-3 border ${
      caution
        ? 'bg-amber-50 border-amber-300'
        : best ? 'bg-white border-sage-500 ring-1 ring-sage-500' : 'bg-white border-gray-200'
    }`}>
```

In the header row, replace the `best &&` badge with a pair that shows the right one:

```tsx
        {caution ? (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-400 text-amber-950 px-2 py-0.5 text-[10px] font-bold">
            ⚠️ Watch out
          </span>
        ) : best && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-sage-700 text-white px-2 py-0.5 text-[10px] font-bold">
            <Star size={10} fill="currentColor" /> Top beta
          </span>
        )}
```

Add the move chip to the right-hand chips, immediately before the `thread.section &&` chip:

```tsx
        {caution && thread.risk_move && (
          <span className="rounded-md bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
            {riskMoveLabel(thread.risk_move)}
          </span>
        )}
```

Relabel the confirm button — on a caution "worked for me" would read as approval of getting hurt:

```tsx
        <button type="button" onClick={onToggleWorked}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
            thread.worked_by_me
              ? caution ? 'bg-amber-500 text-white' : 'bg-sage-700 text-white'
              : caution ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-sage-50 text-sage-800 border border-sage-200'
          }`}>
          {caution
            ? (thread.worked_by_me ? 'You said me too' : 'Me too')
            : `✓ ${thread.worked_by_me ? 'Worked for you' : 'Worked for me'}`}
          {thread.worked_count > 0 && <span className="opacity-80">· {thread.worked_count}</span>}
        </button>
```

- [ ] **Step 2: Add the badge to the boulder header**

In `src/pages/CrewPage.tsx`, find the badge row containing the `🆘 Help wanted` span (~line 443) and add a sibling immediately after it:

```tsx
              {cautionCount > 0 && (
                <span className="inline-flex items-center rounded-md bg-amber-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
                  ⚠️ Watch out{cautionCount > 1 ? ` ×${cautionCount}` : ''}
                </span>
              )}
```

Define the count immediately after the `threads` declaration, which is at
`src/pages/CrewPage.tsx:267` and reads `const threads = betaData?.threads ?? []`.
It must go *after* that line, not up with the other derived values near
`useBoulderHelp` — `threads` doesn't exist yet up there:

```ts
  // Distinct cautions on this boulder, not the sum of their me-toos: the badge
  // answers "how many different things bite here". Corroboration belongs to
  // each caution and is shown on its own card.
  const cautionCount = threads.filter(t => t.kind === 'caution').length
```

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: `✓ built`, no errors.

Run: `npm run lint 2>&1 | grep ✖`
Expected: unchanged from your baseline.

- [ ] **Step 4: Commit**

```bash
git add src/components/BetaThreadCard.tsx src/pages/CrewPage.tsx
git commit -m "Show a caution in amber, with its move and a me-too count"
```

---

### Task 6: Retract and remove

**Files:**
- Modify: `src/hooks/useBoulderBeta.ts` (add two mutations beside `useDeleteBetaComment`)
- Modify: `src/components/BetaThreadCard.tsx`
- Modify: `src/pages/CrewPage.tsx` (the `BetaThreadCard` call at ~712)

**Interfaces:**
- Consumes: `admin_delete_beta` from Task 1.
- Produces: `useDeleteBoulderBeta()` and `useAdminDeleteBoulderBeta()`, both taking `{ betaId: string; gymProblemId: string }`; `BetaThreadCard` gains an optional `onDelete?: () => void` prop.

- [ ] **Step 1: Add the two mutations**

In `src/hooks/useBoulderBeta.ts`, add after `useDeleteBetaComment`:

```ts
/**
 * The author retracting their own beta. Permitted by the existing
 * "users manage own boulder_beta" policy (052) — this is the first UI for it.
 * Its me-toos, replies and reactions cascade; points already earned stay.
 */
export function useDeleteBoulderBeta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { betaId: string; gymProblemId: string }) => {
      const { error } = await supabase.from('boulder_beta').delete().eq('id', v.betaId)
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['boulder_beta', v.gymProblemId] }),
  })
}

/**
 * Moderation. Goes through the RPC rather than a delete: RLS permits the author
 * only, and a delete that RLS refuses removes zero rows and returns NO error —
 * the admin would get a success toast and watch the beta stay put. The RPC
 * raises 'Only admins can remove beta' instead.
 */
export function useAdminDeleteBoulderBeta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { betaId: string; gymProblemId: string }) => {
      const { error } = await supabase.rpc('admin_delete_beta', { p_beta_id: v.betaId })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['boulder_beta', v.gymProblemId] }),
  })
}
```

- [ ] **Step 2: Add the affordance to the card**

In `src/components/BetaThreadCard.tsx`, add `onDelete` to the props type and destructuring:

```ts
  onReactReply,
  onDelete,
}: {
```

```ts
  onReactReply: (commentId: string, emoji: string, mine: boolean) => void
  /** Absent when the viewer may not remove this beta. */
  onDelete?: () => void
}) {
```

Add the button to the header row, immediately after the `{thread.body_type && …}` chip (`Trash2` is already imported for replies):

```tsx
        {onDelete && (
          <button type="button" aria-label="Delete beta" onClick={onDelete}
            className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
        )}
```

- [ ] **Step 3: Wire it up with a confirm**

In `src/pages/CrewPage.tsx`, add both names to the existing multi-line import
from `../hooks/useBoulderBeta` (it spans lines 21-31 and already lists
`useAddBoulderBeta`, `useAddBetaComment`, `useDeleteBetaComment` and others):

```ts
  useDeleteBoulderBeta,
  useAdminDeleteBoulderBeta,
```

Then add the hooks beside the other beta mutations, after
`const deleteBetaComment = useDeleteBetaComment()` (line 211):

```ts
  const deleteBeta = useDeleteBoulderBeta()
  const adminDeleteBeta = useAdminDeleteBoulderBeta()
```

Add the handler next to `submitBeta`:

```ts
  /**
   * Author retraction and admin moderation land on the same button. The author
   * path is a plain delete under RLS; the admin path is the RPC, which raises
   * rather than silently removing nothing.
   */
  const removeBeta = (betaId: string, authorId: string) => {
    const mine = authorId === user?.id
    if (!window.confirm(mine
      ? 'Delete your beta? Replies and me-toos go with it.'
      : 'Remove this beta for everyone?')) return
    const m = mine ? deleteBeta : adminDeleteBeta
    m.mutate({ betaId, gymProblemId: id }, {
      onSuccess: () => toast.success(mine ? 'Beta deleted' : 'Beta removed'),
      onError: () => toast.error('Could not delete this beta'),
    })
  }
```

Pass it to the card, adding one prop to the existing `<BetaThreadCard …>` call:

```tsx
                  onDelete={t.user_id === user?.id || myProfile?.is_admin
                    ? () => removeBeta(t.id, t.user_id)
                    : undefined}
```

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: `✓ built`, no errors.

Run: `npm run lint 2>&1 | grep ✖`
Expected: unchanged from your baseline.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBoulderBeta.ts src/components/BetaThreadCard.tsx src/pages/CrewPage.tsx
git commit -m "Let an author retract their beta and an admin remove one"
```

---

### Task 7: Render the setter's notification

**Files:**
- Modify: `src/components/AppBar.tsx` (`describe` switch at ~150-190, `routeFor` switch at ~195-230)

**Interfaces:**
- Consumes: the `'boulder_caution'` type from Task 3 and the `data` keys (`risk_move`, `gym`) written by Task 1's trigger.
- Produces: nothing.

- [ ] **Step 1: Describe it**

In `src/components/AppBar.tsx`, add the import for the label helper beside the other util imports:

```ts
import { riskMoveLabel } from '../utils/riskMoves'
```

Add a case to the `describe` switch, immediately after the `'variation_cleared'` case:

```ts
    case 'boulder_caution': {
      const move = riskMoveLabel(d.risk_move ?? null)
      return {
        text: `${username} flagged a move to watch out for${d.gym ? ` at ${d.gym}` : ''} ⚠️`,
        detail: move || undefined,
      }
    }
```

- [ ] **Step 2: Route it**

Add to the `routeFor` switch, immediately after the `'variation_cleared'` case:

```ts
    case 'boulder_caution':
      return n.entity_id ? `/gym-problems/${n.entity_id}` : null
```

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: `✓ built`, no errors.

Run: `npm run lint 2>&1 | grep ✖`
Expected: unchanged from your baseline.

- [ ] **Step 4: Commit**

```bash
git add src/components/AppBar.tsx
git commit -m "Render the watch-out notification for setters"
```

---

### Task 8: Full verification

**Files:** none — this task changes nothing.

- [ ] **Step 1: Run the whole suite**

Run: `npx vitest run`
Expected: all test files pass. The new cases are 5 in `riskMoves.test.ts` and 4 in `betaSort.test.ts`.

- [ ] **Step 2: Confirm the build and lint are clean**

Run: `npm run build`
Expected: `✓ built`, no TypeScript errors.

Run: `npm run lint 2>&1 | grep ✖`
Expected: **exactly** the baseline you measured before Task 1. If it is higher, fix the new problems — a lint regression fails the deploy.

- [ ] **Step 3: Report the release gate**

State plainly in your report:

- `supabase/migrations/090_caution_beta.sql` is **written but not applied**.
- **074 must be applied before 090.** Confirm the state of the 074→078 chain in the dashboard.
- Until 090 is applied, posting any beta fails (the insert names `kind` and `risk_move`), so the manual pass in Task 9 cannot start.

---

### Task 9: Manual pass (owner, after applying migration 090)

**Files:** none.

Components, hooks and pages have no test coverage in this project by design, so this list is the only verification those layers get. Walk it on a phone-width viewport.

- [ ] Apply 090 in the Supabase dashboard. The output should include the notice `090 ok: caution insert, setter fan-out and shape constraint all behaved` — or `090 smoke test skipped` on an empty database. Anything else means stop and fix before deploying.
- [ ] On a boulder's Beta tab, post a normal beta. It still works, and still says "Beta shared".
- [ ] Toggle **⚠️ Watch out**. The card turns amber, the placeholder becomes "What should people do instead?", the move chips appear, and the button reads "Post watch-out".
- [ ] With the toggle on, confirm submit stays disabled with text but no chip, and with a chip but no text.
- [ ] Post a caution. It appears **above** every tip, in amber, with its move chip and a "Watch out" badge.
- [ ] The boulder header shows `⚠️ Watch out`. Post a second caution: it reads `⚠️ Watch out ×2`.
- [ ] From another account, tap **Me too**. The count rises. In the Supabase SQL editor, confirm no row was written: `select * from beta_points where reason in ('helpful','engagement') order by created_at desc limit 5;` — nothing new for this beta.
- [ ] Confirm posting the caution *did* pay, when it was that author's first beta on the boulder: `select * from beta_points where reason = 'beta_posted' order by created_at desc limit 5;`
- [ ] As a user with `is_setter = true` whose default gyms include that gym, check the notification bell: "… flagged a move to watch out for at …" with the move as detail, tapping through to the boulder.
- [ ] Reply to a caution. The reply posts, and still earns its engagement point.
- [ ] As the author, delete your own caution via the trash icon. Confirm the dialog, then confirm it disappears along with its replies and me-toos, and the header badge drops.
- [ ] As an admin on someone *else's* beta, remove it. It disappears. As a non-admin on someone else's beta, confirm no trash icon is shown.

---

## Note: two dead files this plan deliberately leaves alone

`src/utils/betaSort.ts` was dead before Task 3 and is live after it. But `src/components/BetaCard.tsx` has no importers either, and it duplicates `BetaThreadCard`'s job closely enough that the next person to change beta rendering may well edit the wrong one — it still says "worked for" and knows nothing about cautions. `noUnusedLocals` does not catch an unused *file*, so nothing will flag it.

Deleting it is a one-line change and out of this feature's scope. Raise it with the owner rather than doing it inside these tasks.
