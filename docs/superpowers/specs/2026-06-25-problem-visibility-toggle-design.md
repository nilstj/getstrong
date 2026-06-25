# Problem Visibility Toggle (Private / Public) Design

**Date:** 2026-06-25
**Status:** Approved

## Summary

Add a **Visibility** toggle to a problem — 🔒 **Private** (default) or 🌐 **Public**. Public turns the problem into a shared boulder via the existing match-or-create flow (join a matching boulder or create a new one), so it shows up under "From gym," others can log/claim it, and its crew page carries members, points, and beta. This replaces the separate "Find this boulder's crew" card button with a first-class toggle in the problem form, available on both logging and editing.

## Decisions (from brainstorming)

- **Approach: the toggle wraps the existing shared-boulder flow** (reuse `gym_problems` + claim + crew/points); not a rewrite of the Crew subsystem.
- **Public offers to join a matching boulder first**, then create-new — i.e. the existing `GymProblemMatcher` match→join/create→claim logic, triggered by the toggle.
- **The "Find this boulder's crew" card button is removed.** Its match/create logic moves into the Public-save flow; its "On a shared boulder · View the crew" claimed-state link relocates onto the card.
- **Edit is in scope:** the toggle is on both the add and edit forms (publish a private problem later, or unpublish).
- **"Public" is derived** from being linked to a shared boulder (`problems.gym_problem_id` set) — no new column.

## Scope

**In scope:**
- A Visibility toggle in `ProblemForm` (indoor only), default Private; the chosen value flows to the submit handler.
- A reusable boulder match-or-create **sheet** (extracted from `GymProblemMatcher`) the Public-save flow opens for a just-saved problem.
- Save-flow wiring in `SessionDetailPage` (add) and the edit sheet: Public → run the flow + claim; Public→Private → unclaim.
- Removing the "Find this boulder's crew" button; relocating the "On a shared boulder · View the crew" indicator onto the problem card.

**Out of scope (YAGNI):**
- Any new DB column / migration (visibility is derived from `gym_problem_id`).
- The crew-page beta *feed* (still the deferred follow-on).
- Archiving/cleanup of a boulder when its creator unpublishes (boulder stays for others).
- Bulk publish; publishing outdoor/no-gym problems.

## Design

### Visibility state model

"Public" ≡ `problems.gym_problem_id` is set (linked to a shared boulder, whether joined or created). "Private" ≡ `gym_problem_id` null. No schema change. The toggle's job is to drive whether the problem gets linked to a boulder.

### `ProblemForm` — the toggle

- A segmented control **🔒 Private | 🌐 Public**, default **Private**, rendered only when the problem is **Indoor** (Public requires a gym; hidden for outdoor/no-gym).
- The form's submit payload gains a transient `makePublic: boolean` (NOT a DB field) alongside the existing values. On edit, the toggle initializes from whether `existing.gym_problem_id` is set.
- ProblemForm does not itself create boulders — it only reports `makePublic`; the parent orchestrates the boulder flow after the problem is saved.

### Boulder match-or-create sheet (extracted from `GymProblemMatcher`)

Extract the current matcher's sheet body into a reusable `BoulderLinkSheet` (or equivalent) with props `{ problem: Pick<Problem,'id'|'gym'|'color'|'name'|'image_url'|'beta_video_url'>, onDone: () => void, onClose: () => void }`:
- Queries matches via `useMatchingGymProblems({ gym, color })` (active, gym+color).
- Lists matches as "Is it one of these?" → tap joins (`useClaimGymProblem({ problemId, gymProblemId })`).
- A "No, it's new — create it" action → `useCreateGymProblem` (carrying `image_url` + `beta_video_url`) then claim.
- If the problem has no color (can't match) → the sheet shows only "create it".
- On join/create success → `onDone()`.

This is the existing matcher logic relocated so it can be opened programmatically after a Public save (not only from a card button).

### Save-flow wiring (`SessionDetailPage` + edit sheet)

- **Add (Public):** `handleAddProblem` creates the problem (existing `useAddProblem`); if `makePublic`, instead of closing, open `BoulderLinkSheet` for the created problem. The sheet's `onDone` closes everything + toast "Published".
- **Add (Private):** unchanged (save + close).
- **Edit (Private→Public):** on save, if now `makePublic` and the problem isn't already linked, open `BoulderLinkSheet` for it.
- **Edit (Public→Private):** if toggled off and currently linked, call `useClaimGymProblem({ problemId, gymProblemId: null })` to unclaim (boulder remains). Toast "Made private".
- **Edit (no visibility change):** unchanged.

### Card changes

- **Remove** the `GymProblemMatcher` "Find this boulder's crew" button from the problem card.
- **Relocate** the claimed-state indicator: when `problem.gym_problem_id` is set, the card shows a small **"🌐 On a shared boulder · View the crew"** link to `/gym-problems/{gym_problem_id}` (the path to members, points, and beta). This is the public indicator.

### Error handling

- Public save but boulder link fails (create/claim error) → the problem is still saved; toast notes the publish step failed; the problem stays private (not linked). User can retry via edit.
- Public toggled on an outdoor/no-gym problem → not possible (toggle hidden).
- Unpublish when not actually linked → no-op.

### Testing

- **Unit (Vitest):** any pure mapping extracted (e.g. a `problem → match criteria` or `problem → create-boulder args` helper) gets tests; `gymProblemMatches`/`isActiveBoulder` are already tested and reused.
- **Verification (per repo convention):** the toggle, the extracted sheet, save-flow wiring, and card changes via `npx tsc -b` + `npm run lint` (baseline 17, 0 new) + `npm run build`. Manual: log a Public indoor problem → join/create flow → it appears in From-gym and on the crew page; edit a private problem to Public; edit a public one to Private (unclaims); confirm the old "Find this boulder's crew" button is gone and "View the crew" still reachable.

## Open questions for implementation

- **Extraction vs in-place reuse:** whether to fully extract a new `BoulderLinkSheet` component or refactor `GymProblemMatcher` into (sheet + thin card-indicator) — decide at plan time; the goal is one match/create implementation reused by both the publish flow and (if kept) any matcher entry.
- **Toggle styling/placement** in the form (top vs near submit) — a polish detail; default to a clear segmented control near the top of the indoor fields.
