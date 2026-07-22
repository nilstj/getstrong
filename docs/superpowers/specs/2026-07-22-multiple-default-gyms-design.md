# Multiple Default Gyms + Gym Selection at Signup

**Date:** 2026-07-22
**Status:** Approved design, pending implementation plan

## Problem

A user can only have one home gym today (`profiles.default_gym`, a single nullable
text string), and new users are never asked about gyms during registration — they
sign up with email/password only and first encounter gyms when creating a session or
editing their profile. We want users to be able to have **several default gyms**, and
we want **choosing or creating a default gym to be part of registration**.

## Current architecture (as-is)

- **Gyms are free-text strings, not entities.** There is no `gyms` table. A "gym" is a
  `text` value on `sessions.location`, `problems.gym`, and `gym_problems.gym`. A gym
  "exists" the moment a user types its name.
- **Popular gyms** are surfaced by the `gym_suggestions()` `SECURITY DEFINER` RPC
  (`supabase/migrations/050_gym_suggestions.sql`), which returns distinct trimmed gym
  names + usage counts unioned from `sessions.location` and `problems.gym`. TS type
  `GymSuggestion { name; uses }`.
- **Default gym** is `profiles.default_gym text` (nullable), added in migration 050.
  TS: `Profile.default_gym: string | null` (`src/hooks/useProfile.ts`). Whitelisted for
  update in `useUpdateProfile`. Edited on `ProfilePage` via a `GymInput` labeled
  "Default Gym". Consumed to prefill:
  - `NewSessionPage` copies `profile.default_gym` into the session `location` if empty.
  - `ProblemForm` receives `defaultGym` (from `session.location`) as the default `gym`.
- **Signup** (`src/pages/LoginPage.tsx`) collects only email/password (or Google OAuth).
  The profile row is auto-created by the `handle_new_user()` DB trigger
  (`002_profiles_follows.sql`) with `default_gym` left NULL. There is **no onboarding
  flow**.
- **Gym picker** is `src/components/GymInput.tsx`: a free-text typeahead over existing
  names (from `useGymSuggestions()` + `filterGymSuggestions()`) that also accepts
  arbitrary new text — this is how new gyms are born.

## Design decisions

Confirmed with the user during brainstorming:

1. **Keep gyms as free-text strings.** No first-class `gyms` table, no curated/featured
   gym admin, no per-gym metadata. "Creating a gym" = typing a new name, exactly as
   today. Popular gyms come from the existing `gym_suggestions()` RPC.
2. **Multiple defaults per user**, stored as an **ordered list**. Index 0 is the
   primary/prefill gym.
3. **Gym selection happens at a first-login onboarding gate**, not on the signup form —
   this works cleanly with email confirmation and Google OAuth (it runs post-auth).
4. **Primary = first in list.** Reordering changes the primary. No separate primary
   column.

## Solution

### 1. Data model (Supabase migration)

- Replace `profiles.default_gym text` with `profiles.default_gyms text[] not null
  default '{}'`.
- Backfill: for each existing row with a non-null/non-empty `default_gym`, set
  `default_gyms = ARRAY[default_gym]`; otherwise leave `'{}'`.
- Drop the old `default_gym` column after backfill.
- The array is ordered; element 0 is the primary gym used for prefills.
- No new tables. `sessions.location`, `problems.gym`, `gym_problems.gym`, and
  `gym_suggestions()` are unchanged.

> Per the project's migration workflow: the migration file is authored in the repo, but
> the user applies it manually in the Supabase dashboard before deploying code that
> depends on it.

### 2. First-login onboarding gate

- **`OnboardingGate`** — a wrapper around the protected routes (composed with
  `AuthProvider` / `ProtectedRoute`). It reads the current profile; if `default_gyms`
  is empty, it redirects to `/onboarding` and blocks the rest of the app until the user
  finishes. Users who already have gyms pass straight through.
- **`OnboardingPage`** (`/onboarding`):
  - Shows popular gyms from `gym_suggestions()` as selectable chips.
  - Provides a `GymInput` to search existing gyms or type a brand-new one (creating it).
  - Selected gyms render as an ordered, removable list; the first is labeled/treated as
    Primary.
  - "Continue" is enabled once **≥1 gym** is selected; it writes `default_gyms` to the
    profile via `useUpdateProfile`, then routes into the app.
  - Runs identically for email/password and Google OAuth users (post-auth).

### 3. Profile page — manage multiple gyms

- Replace the single "Default Gym" `GymInput` on `ProfilePage` with a multi-gym editor:
  the same ordered list + add-via-`GymInput` + remove, with the first entry labeled
  "Primary". Reordering (or removing the first) changes the primary. Commits to
  `default_gyms` via `useUpdateProfile`.

### 4. Consumer updates (prefill)

- `useProfile` `Profile` type: `default_gym: string | null` → `default_gyms: string[]`.
- `useUpdateProfile` whitelist: `default_gym` → `default_gyms`.
- `NewSessionPage` prefill: use `default_gyms[0]` (guard empty array) instead of
  `default_gym`.
- `ProblemForm` / `SessionDetailPage` `defaultGym`: derive from `default_gyms[0]` where
  it previously used `default_gym` (note the primary path there is still
  `session.location`; only the profile-derived default changes).

### 5. Shared helper

- A small pure helper to derive the primary gym and normalize the list (trim, dedupe,
  drop empties, preserve order). This is the unit-tested piece.

## Testing

- Unit-test the pure list/primary helper (trim, dedupe, empty handling, primary =
  first). Per repo norms only pure utils are tested; the onboarding gate, onboarding
  page, and profile editor are verified manually.
- Build gotcha: `noUnusedLocals` fails the build — no unused imports/vars left behind
  when swapping `default_gym` → `default_gyms`.

## Out of scope

- A first-class `gyms` table or gym IDs.
- Curated/featured/admin-managed gyms.
- Per-gym metadata (location, address, logo).
- Migrating `sessions.location` / `problems.gym` off free-text strings.
