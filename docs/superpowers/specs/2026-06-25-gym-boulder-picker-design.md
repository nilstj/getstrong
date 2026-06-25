# Gym Boulder Picker Design

**Date:** 2026-06-25
**Status:** Approved

## Summary

When adding a problem to a session, let the climber pick from the **existing shared boulders** at that gym instead of typing a new one. A "From gym" view shows the gym's shared boulders as an Instagram-style thumbnail mosaic (newest first); tapping a thumbnail opens the Add Problem form **prefilled** from that boulder, and saving logs it into the session and claims it onto the boulder (joining its crew).

This reuses the Crew Projects `gym_problems` (crowd-created boulders) and the existing claim flow — it's the "browse existing → log it" complement to the current "log new → optionally claim" matcher path.

## Decisions (from brainstorming)

- **Source = shared `gym_problems`** (one canonical photo per boulder), not personal `problems`.
- **Gym scope = the session's `location`**, used automatically (no gym picker). Empty/no-match → an empty-state message.
- **Tap opens a prefilled form to confirm** (set attempts/sent/grade before saving), rather than adding immediately.
- **Boulders without a photo are hidden** — the mosaic shows only boulders that have an `image_url`.

## Scope

**In scope:**
- `useGymBoulders(gym)` hook — active `gym_problems` for a gym, newest first.
- `boulderToPrefill(gp)` pure helper + `ProblemPrefill` type (unit-tested).
- `GymBoulderPicker` mosaic component.
- A `prefill` prop on `ProblemForm` (new-problem defaults, distinct from `existing`).
- Wiring in `SessionDetailPage`: a `[New · From gym]` toggle in the add-sheet "problem" tab; pick → prefilled form → save creates the problem and claims it onto the boulder.

**Out of scope (YAGNI):**
- A gym selector to browse other gyms (uses the session's gym only).
- Add-immediately (no-confirm) tapping.
- Picking from personal `problems`; any new migration/table.
- The per-problem matcher path is unchanged (this is additive).

## Design

### Data — `useGymBoulders(gym)`

`src/hooks/useGymProblems.ts` gains:

```ts
export function useGymBoulders(gym: string) // returns GymProblem[]
```

Queries `gym_problems` `.eq('status','active').ilike('gym', gym).order('created_at', { ascending: false })`, then client-filters with `isActiveBoulder(gp, now)` (drops expired). `enabled: gym.trim().length > 0`. Query key `['gym_boulders', gym.trim().toLowerCase()]`. (Mirrors the existing `useMatchingGymProblems` shape, minus the color match.)

### Prefill mapping — `boulderToPrefill` (pure, tested)

`src/utils/boulderPrefill.ts`:

```ts
export interface ProblemPrefill {
  name: string | null
  color: string | null
  grade_value: string | null
  image_url: string | null
  gym: string | null
}
export function boulderToPrefill(gp: GymProblem): ProblemPrefill
```

Maps a boulder to new-problem defaults: `name ← gp.name`, `color ← gp.color`, `grade_value ← gp.community_grade`, `image_url ← gp.image_url`, `gym ← gp.gym`. Pure and unit-tested (the one genuinely testable unit).

### `GymBoulderPicker` component

`src/components/GymBoulderPicker.tsx` — props `{ gym: string; onPick: (gp: GymProblem) => void }`.

- Calls `useGymBoulders(gym)` and **shows only boulders with a non-empty `image_url`** (no-photo boulders are filtered out — the mosaic is photos only).
- Renders a **3-column square grid** (`grid grid-cols-3 gap-0.5`); each tile is an `aspect-square` `button` showing the boulder's photo (`object-cover`).
- Tap → `onPick(gp)`.
- Empty states: if `gym` is blank → "Set a gym on this session (Location) to browse its boulders."; if loaded and there are no photo'd boulders → "No shared boulders with photos at {gym} yet — log a new one."

### `ProblemForm` prefill

`ProblemForm` gains an optional `prefill?: ProblemPrefill`. Its `defaultValues` use `existing?.X ?? prefill?.X ?? <current default>` for `name`, `color`, `grade_value`, `gym`; the image preview/submit treats `prefill?.image_url` like `existing?.image_url` (the boulder's photo is reused as the problem's `image_url`, no re-upload). `existing` (edit mode) takes precedence over `prefill`. When neither is set, behavior is unchanged.

### Wiring — `SessionDetailPage`

- The add-sheet "problem" tab gets a `[New · From gym]` segmented toggle (local state `problemMode: 'new' | 'gym'`).
- **New** → current `ProblemForm` with `defaultGym` (unchanged).
- **From gym** → `GymBoulderPicker gym={session.location}`. On `onPick(boulder)`: store the picked boulder, switch the view to `ProblemForm` with `prefill={boulderToPrefill(boulder)}` and `defaultGym={session.location}`.
- On that prefilled form's submit: create the problem via the existing `useAddProblem`, then on success call `useClaimGymProblem({ problemId: newId, gymProblemId: boulder.id })`, invalidate, toast, and close. (Claim is the existing step-1 RPC; it sets `problems.gym_problem_id` and joins the crew.)
- Picking is reset when the sheet closes / mode switches back to New.

### Error handling

- `gym` blank or `useGymBoulders` error/empty → empty-state message; no crash.
- Claim failure after problem creation → the problem is still logged (toast notes the link failed); the boulder link is best-effort. (Acceptable: the problem exists; the user can re-claim via the matcher.)
- Boulder photo URL broken → tile/preview shows a broken image; non-fatal.

### Testing

- **Unit (Vitest):** `boulderToPrefill` maps each field correctly, including nulls (no name/color/grade/photo). The repo's only unit-tested layer.
- **Verification (per repo convention):** `useGymBoulders`, `GymBoulderPicker`, the `ProblemForm` prefill, and the wiring via `npx tsc -b` + `npm run lint` (baseline) + `npm run build`. Manual: on a session at a gym with shared boulders, open Add → From gym → see the mosaic → tap → confirm the prefilled form → save → the problem appears in the session and shows "On a shared boulder" / appears on the boulder's crew.

## Open questions for implementation

- **Prefill grade vs grade system:** `community_grade` is a single string and may not match the user's preferred scale's dropdown options; it's prefilled as-is and the user can change it. Fine for v1; a scale-aware conversion is a possible later refinement.
- **Mosaic size cap:** `useGymBoulders` is unbounded; if a gym accrues very many boulders, add a `.limit(60)` and/or lazy loading. Not needed at current scale.
