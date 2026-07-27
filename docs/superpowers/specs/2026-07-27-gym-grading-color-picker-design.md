# Gym grading as a per-gym color picker with grade scoring

**Date:** 2026-07-27
**Status:** Approved design — ready for implementation planning

## Problem / motivation

The gym grading colour on a problem (`problems.color`) is currently a **free-text
input** ("e.g. Blue circuit, Yellow tag") at
[`ProblemForm.tsx:228-237`](../../../src/components/ProblemForm.tsx). It is rendered
as plain text everywhere it appears. We want to turn it into a **colour picker**
that mirrors the existing hold-colour picker, but visualised as a **rectangle
(tape)** to symbolise a gym grading tape rather than a physical hold.

On top of that, gyms should be able to:

1. **Rank** their grading colours to define which colour is the hardest difficulty.
2. Define **how many points** a climber earns for doing a problem of a given colour.

Points earned this way form a **new, separate "grade score"**, distinct from the
existing social `beta_points` ledger, surfaced primarily through a **grade-score
leaderboard**.

## Key decisions (from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Config scope | **Per-gym** | Different gyms use different colour systems; ranking/points must be per-gym. |
| Points model | **Separate "grade score"** | Keep difficulty points independent from the social `beta_points` leaderboard. |
| Who edits config | **`is_admin` OR `is_setter`** | Setters already create/edit shared boulders and set intention; grading fits. |
| Score display | **Grade-score leaderboard** (primary) | Parallel to the existing beta-points leaderboard. |
| Score computation | **Derived on the fly (Approach A)** | No award ledger; editing points re-scores retroactively; smallest surface. |

## Existing context (from codebase exploration)

- **Two colours on a problem:** `problems.color` (gym grading — free text today, the
  refactor target) and `problems.hold_color` (physical hold — already a palette name).
- **Palette to reuse:** `HOLD_COLORS` in
  [`src/utils/holdColors.ts`](../../../src/utils/holdColors.ts) — 11 named colours with
  hex, `as const`. Stored value is the colour **name**; `colorHex(name)` maps name → hex
  with a fallback that keeps legacy free-text values renderable.
- **Picker pattern to mirror:** swatch buttons at
  [`ProblemForm.tsx:239-266`](../../../src/components/ProblemForm.tsx) (the hold-colour
  picker) + renderers `HoldGraphic` / `HoldDot` in
  [`src/components/Chip.tsx`](../../../src/components/Chip.tsx).
- **No `gyms` table:** a "gym" is a free-text string column (`problems.gym`,
  `gym_problems.gym`, `beta_points.gym`). Per-gym config is therefore **keyed by that
  string**, not by a gym entity.
- **Points today are social only:** `beta_points`
  ([`046_beta_points.sql`](../../../supabase/migrations/046_beta_points.sql)) awards
  `first_logger` / `helpful` / `bounty_won`, grade-independent. Any grade→points link is
  net-new.
- **Admin panel:** [`AdminPage.tsx`](../../../src/pages/AdminPage.tsx), gated on
  `is_admin`, with no grading section today.
- **RPC pattern for gated writes:** SECURITY DEFINER RPC as in
  [`069_set_boulder_hold_color.sql`](../../../supabase/migrations/069_set_boulder_hold_color.sql).
- **Roles:** global `profiles.is_admin` and global `profiles.is_setter`
  ([`061_setter_role.sql`](../../../supabase/migrations/061_setter_role.sql)); no per-gym roles.

## Design

### 1. Config storage — `gym_gradings` table

New table, one row per (gym, colour):

```sql
gym_gradings (
  id          uuid primary key default gen_random_uuid(),
  gym         text not null,
  color_name  text not null,   -- a HOLD_COLORS name
  rank        int  not null,   -- difficulty order, easiest -> hardest
  points      int  not null,   -- points for doing a problem of this colour
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (gym, color_name)
)
```

- `color_name` is a value from `HOLD_COLORS`. A gym only lists the colours it uses.
- `rank` is the difficulty order; the **max-rank** colour is the hardest. Used to sort
  pickers/displays and to label difficulty. `points` are set **independently** of rank
  (rank orders, points score).
- **RLS:** readable by all authenticated users; no direct INSERT/UPDATE/DELETE.
- **Write RPC (SECURITY DEFINER, gated on `is_admin OR is_setter`):**
  `save_gym_gradings(p_gym text, p_rows jsonb)` — bulk upsert for the given gym: inserts/updates
  the colours present in `p_rows` and deletes rows for colours no longer present (so the admin
  editor saves the whole set atomically). Each element of `p_rows` is
  `{ color_name, rank, points }`.

### 2. Palette + tape visualisation

- **Reuse `HOLD_COLORS`** — no new palette. `problems.color` continues to store the
  colour **name** (backward compatible; `colorHex()` fallback keeps legacy free-text
  values rendering).
- **New `TapeGraphic`** (and compact `TapeDot`) in `Chip.tsx`, analogous to
  `HoldGraphic` / `HoldDot` but drawing a **rectangle (tape)** filled with
  `colorHex(name)`. A thin border/rounded corners so light colours (White) stay visible,
  consistent with the hold swatches.

### 3. `ProblemForm` grade-colour picker

Replace the free-text input at `ProblemForm.tsx:228-237` with a swatch picker showing
**the current gym's configured colours as tape rectangles**, loaded from `gym_gradings`
for the form's gym (a `useGymGradings(gym)` hook). Behaviour mirrors the hold-colour
picker:

- Hidden field registers `color`; clicking a tape sets `color` to that `color_name`,
  clicking the selected one clears it.
- Selected-state ring + a readout with a Clear button.
- Colours ordered by `rank`.
- If the gym has **no config yet**, show a hint ("No grading colours set for this gym
  yet") instead of the picker. (Free-text entry is not retained — grading colours now
  come from the gym's configured palette.)

### 4. Admin/setter config UI

New section in `AdminPage.tsx`, visible when `is_admin OR is_setter`:

- Pick a gym (from existing gym strings the user has access to).
- Add/remove `HOLD_COLORS` swatches (rendered as tapes) for that gym.
- Order the chosen colours by difficulty (sets `rank`, easiest → hardest).
- Set `points` per colour.
- Save via `save_gym_gradings(gym, rows)`.

The page's existing `is_admin`-only gate is widened for this section to
`is_admin OR is_setter` (other admin sections remain admin-only).

### 5. Grade-score leaderboard

Per-gym leaderboard: a user's score = Σ `points` over their **completed** problems in
that gym, looked up via that gym's `gym_gradings` map.

- Because raw logs are private (per-user RLS), the cross-user leaderboard is computed
  **server-side** by a SECURITY DEFINER RPC `gym_grade_leaderboard(p_gym text)` that
  joins users' completed problems to `gym_gradings` and returns per-user totals
  `(user_id, display_name, score)`, ordered desc.
- The **current user's own** grade score can additionally be derived client-side from
  their own problems + the gym config (pure helper — see Testing).
- Rendered parallel to the existing beta-points leaderboard (its own hook, e.g.
  `useGradeLeaderboard(gym)`), reusing the ranking presentation from
  [`leaderboard.ts`](../../../src/utils/leaderboard.ts) where practical.

**"Doing a problem"** = a problem logged as **sent/completed** (counted once per problem),
not per attempt.

### 6. Display updates

Swap the plain-text gym colour for a `TapeDot` / `TapeGraphic` swatch (colour name as the
accessible label) at the render sites currently using `color` as free text:

- [`SessionDetailPage.tsx:245`](../../../src/pages/SessionDetailPage.tsx)
- [`HelpPage.tsx:128`](../../../src/pages/HelpPage.tsx)
- [`BoulderLinkSheet.tsx`](../../../src/components/BoulderLinkSheet.tsx)
- [`GymBoulderPicker.tsx`](../../../src/components/GymBoulderPicker.tsx)
- [`CrewPage.tsx`](../../../src/pages/CrewPage.tsx)
- [`CreateBattleSheet.tsx`](../../../src/components/CreateBattleSheet.tsx)
- [`AppBar.tsx`](../../../src/components/AppBar.tsx)

Points values are not shown on every problem in v1 — they surface on the leaderboard and
in the admin config editor.

### 7. Shared boulders (`gym_problems.color`)

Shared boulders carry their own `color`. Editing it stays consistent with the new picker:
where a shared boulder's grading colour is set/edited, use the same tape picker and store
the `color_name`. Writes continue to go through the existing `create_gym_problem` /
boulder-edit RPCs (see the `set_boulder_hold_color` pattern in
[`069`](../../../supabase/migrations/069_set_boulder_hold_color.sql)); no new RLS on
`gym_problems` is introduced by this feature.

## Data model / TypeScript

- New `GymGrading` interface: `{ gym: string; color_name: string; rank: number; points: number }`.
- `problems.color` semantics unchanged (a `HOLD_COLORS` name, nullable).
- New hooks: `useGymGradings(gym)` (read), `useSaveGymGradings()` (write RPC),
  `useGradeLeaderboard(gym)` (leaderboard RPC).

## Migrations

Per the repo's manual-migration workflow, new migrations must be **applied in the Supabase
dashboard** before deploy:

1. `NNN_gym_gradings.sql` — table + RLS (select for authenticated) + `save_gym_gradings` RPC.
2. `NNN_gym_grade_leaderboard.sql` — `gym_grade_leaderboard(p_gym)` SECURITY DEFINER RPC.

(Exact numbers assigned at implementation time, continuing from the current highest.)

## Testing

Follows the repo convention (only pure utils are unit-tested):

- `gradeScore(problems, gymConfig)` pure helper — sums points for a user's completed
  problems given a gym's colour→points map. Unit tests: empty, unknown colours (0),
  multiple colours, completed-only filter.
- Rank ordering helper — colours sorted easiest → hardest, hardest = max rank.

RPCs and UI (picker, admin editor, leaderboard rendering) verified manually.

## Out of scope (YAGNI)

- A real `gyms` table / per-gym membership (config is keyed by the gym string).
- Materialised grade-points ledger (Approach B) — scores are derived.
- Awarding grade points into `beta_points` or the social leaderboard.
- Showing points on every problem card.
- Cross-gym aggregate grade score.

## Build / conventions notes

- `noUnusedLocals` fails the build — no unused imports/vars.
- Lint baseline is 17 — don't add new lint errors.
- Migrations are applied manually in the Supabase dashboard; deploy gates on applying them.
