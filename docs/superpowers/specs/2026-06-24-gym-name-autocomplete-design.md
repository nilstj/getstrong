# Gym Name Autocomplete + Default Gym Design

**Date:** 2026-06-24
**Status:** Approved

## Summary

Gym names are entered as free text in the session **Location** field, so the same gym gets logged several slightly-different ways. This adds (1) a **typeahead** on that field that suggests previously-registered gym names across all users so people converge on one spelling, and (2) a **default gym** in personal settings that pre-fills the Location field when starting a new session. Suggestions never lock the user in — any new name can still be typed.

## Decisions (from brainstorming)

- **Suggestion source: global.** Suggest gym names drawn from *all users'* data, to drive cross-user consistency (not just the typist's own past entries).
- **Typeahead UI: a custom filtered dropdown** (consistent on mobile), not a native `<datalist>`.
- **Scope: the session Location field + a settings default gym.** Problems are untouched — they already inherit the session's location (an earlier feature), so a consistent Location keeps problem gyms consistent too. The per-problem `ProblemForm` gym field is intentionally out of scope.
- **Free typeahead, not strict pick:** the field is always a normal text input; suggestions assist but never restrict.

## Scope

**In scope:**
- `profiles.default_gym text` column + a `gym_suggestions()` SECURITY DEFINER function.
- `useGymSuggestions()` hook; `default_gym` added to `Profile` and `useUpdateProfile`.
- A pure `filterGymSuggestions(list, query)` helper (unit-tested).
- A reusable `GymInput` component (text input + filtered suggestion dropdown).
- Wiring: New Session Location field uses `GymInput` and pre-fills from `default_gym`; ProfilePage settings gets a "Default gym" `GymInput`.

**Out of scope (YAGNI):**
- A normalized `gyms` table / FK references (free-text + suggestions is enough).
- Typeahead on the per-problem `ProblemForm` gym field.
- Editing/merging/renaming existing gym names; admin curation.
- Per-keystroke server queries (the full suggestion list is fetched once and filtered client-side).

## Design

### Backend (migration)

Additive migration (next number in `supabase/migrations/`):

```sql
alter table profiles add column if not exists default_gym text;
```

A read-only suggestions function. Sessions are **not** globally readable (RLS allows only own + followers' shared-wisdom sessions), so a client query can't see all gyms — hence a `SECURITY DEFINER` function that exposes only the gym-name strings and their counts:

```sql
create or replace function public.gym_suggestions()
returns table (name text, uses bigint) as $$
  select g.name, count(*) as uses
  from (
    select trim(location) as name from public.sessions where coalesce(trim(location), '') <> ''
    union all
    select trim(gym)      as name from public.problems where coalesce(trim(gym), '') <> ''
  ) g
  group by g.name
  order by uses desc, g.name asc;
$$ language sql stable security definer;
```

It unions session locations and problem gyms (both trimmed, non-empty), groups by name, and orders most-used first. Exposed to authenticated users via the normal RPC path; returns only names + counts, never session/problem rows.

### Hooks / types

- **`useGymSuggestions()`** (`src/hooks/useGymSuggestions.ts`): `supabase.rpc('gym_suggestions')`, cached under `['gym_suggestions']`; returns `GymSuggestion[]` (`{ name: string; uses: number }`). On error, the consuming component treats it as an empty list (degrades to a plain input).
- **`Profile`** gains `default_gym: string | null`; **`useUpdateProfile`** accepts `default_gym` in its `Partial<Pick<...>>`.
- **`filterGymSuggestions(list: GymSuggestion[], query: string, limit = 8): string[]`** (`src/utils/gymSuggestions.ts`, pure, unit-tested): trims the query; case-insensitive substring match against `name`; preserves the popular-first order of `list`; returns up to `limit` names; an empty/whitespace query returns the top `limit` names (so focusing the field shows popular gyms).

### `GymInput` component

`src/components/GymInput.tsx` — a controlled input with a suggestion dropdown.

- Props: `{ value: string; onChange: (v: string) => void; placeholder?: string; id?: string }`.
- Calls `useGymSuggestions()` internally; computes visible matches with `filterGymSuggestions(suggestions, value)`.
- Shows the dropdown on focus and while typing when there are matches; hides on blur (with a small delay so a tap registers) and after a selection. Tapping a suggestion calls `onChange(name)` and closes the list.
- Always a free text field: typing a name not in the list is fine; the dropdown is purely assistive.
- Styling matches existing inputs (`w-full border rounded-lg px-3 py-2.5`, `sage-700` accents).

### Wiring

- **New Session** (`NewSessionPage`): the Location field becomes a `GymInput` bound through react-hook-form (`watch('location')` / `setValue('location', …)`), with its initial value set to the loaded `profile.default_gym ?? ''`. The field remains `required`.
- **Settings** (`ProfilePage`): add a "Default gym" row using `GymInput`; on change (debounced or on blur) call `useUpdateProfile({ default_gym })`. Clearing it to empty saves `null`.

### Error handling

- `gym_suggestions` RPC failure → `useGymSuggestions` returns `[]`; `GymInput` simply shows no dropdown and works as a plain input.
- No `default_gym` set → New Session Location starts blank (current behavior).
- Whitespace-only names are excluded server-side (the function's `coalesce(trim(...), '') <> ''`).

### Testing

- **Unit (Vitest):** `filterGymSuggestions` — substring/case-insensitivity, query trimming, popular-first order preserved, `limit` cap, empty-query returns top-N. This is the repo's only unit-tested layer.
- **Verification (no unit tests, per repo convention):** the migration applies cleanly (manual, dashboard) + a `select * from gym_suggestions() limit 5;` check; `GymInput`/hooks/wiring via `npx tsc -b` + `npm run lint` (baseline) + `npm run build`. Manual: type a partial gym on New Session and see matching suggestions; set a default gym in settings and confirm it pre-fills the next New Session.

## Open questions for implementation

- **Debounce vs on-blur save** for the settings default-gym field — pick on-blur (simpler, fewer writes); revisit if it feels laggy.
- **Suggestion list size:** `gym_suggestions()` is unbounded; if the gym set ever grows large, add a `limit` (e.g. 500) in the function. Not needed at current scale.
