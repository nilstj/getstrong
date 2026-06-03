# Exercise Template: Extended Fields Design

**Date:** 2026-06-03  
**Status:** Approved

## Overview

Extend exercise templates with optional metadata fields (video link, device, preset training values) that admins set once and users benefit from automatically — preset values auto-fill the exercise form, and empty optional fields are hidden from users entirely.

---

## Data Layer

### New columns on `exercise_templates`

| Column | Type | Notes |
|---|---|---|
| `video_url` | `text null` | URL to a demonstration video |
| `device` | `text null` | Free-text equipment name (e.g. "Beastmaker 2000", "Tension Block") |
| `preset_sets` | `integer null` | Default number of sets |
| `preset_reps` | `integer null` | Default reps per set (meaningful only when type = 'reps') |
| `preset_pause_seconds` | `integer null` | Default pause between reps, in seconds |
| `preset_rest_seconds` | `integer null` | Default rest between sets, in seconds |

### Migration

One new migration file adds all 6 columns as nullable with no defaults.

### TypeScript type (`src/types/index.ts`)

`ExerciseTemplate` gains all 6 fields as `string | null` or `number | null` as appropriate.

### Data hooks (`src/hooks/useExerciseTemplates.ts`)

`useCreateExerciseTemplate` and `useUpdateExerciseTemplate` pass through the new fields. No structural changes needed.

---

## Admin UI (`src/pages/ProfilePage.tsx` — `ExerciseLibraryAdmin`)

### Template list

The list view is unchanged — shows name, type, description with Edit/Delete buttons.

### Modal dialog (new)

Replaces the current inline edit form. One modal component handles both **create** and **edit** (distinguished by whether an existing template is passed in). Uses the existing dialog/sheet component already in the codebase.

**Field groups inside the modal:**

**Basic**
- Name — text input, required
- Type — Reps / Time radio buttons
- Description — text input, optional

**Media & Equipment**
- Video URL — text input, optional
- Device — text input, optional, free text

**Preset Training Values**
- Sets — number input, optional
- Reps — number input, optional, only shown when type = 'reps'
- Pause between reps (seconds) — number input, optional
- Rest between sets (seconds) — number input, optional

---

## User-Facing Display (`src/pages/SessionDetailPage.tsx` — `ExerciseSelector`)

Each template card in the exercise selector conditionally renders:

- **Device** — shown as a small tag/badge if non-null; hidden if null
- **Video link** — shown as a clickable link/icon if non-null; hidden if null  
- **Preset summary** — shown as a compact line (e.g. `3 sets × 5 reps · 10s pause · 60s rest`) if any preset value is non-null; hidden if all are null

### Auto-fill behaviour (`src/components/ExerciseForm.tsx`)

When a user picks a template that has preset values, the corresponding `ExerciseForm` fields are pre-populated:
- `sets` ← `preset_sets`
- `reps` ← `preset_reps`

Pause and rest are not currently fields on the user exercise form, so they are display-only for now. The user can override any auto-filled value before saving.

---

## Out of Scope

- Pause/rest fields on the user exercise log form (display only for now)
- Video preview/embed (link only)
- Predefined device dropdown (free text only)
- Any changes to the `exercises` table (user logs) — only templates are extended
