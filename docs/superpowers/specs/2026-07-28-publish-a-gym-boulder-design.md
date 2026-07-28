# Publishing a gym boulder without a session

Date: 2026-07-28

## Problem

A shared boulder is the substrate beta attaches to, and beta is what this app is
for. Yet publishing one is the hardest thing in the app to reach.

`create_gym_problem` has exactly one call site — `BoulderLinkSheet.tsx:28` — and
that sheet is rendered from exactly one place, `SessionDetailPage.tsx:443`. So the
only path is:

1. `+` in the bottom bar → `/sessions/new`
2. Save a session
3. FAB "Add problem" (`SessionDetailPage.tsx:354`)
4. Fill the form **and** flip the make-public toggle
5. Save, which fires `setLinkProblem(created)` (`SessionDetailPage.tsx:94-97`)
6. In the sheet, pick a match or "No, it's new — create it"

A boulder can only be born as a by-product of logging a private problem inside a
session. Worse:

- `/gym-problems` — the page named "Gym problems" — has **no** create affordance.
  It is 11 lines: heading, subtitle, list.
- The bottom-bar `+`, the app's one global create button, never leads to a boulder.

The standing-at-the-wall case is the one that matters: a new boulder is set, you
have your phone out, and the shortest path to sharing it runs through creating a
session for yourself.

### A second, latent problem

`community_grade` is **read in six places and written in none**. No migration sets
it, no client writes it; `044_gym_problems.sql:12` calls it "crowd consensus; null
until enough data" and the data never arrives. That is why the story strip renders
`label={b.community_grade ?? ''}` — a blank caption on essentially every boulder —
and why `CrewsSection`, `GymBoulderPicker` and `CreateBattleSheet` all show a
boulder with no grade. `create_gym_problem` does not accept one.

The publisher standing at the wall is the best-placed person in the system to say
what grade it is. This work lets them.

## Decisions

| Decision | Choice |
|---|---|
| Publish = join? | **Just publish.** `created_by` records you and you earn `first_logger`; you are not on the sendtrain until you log a send. No session, no `Problem` row, no claim. |
| Entry point | **FAB on `/gym-problems`**, matching the FAB already on Session detail and Challenges. The bottom-bar `+` keeps going straight to `/sessions/new` — session logging is the most frequent action and should not lose its single tap. |
| Grade | The publisher may state it. Migration 075 extends `create_gym_problem` with `p_community_grade`. |
| Grade scale | The dropdown offers the publisher's own `grade_preference` scale, and the string is stored verbatim — the same thing `problems.grade_value` already does. |
| Fields | Gym, photo, gym-grading colour, hold colour, grade. Nothing else. |
| Wall angle | Out of scope. `gym_problems.wall_angle` exists but the current create path already passes `null`, and nothing displays it prominently. |

### Why "just publish" is the right default

Claiming requires a `Problem` row, which requires a session — the exact coupling
this change exists to remove. It would also put you on the sendtrain for a boulder
you may not have touched. Publishing a wall on set day and climbing it next week is
a normal sequence, and the schema already supports it: `created_by` is set by the
RPC, and the sendtrain is derived from claims.

Consequence to accept: a freshly published boulder has an empty sendtrain, and the
publisher appears nowhere on it. That is honest.

## Migration 075

`supabase/migrations/075_gym_problem_community_grade.sql`.

`create_gym_problem` currently takes 7 arguments (`068_gym_problem_hold_color.sql`).
Adding a parameter does **not** replace a function — it creates a second signature,
and a 7-argument call would then be ambiguous. So: drop the 7-arg version and
create an 8-arg version whose new parameter defaults to null.

```sql
drop function if exists public.create_gym_problem(text, text, text, text, text, text, text);

create or replace function public.create_gym_problem(
  p_gym             text,
  p_color           text,
  p_wall_angle      text,
  p_name            text,
  p_image_url       text,
  p_beta_video_url  text default null,
  p_hold_color      text default null,
  p_community_grade text default null
) returns gym_problems as $$ … $$;
```

The body reproduces 074's version — including the photo gate on the `first_logger`
award and `set search_path = public, pg_temp` — and adds `community_grade` to the
insert, trimmed, with a blank string stored as null.

**This ordering is safe in the direction that matters.** Because the new parameter
has a default, a client that sends only the old 7 named arguments still resolves to
the new function. So 075 can be applied while the current client is live, and the
new client deployed afterwards. The reverse is not safe: deploying the client first
means it sends 8 named arguments to a 7-argument function, and publishing errors.

## The sheet

`src/components/AddGymBoulderSheet.tsx`, opened by a FAB on `/gym-problems`, using
the existing `BottomSheet`, titled **Add a gym boulder**. Fields, in this order —
gym and photo first, matching the compact problem form:

```
┌─ Add a gym boulder ────────── × ─┐
│                                  │
│  Gym    [ Boulders Oslo    ▾ ]   │  ← default_gyms chips when you have them
│                                  │
│  Photo  [ 📷 Add photo ]          │
│         10 points with a photo    │
│                                  │
│  Grade  [ Select grade      ▾ ]   │  ← your own scale (Font or V)
│                                  │
│  Gym    ▬ ▬ ▬ ▬ ▬                 │  ← this gym's grading colours
│  grade                            │
│                                  │
│  Hold   ⬤ ⬤ ⬤ ⬤ ⬤ ⬤              │
│                                  │
│        [    Publish to the gym  ] │
└──────────────────────────────────┘
```

Controls are lifted from `ProblemForm` so they behave identically: the photo input
uploads to the `problem-images` bucket at `${user.id}/${Date.now()}.${ext}` and
takes `getPublicUrl`; the gym-grade row renders `TapeGraphic` buttons from
`useGymGradings(gym)` and shows "No grading colours set for {gym} yet." when a gym
has none; the hold row renders `HoldGraphic` buttons over `HOLD_COLORS`; the grade
`<select>` offers `FONT_GRADES_ORDERED` or `V_GRADES` per `grade_preference`, with a
blank "Select grade" option.

**The photo line is not decoration.** Since migration 074, a boulder published
without a photo earns nothing, and until now no screen said so. One line of helper
text under the photo control closes that gap.

Gym defaults to the first of `profile.default_gyms`; with several, they render as
selectable chips like the leaderboards page. Only the gym is required — `Publish`
stays disabled until one is set, since `create_gym_problem` raises without it.

On success: close the sheet, `toast.success('Published to the gym')`, and the new
boulder appears in the list and in everyone's Latest strip via the existing
`['gym_problems']` invalidation that `useCreateGymProblem` already performs.

## Files

| File | Change |
|---|---|
| `supabase/migrations/075_gym_problem_community_grade.sql` | New. Drops the 7-arg `create_gym_problem`, creates the 8-arg version, writes `community_grade`. |
| `src/hooks/useGymProblems.ts` | `useCreateGymProblem` gains `community_grade: string \| null` and passes `p_community_grade`. |
| `src/components/AddGymBoulderSheet.tsx` | New. The form described above. Owns its own field state and the upload. |
| `src/pages/CrewsPage.tsx` | Add the FAB and the sheet. |
| `src/components/BoulderLinkSheet.tsx` | Pass `community_grade: null` in its `create.mutate` call, so the existing publish-from-a-session path keeps compiling and behaving exactly as it does today. |

No change to `LatestProblemsStrip`, `CrewsSection`, `GymBoulderPicker` or
`CreateBattleSheet`: they already read `community_grade` and will simply start
showing it.

## Out of scope

- Editing a boulder's grade after publishing, and any crowd-consensus aggregation.
  The publisher's grade is the value; a real consensus mechanism is a separate
  piece of work.

  **Decided deliberately, with the consequence understood** (2026-07-28): both
  `useDiscoverBoulders.ts:96` and `CrewPage.tsx:362` prefer `community_grade` over
  the derived consensus, and there is no edit RPC — so one publisher's tap is the
  boulder's grade for everyone, permanently. Recovery is `delete_gym_problem`,
  which is creator-only, only possible before anyone else has logged the boulder,
  and pays another `first_logger` 10 on republish. Accepted for v1. If a mis-tapped
  grade becomes a real complaint, the cheapest fix is to prefer the derived
  consensus once enough climbers have logged their own grade, at those two lines —
  not an edit UI.
- Wall angle, setter name and setter intention at creation. All settable on the
  boulder page already.
- Any change to the bottom-bar `+`.
- Normalising `community_grade` across grade scales. A Font user publishes "6C" and
  a V user publishes "V5", and both display verbatim — the same mixed-scale
  behaviour `problems.grade_value` already has. The fix, if it ever matters, is a
  second column like `problems` carries, not a change here.

## Verification

- `npm run build`, `npm run lint` (measure the baseline first), `npx vitest run`.
- No new pure utils, so no new tests. The sheet is verified by build and a manual
  pass; the RPC by exercising it after applying 075.
- Manual, after applying 075: publish from `/gym-problems` with a photo and a grade
  → the boulder appears in the list and the Latest strip **with its grade as the
  caption**, and the ledger shows `first_logger` 10. Publish without a photo → no
  points. Publish with no grade → caption blank, as before. Then publish from the
  old session path and confirm it still works and still stores no grade.

## Release gate

**Apply 075 before deploying the client.** The new client sends
`p_community_grade`, which a 7-argument function rejects — publishing would break
until the migration lands. Applying 075 first is safe for the currently deployed
client, because the new parameter defaults to null.
