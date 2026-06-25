# Boulder Picker — Video Support + Richer Tiles Design

**Date:** 2026-06-25
**Status:** Approved

## Summary

Extend the gym boulder picker so a shared boulder can carry a **beta video** (not just a photo), the mosaic includes **photo-or-video** boulders, and each tile shows the **grade** and **gym color**. Today `gym_problems` stores only a photo (`image_url`); this adds `beta_video_url`, captures it when a boulder is created, includes video-only boulders in the picker (rendered as a play-icon tile), and overlays grade + color on every tile.

## Decisions (from brainstorming)

- **Add a video to shared boulders** — `gym_problems.beta_video_url`, captured at boulder creation from the originating problem's `beta_video_url`. Applies to boulders created after this ships (existing boulders keep just their photo).
- **Picker criteria = photo OR video** (`image_url || beta_video_url`), replacing photo-only.
- **Video thumbnail = a Play-icon tile** (the app's existing external-video style), not a fetched poster frame. Beta videos are external Instagram/YouTube links.
- **Every tile overlays the grade** (`community_grade`, if set) **and a gym-color swatch** (`color`, if set).
- A boulder with a photo **and** a video shows the photo with a small ▶ corner badge.

## Scope

**In scope:**
- Migration: `gym_problems.beta_video_url` + `create_gym_problem` gains `p_beta_video_url` (reproducing the migration-046 body).
- `GymProblem` type, `useCreateGymProblem`, and the matcher's create path carry the video.
- `ProblemPrefill` + `boulderToPrefill` + `ProblemForm` prefill carry `beta_video_url` (picking a video boulder logs a problem with that video).
- `GymBoulderPicker`: photo-or-video criteria; photo / play-tile / photo+badge rendering; grade + color overlay.

**Out of scope (YAGNI):**
- Fetching real video poster frames (oEmbed/noembed).
- Backfilling video onto existing boulders.
- Editing a boulder's media after creation; video on the matcher's *suggestion* preview tiles.
- Any change to `useGymBoulders`'s active/gym/expiry filtering.

## Design

### Migration

Additive column + extend the create RPC (the next migration number):

```sql
alter table gym_problems add column if not exists beta_video_url text;
```

`create_gym_problem` currently (migration 046) takes 5 params and inserts the boulder + a `first_logger` `beta_points` row. The new migration:
- `drop function if exists public.create_gym_problem(text, text, text, text, text);` (the old 5-arg signature) to avoid overload ambiguity,
- `create or replace function public.create_gym_problem(p_gym, p_color, p_wall_angle, p_name, p_image_url, p_beta_video_url text default null)` — **reproducing migration 046's body verbatim** (auth/gym checks, the `gym_problems` insert, the `first_logger` `beta_points` insert) and only adding `beta_video_url` to the insert column/value lists. `SECURITY DEFINER` preserved.

The 6th param is defaulted so any 3/5-arg named callers still resolve; the only caller passes it explicitly.

### Types / hooks

- `GymProblem` (`src/types`) += `beta_video_url: string | null`.
- `useCreateGymProblem` mutation input += `beta_video_url: string | null`; the `.rpc('create_gym_problem', …)` call passes `p_beta_video_url`.
- `GymProblemMatcher`'s `createNew` passes `beta_video_url: problem.beta_video_url` (alongside the existing `image_url`).
- `ProblemPrefill` (`src/types`) += `beta_video_url: string | null`; `boulderToPrefill` maps `beta_video_url ← gp.beta_video_url`.
- `ProblemForm` prefill: the `beta_video_url` default becomes `existing?.beta_video_url ?? prefill?.beta_video_url ?? ''` (so a picked video boulder seeds the field).

### `GymBoulderPicker`

- Criteria: `const media = boulders.filter(b => b.image_url || b.beta_video_url)` (was `b.image_url` only). Empty-state copy generalized to "with photos or videos".
- Tile (each an `aspect-square` button):
  - `image_url` present → the photo (`object-cover`); if `beta_video_url` also present, a small ▶ badge in a corner.
  - else (`beta_video_url` only) → a dark tile (`bg-gray-800`) with a centered ▶ `Play` icon (lucide), matching the app's beta-video style.
  - **Overlay** (bottom strip, over both kinds): the grade text (`community_grade`) when set, and a small color swatch/dot using `color` (a simple bg block + the color name) when set. Kept legible over imagery (e.g. a subtle dark gradient behind the text).
- Tapping any tile → `onPick(gp)` (unchanged).

### Error handling

- Neither photo nor video → excluded from the mosaic (just like the old photo-only exclusion, now broadened).
- Missing grade or color → that overlay element is omitted (no empty badge).
- Broken photo URL → broken `<img>`; non-fatal (unchanged).

### Testing

- **Unit (Vitest):** extend `boulderPrefill.test.ts` to assert `beta_video_url` is mapped (set and null cases).
- **Verification (per repo convention):** migration faithfully reproduces the 046 `create_gym_problem` body (reviewer diffs it; no SQL test harness); types/hooks/matcher/picker via `npx tsc -b` + `npm run lint` (baseline 17, 0 new) + `npm run build`. Manual: create a boulder from a problem that has a beta video → it appears in the picker as a play tile with grade/color overlay; a photo boulder shows grade/color overlay; picking either opens a prefilled form carrying the right media.

## Open questions for implementation

- **Overlay legibility:** exact styling (gradient vs solid scrim) is a polish detail — pick a readable default (small dark gradient + white grade text, color dot), tune in manual QA.
- **Color swatch when `color` is a free-text name (e.g. "Blue") rather than a hex:** render a labeled chip (the text) rather than trying to map names→hex; a name→swatch-color map is a possible later refinement.
