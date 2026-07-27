# Beta Points Scheme + Info Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the beta-points awards match the intended scheme (photo-gated logging, points for posting a beta, an engagement point for commenting or marking), then explain the scheme in a popup behind an info icon on the leaderboards page.

**Architecture:** The points half is one SQL migration and no client code: betas and beta comments are inserted directly by the client while `beta_points` has no insert policy, so the two new awards are `AFTER INSERT` triggers, and the worked-mark award goes into the existing `mark_beta_worked` RPC. The popup half is a self-contained React component that owns its open state and reuses the app's existing `BottomSheet`.

**Tech Stack:** PostgreSQL / Supabase (plpgsql, `SECURITY DEFINER`, RLS), React 19, TypeScript, Tailwind (custom `sage` palette), lucide-react icons, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-27-beta-points-scheme-and-info-popup-design.md`

## Global Constraints

- **The scheme after this work, exactly:** `first_logger` 10 for logging a shared boulder **with a photo** (no photo → no award row at all); `beta_posted` 5 for posting a beta, **first beta per (user, gym problem)**; `helpful` 5 for the first "worked for me" mark on your beta (**unchanged** from migration 053); `engagement` 1 for commenting on **or** marking **someone else's** beta, **once per (user, beta)** whichever action lands first.
- **A user who both comments on and marks the same beta earns 1 engagement point, not 2.** The guard is per (user, beta), not per action kind.
- **Never award on your own beta.** Commenting on or marking your own beta pays nothing.
- **No retroactivity.** `beta_points` is append-only; existing rows stand and no backfill runs.
- **Emoji reactions pay nothing.** Only `boulder_beta_comments` counts as a comment.
- **`cycle_month` is always** `to_char((now() at time zone 'utc'), 'YYYY-MM')` — every existing award stamps it this way and the leaderboards page's UTC month arithmetic depends on it.
- **New SQL functions must carry** `set search_path = public, pg_temp` (precedent: migrations 064, 066, 071). Older RPCs omit it; do not copy that omission.
- **Do not apply the migration.** Migrations in this project are applied by hand in the Supabase dashboard. Write the file and stop.
- **`npm run build` must pass** (`tsc -b` with `noUnusedLocals`).
- **`npm run lint` must stay at the baseline of 16 problems** (15 errors, 1 warning, all pre-existing). No new problems; do not fix pre-existing ones.
- **`npx vitest run` must pass** — 137 tests across 17 files.
- **Only pure functions in `src/utils/` get tests.** This project has no `@testing-library/react`. Do not write component tests and do not add test tooling. This work adds no pure utils, so it adds no tests.
- **Tailwind classes only.** No inline `style` attributes, no CSS files.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/074_beta_points_scheme.sql` | *(create)* The entire scheme change: widen the `reason` constraint, add `beta_points.beta_id`, photo-gate `create_gym_problem`'s award, and add the three award paths. |
| `src/components/BetaPointsInfo.tsx` | *(create)* The info icon button plus its `BottomSheet`, owning its own `open` state and the rule copy. |
| `src/pages/LeaderboardsPage.tsx` | *(modify)* Render `<BetaPointsInfo />` inside the "Beta points" heading. |

The migration is one task rather than four: a half-applied migration is not a
deliverable, and the four parts must land in the same file for the human to apply
in one dashboard paste.

---

### Task 1: Migration 074 — the award scheme

**Files:**
- Create: `supabase/migrations/074_beta_points_scheme.sql`

**Interfaces:**
- Consumes: existing tables `beta_points` (046), `boulder_beta` (052), `boulder_beta_worked` (053), `boulder_beta_comments` (058), `gym_problems` (044).
- Produces: no TypeScript surface. Later tasks depend only on the *documented* scheme, not on any new signature. `create_gym_problem` keeps its exact 7-argument signature so no client call site changes.

Facts you need, already verified — do not re-derive them:
- The `reason` check is declared inline at `046_beta_points.sql:13`, so Postgres named it `beta_points_reason_check`.
- `beta_points` already has `user_id, gym, gym_problem_id, points, reason, cycle_month, created_at` (046) plus `response_id` (068).
- `boulder_beta` has `id, gym_problem_id, user_id, body, video_url, awarded, created_at`.
- `boulder_beta_comments` has `id, beta_id, user_id, body, created_at`.
- The current `create_gym_problem` is the 7-argument version at `068_gym_problem_hold_color.sql:10-41`.
- The current `mark_beta_worked` is at `053_boulder_beta_worked.sql:25-61`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/074_beta_points_scheme.sql` with exactly this content:

```sql
-- Beta points: make the awarded scheme match the intended one, and give the
-- ledger the beta_id it needs to dedupe engagement points.
--
-- Scheme after this migration:
--   10  first_logger   logging a shared boulder WITH a photo (no photo, no award)
--    5  beta_posted    posting a beta — first beta per (user, gym problem)
--    5  helpful        first "worked for me" mark on your beta (unchanged, 053)
--    1  engagement     commenting on, or marking, SOMEONE ELSE'S beta — once per
--                      (user, beta), whichever action lands first
--
-- Betas and beta comments are inserted directly by the client (useBoulderBeta.ts)
-- and beta_points has no insert policy (046), so those two awards are AFTER INSERT
-- triggers rather than client calls. The worked-mark award stays in its RPC.
-- Nothing is backfilled: the ledger is append-only and history stands.

-- ── 1. widen the reason constraint ───────────────────────────────────────────
alter table beta_points drop constraint if exists beta_points_reason_check;
alter table beta_points add constraint beta_points_reason_check
  check (reason in ('bounty_won', 'helpful', 'first_logger', 'beta_posted', 'engagement'));

-- ── 2. beta_id, for the per-beta engagement guard ────────────────────────────
alter table beta_points
  add column if not exists beta_id uuid references boulder_beta(id) on delete set null;

create index if not exists beta_points_engagement_idx
  on beta_points (user_id, beta_id) where reason = 'engagement';

-- ── 3. first_logger only when a photo is attached ────────────────────────────
-- Reproduces 068's 7-arg create_gym_problem. The ONLY change is that the award is
-- wrapped in a photo check (plus search_path hardening). Signature is unchanged so
-- no client call site moves.
create or replace function public.create_gym_problem(
  p_gym            text,
  p_color          text,
  p_wall_angle     text,
  p_name           text,
  p_image_url      text,
  p_beta_video_url text default null,
  p_hold_color     text default null
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

  insert into public.gym_problems (gym, color, hold_color, wall_angle, name, image_url, beta_video_url, created_by)
  values (trim(p_gym), p_color, p_hold_color, p_wall_angle, p_name, p_image_url, p_beta_video_url, v_user_id)
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

-- ── 4a. 5 points for posting a beta, first beta per boulder ──────────────────
create or replace function public.award_beta_posted()
returns trigger as $$
declare
  v_gym text;
begin
  -- One beta_posted award per author per boulder; extra betas there pay nothing.
  if exists (
    select 1 from public.beta_points
     where user_id = new.user_id
       and gym_problem_id = new.gym_problem_id
       and reason = 'beta_posted'
  ) then
    return new;
  end if;

  select gym into v_gym from public.gym_problems where id = new.gym_problem_id;
  if v_gym is null then
    return new;
  end if;

  insert into public.beta_points (user_id, gym, gym_problem_id, beta_id, points, reason, cycle_month)
  values (new.user_id, v_gym, new.gym_problem_id, new.id, 5, 'beta_posted',
          to_char((now() at time zone 'utc'), 'YYYY-MM'));
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists on_boulder_beta_award on boulder_beta;
create trigger on_boulder_beta_award
  after insert on boulder_beta
  for each row execute procedure public.award_beta_posted();

-- ── 4b. 1 engagement point for commenting on someone else's beta ─────────────
create or replace function public.award_beta_comment_engagement()
returns trigger as $$
declare
  v_author uuid;
  v_gpid   uuid;
  v_gym    text;
begin
  select b.user_id, b.gym_problem_id into v_author, v_gpid
    from public.boulder_beta b where b.id = new.beta_id;
  if v_author is null or v_author = new.user_id then
    return new;   -- your own beta pays nothing
  end if;

  -- One engagement point per (user, beta), whether earned by a comment or a mark.
  if exists (
    select 1 from public.beta_points
     where user_id = new.user_id and beta_id = new.beta_id and reason = 'engagement'
  ) then
    return new;
  end if;

  select gym into v_gym from public.gym_problems where id = v_gpid;
  if v_gym is null then
    return new;
  end if;

  insert into public.beta_points (user_id, gym, gym_problem_id, beta_id, points, reason, cycle_month)
  values (new.user_id, v_gym, v_gpid, new.beta_id, 1, 'engagement',
          to_char((now() at time zone 'utc'), 'YYYY-MM'));
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists on_beta_comment_award on boulder_beta_comments;
create trigger on_beta_comment_award
  after insert on boulder_beta_comments
  for each row execute procedure public.award_beta_comment_engagement();

-- ── 4c. mark_beta_worked: author keeps 5, marker now earns 1 ─────────────────
-- Reproduces 053's mark_beta_worked and ADDS the marker's engagement point. The
-- author's award keeps its boulder_beta.awarded guard, so toggling still can't
-- farm it, and unmark still never claws anything back.
create or replace function public.mark_beta_worked(p_beta_id uuid)
returns void as $$
declare
  v_user_id uuid := auth.uid();
  v_author  uuid;
  v_gpid    uuid;
  v_gym     text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select b.user_id, b.gym_problem_id into v_author, v_gpid
    from public.boulder_beta b where b.id = p_beta_id;
  if v_author is null then
    raise exception 'beta not found';
  end if;

  insert into public.boulder_beta_worked (beta_id, user_id)
  values (p_beta_id, v_user_id)
  on conflict (beta_id, user_id) do nothing;

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
              to_char((now() at time zone 'utc'), 'YYYY-MM'));
    end if;
  end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;
```

- [ ] **Step 2: Check the statement-order hazard you just wrote**

`FOUND` reflects the **most recent** SQL statement. In `mark_beta_worked` the
`select gym into v_gym` deliberately runs **before** the `update`, so `if found`
still refers to the `update`. Read your file and confirm that order survived. If
`select gym` sits between the `update` and `if found`, the author's 5 points break
silently — the award would fire on every mark instead of once.

Confirm two more things by reading:
- Every one of the four `insert into public.beta_points` statements stamps
  `cycle_month` as `to_char((now() at time zone 'utc'), 'YYYY-MM')`.
- The `create_gym_problem` argument list is byte-identical to
  `068_gym_problem_hold_color.sql:10-18`, so the 7-argument signature is replaced
  rather than a new overload being created.

- [ ] **Step 3: Verify no client call site assumed the old behaviour**

Run: `grep -rn "create_gym_problem\|mark_beta_worked" src/`

Expected: `src/hooks/useGymProblems.ts` calling `create_gym_problem` with the same
7 named arguments, and `src/hooks/useBoulderBeta.ts:192` calling
`mark_beta_worked` with `p_beta_id`. Neither signature changed, so neither file
needs an edit. If you find a call site passing a different argument count, stop and
report it — that means the reproduction drifted.

- [ ] **Step 4: Confirm the build and suite are untouched**

Run: `npm run build && npm run lint && npx vitest run`

Expected: build clean; lint exactly 16 problems (15 errors, 1 warning); 137 tests
across 17 files pass. This task changes no TypeScript, so any movement here means
you edited something you shouldn't have.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/074_beta_points_scheme.sql
git commit -m "Add migration 074: beta points award scheme"
```

**Do not apply this migration.** The human applies it in the Supabase dashboard.

---

### Task 2: BetaPointsInfo component

**Files:**
- Create: `src/components/BetaPointsInfo.tsx`

**Interfaces:**
- Consumes: `BottomSheet` from `src/components/BottomSheet.tsx`, whose props are exactly `{ open: boolean; onClose: () => void; title: string; children: ReactNode }`. It renders its own overlay, sticky header with the title, and a `×` close button, and returns `null` when `open` is false — so do not build any of that yourself.
- Produces: `<BetaPointsInfo />`, taking **no props** and owning its own `open` state. Task 3 renders it inside a heading.

The copy must match the scheme in Global Constraints exactly. It is the user-facing
contract for what migration 074 pays.

- [ ] **Step 1: Create the component**

Create `src/components/BetaPointsInfo.tsx`:

```tsx
import { useState } from 'react'
import { Info } from 'lucide-react'
import { BottomSheet } from './BottomSheet'

/** The award scheme from migration 074, in the order a climber earns them. */
const RULES: { points: number; rule: string; note: string }[] = [
  { points: 10, rule: 'Logging a shared boulder with a photo', note: 'no photo, no points' },
  { points: 5, rule: 'Posting a beta', note: 'your first beta on each boulder' },
  { points: 5, rule: 'Someone marks your beta “worked for me”', note: 'once per beta' },
  { points: 1, rule: 'Commenting on, or marking, someone else’s beta', note: 'once per beta' },
]

export function BetaPointsInfo() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="How beta points work"
        title="How beta points work"
        className="text-gray-400 hover:text-gray-600 transition-colors"
      >
        <Info size={14} strokeWidth={2} />
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="How beta points work">
        <div className="space-y-3">
          {RULES.map(r => (
            <div key={r.rule} className="flex gap-3">
              <span className="w-8 text-right text-lg font-bold text-sage-700 leading-tight">
                {r.points}
              </span>
              <div className="flex-1">
                <p className="text-sm text-gray-700">{r.rule}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{r.note}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-5 leading-relaxed">
          Points are counted per gym, per month. Once earned they are never taken away —
          if someone unmarks your beta, you keep the points.
        </p>
      </BottomSheet>
    </>
  )
}
```

The closing paragraph is not decoration: it states the two properties a climber
would otherwise discover by surprise — the board is per gym and resets monthly, and
unmarking never claws back the author's points (`053`, deliberate).

- [ ] **Step 2: Verify the build**

Run: `npm run build && npm run lint`

Expected: build clean; lint exactly 16 problems. The component is unused until
Task 3 — `noUnusedLocals` does not flag an unused exported component, so this
passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/BetaPointsInfo.tsx
git commit -m "Add BetaPointsInfo popup explaining the award scheme"
```

---

### Task 3: Put the icon in the Beta points heading

**Files:**
- Modify: `src/pages/LeaderboardsPage.tsx:136-139`

**Interfaces:**
- Consumes: `<BetaPointsInfo />` from Task 2 — no props, owns its own state.
- Produces: nothing further.

- [ ] **Step 1: Add the import**

In `src/pages/LeaderboardsPage.tsx`, add below the existing `LeaderboardList` import:

```tsx
import { BetaPointsInfo } from '../components/BetaPointsInfo'
```

- [ ] **Step 2: Render it in the heading**

The heading currently reads:

```tsx
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
              <Trophy size={15} strokeWidth={2} className="text-amber-500" />
              Beta points
            </h2>
```

Change it to:

```tsx
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
              <Trophy size={15} strokeWidth={2} className="text-amber-500" />
              Beta points
              <BetaPointsInfo />
            </h2>
```

The `h2` is already `flex items-center gap-1.5`, so the icon sits inline after the
label with the same spacing as the trophy. Do not add wrapper elements, and do not
touch the grade-score heading below it — only the beta-points board gets an icon.

- [ ] **Step 3: Verify the build, lint and suite**

Run: `npm run build && npm run lint && npx vitest run`

Expected: build clean; lint exactly 16 problems (15 errors, 1 warning); 137 tests
pass.

- [ ] **Step 4: Commit**

```bash
git add src/pages/LeaderboardsPage.tsx
git commit -m "Show the beta points info popup on the leaderboards page"
```

---

## Final verification

- [ ] `npm run build` — clean
- [ ] `npm run lint` — exactly 16 problems, unchanged
- [ ] `npx vitest run` — 137 tests across 17 files
- [ ] `git log --oneline -3` — three commits, one per task
- [ ] Manual, pre-migration: open `/analysis/leaderboards`, tap the ⓘ beside "Beta points", confirm the sheet opens with four rules and closes via `×` and via the backdrop

## Release gate

**Migration 074 must be applied in the Supabase dashboard before this client
deploys.** Until it is applied, the popup describes awards the database does not
pay. `create_gym_problem` keeps its 7-argument signature, so an unapplied 074 does
not break boulder creation — the mismatch is purely that the popup overstates.

Manual checks worth running **after** applying 074, since no automated test can
cover plpgsql here:

| Action | Expected |
|---|---|
| Log a shared boulder with a photo | +10 to you |
| Log one without a photo | no `beta_points` row at all |
| Post two betas on the same boulder | +5 total, not +10 |
| Post a beta on a different boulder | +5 |
| Comment on someone else's beta | +1 to you |
| Comment on that same beta again | +0 |
| Comment on your own beta | +0 |
| Mark someone else's beta worked (first ever mark) | +5 author, +1 you |
| Also comment on that beta you already marked | +0 (engagement is once per beta) |
| Unmark, then re-mark | no further points to anyone |
