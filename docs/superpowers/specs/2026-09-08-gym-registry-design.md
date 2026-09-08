# Gym registry: a canonical gym list users can still add to

**Date:** 2026-09-08
**Status:** Approved, not yet planned

## How this serves learning

A misspelled gym name forks the gym. Because the gym is a free-text string used
as the de facto join key, `Klatreverket` and `Klatreverkeet` become two
buildings: two shared-boulder lists, two beta-points leaderboards, two grading
configs, two award rounds. Beta stops moving between climbers standing next to
each other. Fixing gym identity is therefore not cosmetics — it is the
difference between one gym's knowledge pooling and being split in half by a
typo.

## Problem

Gym names are free text, entered wherever a climber types one. There is no
`gyms` table. The string is written to twelve columns and read as an identity
key by leaderboards, grading config, crew standings and award rounds.

Four surfaces mint new gym strings today, none of them constrained:

- `src/components/AddGymBoulderSheet.tsx:147` — publishing a shared boulder
- `src/components/DefaultGymsEditor.tsx:32` — default gyms (onboarding + profile)
- `src/pages/NewSessionPage.tsx:78` — session location
- `src/pages/GymGradingPage.tsx:65-73` — a raw `<datalist>`, the loosest of the four

`GymInput` offers suggestions from `gym_suggestions()` (migration 050) but never
requires one, and that RPC derives its list from the already-polluted data — so
junk keeps recommending itself.

Consequences in the wild: capitalisation and whitespace variants, genuine
misspellings, joke names, and no way to remove or combine any of them.

## Approach chosen

A `gyms` registry table owns **which names exist**. The gym **string stays the
join key** — what gets written into `problems.gym` and friends is always
`gyms.label`, so every existing query, RPC, leaderboard and util keeps working
untouched.

Rejected alternatives:

- **Full entity migration to `gym_id` (uuid) everywhere.** The correct
  long-term model, but it rewrites twelve columns, `profiles.default_gyms
  text[]` → `uuid[]`, a dozen `SECURITY DEFINER` functions (046, 047, 051, 053,
  063, 066, 071, 079) and most of `src/utils/`. Migrations here are applied by
  hand; a long chain across live points-awarding functions is where this gets
  genuinely risky. The registry is a strict step toward this — the table and its
  IDs already exist afterwards.
- **Normalisation only, no table.** Cheapest, but no `verified` flag, no merge,
  nowhere to put the city, no way to remove a joke name, and the suggestion list
  stays derived from polluted data.

New gyms are **instant, provisional and mergeable**: a climber standing in an
unlisted gym is never blocked, and pollution is repairable rather than
permanent.

## Data model

```sql
create table gyms (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,              -- 'Klatreverket'
  city          text,                       -- 'Torshov'
  label         text not null,              -- 'Klatreverket, Torshov'  ← written everywhere
  canonical_key text not null,              -- 'klatreverket|torshov'   ← folded, for uniqueness
  verified      boolean not null default false,
  created_by    uuid references auth.users(id) on delete set null,
  merged_into   uuid references gyms(id),
  created_at    timestamptz not null default now()
);
create unique index gyms_canonical_key_idx on gyms (canonical_key);
create unique index gyms_label_idx on gyms (label);
```

`label` is the load-bearing column: it is the string every other table stores.
Unique on `label` is what makes two Klatreverket branches distinct rows rather
than a collision. `label` = `name` when `city` is null, else `name || ', ' || city`.

`label` and `canonical_key` are **plain columns maintained by the RPCs**, not
generated columns. Generated would be drift-proof, but the fold rules will need
tuning and altering a generated column means dropping it and its unique index —
a hand-applied migration best not written twice. The RPCs are the only writer,
so drift is unreachable.

`merged_into` keeps a losing row alive so a stale client's string still
resolves, while `where merged_into is null` drops it out of the picker.

### Writes

RLS on. `select` for authenticated. **No insert/update/delete policy at all** —
the same shape as `gym_gradings` in migration 071. This is a deliberate
no-policy table, not one of the accidental UPDATE-policy gaps: four
`SECURITY DEFINER` functions own every write.

| Function | Gate | Does |
|---|---|---|
| `create_gym(name, city)` | authenticated | Folds input; **idempotent** — on an existing `canonical_key` returns the existing row instead of erroring |
| `rename_gym(gym_id, name, city)` | `is_admin` | Updates name/city/label/canonical_key, rewrites the old label everywhere |
| `merge_gyms(from_id, to_id)` | `is_admin` | Sets `merged_into`, rewrites the label everywhere |
| `set_gym_verified(gym_id, verified)` | `is_admin` | Toggles the flag |

`create_gym` being idempotent rather than erroring means two climbers adding the
same gym from opposite ends of the bouldering room converge, instead of one of
them seeing a failure.

**Creating a gym pays no `beta_points`.** Stated explicitly in the migration
comment — a points path with no guard is the farmable-reward pattern, and "type
a name, get points" would be the easiest farm in the app.

Admin-only for rename/merge/verify, **not setters**. Setters can edit gradings
(071), which writes one table; a merge rewrites twelve columns. Different blast
radius, different gate.

### Columns holding a gym string

A rewrite that misses one silently orphans data. Full list, verified by grep:

| Column | Migration | Note |
|---|---|---|
| `sessions.location` | 001 | |
| `problems.gym` | 011 | |
| `gym_problems.gym` | 044 | |
| `beta_points.gym` | 046 | |
| `profiles.default_gyms` | 060 | `text[]`, element-wise rewrite |
| `crews.home_gym` | 062 | |
| `crew_plans.gym` | 066 | |
| `gym_gradings.gym` | 071 | **`unique (gym, color_name)` — conflict possible** |
| `crew_award_rounds.gym` | 079 | **`unique (crew_id, round_date, gym)` — conflict possible** |
| `session_groups.gym` | 080 | |
| `wall_announcements.location` | 027 | live via `WallAnnouncementSheet` |
| `shared_projects.gym` | 018 | hook exists, no consumer; rewrite anyway |

`api/coach.ts` reads `location` only as a display string, so the Vercel edge
functions are unaffected.

**Conflict rule on the two unique constraints: the target's row wins, the
source's row is deleted.** If both spellings had grading colours configured, the
gym merged *into* keeps its config. The merge confirm says so before acting.

The rewrite is a single function, `rewrite_gym_label(from_label, to_label)`,
used by `merge_gyms`, `rename_gym` **and** the backfill — the backfill is a
merge, just many at once.

## Pure utils

`src/utils/gymRegistry.ts`, TDD'd with Vitest. Per the repo's testing
constraint, this is where the logic worth testing goes — the picker and admin
tool are verified by build plus a manual pass.

**`canonicalGymKey(name, city)`** — trim, lowercase, replace punctuation with a
space, collapse whitespace, fold Nordic and common diacritics (`æ→ae`, `ø→o`,
`å→a`, `ä→a`, `ö→o`, `ü→u`, `é/è/ê→e`, `á→a`), join as `name|city`. So
`"Klatreverket "`, `"klatreverket"` and `"KLATREVERKET"` are one gym, and
`"Klatreverket - Torshov"` matches `"Klatreverket Torshov"`.

It does **not** strip noise words like "klatresenter" — that could collide two
genuinely different gyms. Duplicate *detection* is where the fuzziness lives.

**`nearDuplicateGyms(name, city, registry)`** — deliberately fuzzier than the
uniqueness key, because catching `"Klatreverkeet"` is the whole point. Returns
up to 5 ranked candidates:

- Damerau-Levenshtein on the folded name, threshold scaled to length: ≤1 for
  names up to 5 chars, ≤2 up to 10 chars, ≤3 beyond. Transposition matters —
  `"Kaltreverket"` is one keystroke away.
- Containment either way, catching `"Klatreverket"` vs `"Klatreverket Torshov"`.
- Same folded name with a different city ranks top, labelled as a possible branch.

**`isPlausibleGymName(name)`** — 2–60 chars, contains a letter, no run of four
identical characters. **This is a junk filter, not a joke filter.** No regex
detects "Dave's Mum's Garage", and the design does not pretend otherwise: joke
names are handled by `verified`, rename/merge, and `created_by` recording who
typed it.

## Climber-facing flow

`GymPicker` replaces `GymInput` at all four surfaces, **emitting a `label`
string** so every call site keeps its existing contract.

1. Search filters the registry — verified first, then by uses.
2. No match gives a footer row: `Can't find "Klatreverkt"? Add it`. Free text
   stops being a silent side effect of typing and becomes a deliberate act.
3. Tapping it opens name + city, prefilled from what was typed.
4. On submit `nearDuplicateGyms` runs. Any hits → *"Is it one of these?"* with
   the candidates and a **"No — mine's new"** escape. Only then does
   `create_gym` fire.
5. The gym works immediately, marked with a small **new** chip.

`gym_suggestions()` changes from "distinct strings scraped from `sessions` and
`problems`" to "registry rows plus usage counts, excluding `merged_into is not
null`". It stays `SECURITY DEFINER` for the reason migration 050 gives —
sessions aren't globally readable.

**The new return shape is strictly additive:** `name` and `uses` stay, and
`id`/`city`/`label`/`verified` are appended. This is what makes the
apply-before-deploy gate safe — the currently deployed client keeps working in
the window between applying the migration and shipping the new picker.

### Judgment call to flag

This constrains `sessions.location` to registry gyms too. That is right while
outdoor bouldering is out of scope, but it means a session cannot be logged
anywhere that isn't a listed gym — a door to reopen alongside outdoor.

## Backfill (same migration)

1. Union the strings from all twelve columns, group by `canonical_key`, insert
   one `gyms` row per key. Display name = **the most-used spelling**; the crowd
   is a decent speller in aggregate.
2. **Don't guess the name/city split.** The whole legacy string goes into
   `name`, `city` stays null. A wrong split is worse than no split, and admin
   rename fixes it deliberately.
3. For every key with more than one distinct raw spelling, call
   `rewrite_gym_label(variant, winner)`. Existing typos genuinely collapse —
   today's forked leaderboards actually merge, rather than the fork being hidden
   behind a nicer picker.
4. Backfilled rows have `created_by = null`, so the **new** chip keys off
   `created_by is not null`. Day one doesn't paint every gym as unverified, and
   no typo gets auto-blessed as verified either.

## Admin

A `GymsAdmin` section on `src/pages/AdminPage.tsx`, alongside the existing
`CoachPromptAdmin` / `ProblemTagsAdmin` / `ChallengeTagsAdmin`. Same shape, no
new route.

Rows sort **climber-created and unverified first**, then by uses. Three actions:

- **Verify** — `set_gym_verified`; the "this is a real gym" blessing that floats
  it to the top of the picker.
- **Rename** — fix a spelling, or split `"Klatreverket Torshov"` into name +
  city properly.
- **Merge into…** — pick a target, see the damage, confirm.

The merge confirm shows real numbers from a read-only
`gym_merge_impact(from_label)`: *"rewrites 412 problems, 38 boulders, 6
sessions, 2 crews, 1 grading config (will be discarded)"*. Merging is the one
irreversible action here, so it states what it destroys before doing it. In a
`BottomSheet`, kept a **sibling** of the heading rather than nested inside it.

**Reachability:** the admin tool is a lean-back desktop surface, which is
acceptable because every climber-facing part lives on the phone surfaces —
picker in the session flow, the publish sheet, onboarding, profile. The thing
that has to work in a gym does.

## Rollout

Migration `092_gym_registry.sql`. **Release gate: apply before deploying the
client**, which calls `create_gym` and reads `gyms`.

Order inside the migration matters: table → fold function → `rewrite_gym_label`
→ backfill → *then* replace `gym_suggestions`. Replacing the suggestion function
before the backfill would show an empty picker to everyone in that window.

Per current notes the unapplied stack is 084, 085, 089, 090, 091. **Confirm that
in the Supabase dashboard before applying 092.** 092's backfill only depends on
tables from applied migrations (071, 079, 080), so it does not need the pending
ones, but it must not jump the queue.

plpgsql bodies are not validated at `CREATE`, so a clean apply proves nothing.
The migration ends with a `do` block that actually calls `canonical_gym_key`,
`create_gym` (rolled back), `gym_merge_impact` and `rewrite_gym_label`, so a
typo in a body raises at apply time rather than under the first climber's thumb.

## Verification

- **Vitest** on `canonicalGymKey`, `nearDuplicateGyms`, `isPlausibleGymName`,
  TDD'd before the picker exists.
- **`npm run build`** — deleting `GymInput` will strand imports, and
  `noUnusedLocals` turns that into a failed Vercel deploy.
- **`npm run lint`** with the baseline **measured at implementation start**, not
  quoted from memory. New work adds zero.
- **Manual phone-viewport pass:** log a session at an existing gym; create a new
  gym through the add flow; deliberately type a near-miss to hit the
  interstitial; publish a shared boulder; edit default gyms in both onboarding
  and profile; merge two gyms in admin and confirm the two leaderboards became
  one.

## Out of scope

- Geolocation / "gyms near you" and coordinate-pinned gyms.
- Migrating the join key to `gym_id` (uuid). The registry is the step toward it.
- Gym pages, gym profiles, gym-level admin roles.
- Any automated joke-name detection beyond the junk filter.
