# Beta points: the real scheme, and an info popup explaining it

Date: 2026-07-27

## Problem

The leaderboards page shows a "Beta points" board with no explanation of how points
are earned, so the number is unreadable to anyone who wasn't there when it was
built. The obvious fix is an info popup — but writing one exposed that the intended
scheme and the implemented scheme disagree.

What the code awards today:

| reason | points | trigger |
|---|---|---|
| `first_logger` | 10 | `create_gym_problem`, regardless of whether a photo was attached |
| `helpful` | 5 | first "worked for me" mark on your beta (`mark_beta_worked`) |
| `bounty_won` | staked | a helpful response on a bounty request — **write-dead**, see below |

What the scheme is meant to be:

| points | earned by |
|---|---|
| 10 | logging a shared boulder **with a photo** |
| 5 | posting a beta |
| 5 | someone marking your beta "worked for me" |
| 1 | commenting on someone's beta, or marking someone's beta worked |

Two of those four award nothing today. This work closes the gap, then documents the
result in the popup.

## Decisions

| Decision | Choice |
|---|---|
| Order of work | Make the awards real first, then document them — a popup promising unpaid points is worse than no popup |
| Who earns the 1 point | The actor: whoever writes the comment or marks the beta |
| Farming guard, 1-pointers | One engagement point per (user, beta), and never on your own beta |
| Farming guard, beta posting | One `beta_posted` award per (user, gym problem) — extra betas on the same boulder pay 0 |
| Boulder logged without a photo | 0 points |
| Mechanism | `SECURITY DEFINER` triggers, because betas and comments are inserted directly by the client |
| Retroactivity | None. `beta_points` is append-only; existing rows stand and no backfill runs |
| Scope of "comment" | `boulder_beta_comments` (replies inside a beta thread). Emoji reactions pay nothing |

### Why triggers, not client code

`beta_points` has a select policy and deliberately no insert policy
(`046_beta_points.sql:25-26`) — every row is written by a `SECURITY DEFINER`
function so points cannot be self-minted. Betas and beta comments, however, are
inserted straight from the client (`useBoulderBeta.ts:180` and `:220`), so the
client has no way to award anything. Awards for those two actions therefore live in
`AFTER INSERT` triggers. The worked-mark case already runs through the
`mark_beta_worked` RPC, so its new engagement point goes in that function.

Consequence worth stating: **no client-side code changes are needed for the
points** at all. The entire scheme change is one migration.

### One engagement point per beta, not per action

A user who comments on a beta *and* marks it worked earns **1** engagement point,
not 2 — the guard is per (user, beta), whichever action lands first. This follows
the phrasing of the rule ("1 point for a comment or mark") and keeps the ledger
free of a `kind` discriminator. The author's separate 5-point `helpful` award is
unaffected: a first worked-mark by someone else still pays the author 5 and the
marker 1.

## Migration 074

`supabase/migrations/074_beta_points_scheme.sql`. Four parts.

**1. Widen the reason constraint.** `046` pins it to
`('bounty_won', 'helpful', 'first_logger')`. Drop and recreate including
`beta_posted` and `engagement`.

**2. Add `beta_id`.** `beta_points` can already point at a gym problem and a help
response; it needs to point at a beta for the per-beta engagement guard:

```sql
alter table beta_points
  add column if not exists beta_id uuid references boulder_beta(id) on delete set null;
```

**3. Gate `first_logger` on a photo.** Reproduce `068`'s 7-argument
`create_gym_problem` verbatim and wrap only the award:

```sql
if p_image_url is not null and length(trim(p_image_url)) > 0 then
  insert into public.beta_points (...) values (..., 10, 'first_logger', ...);
end if;
```

No photo means no row at all — not a zero-point row — so the ledger stays honest
about what was earned.

**4. Three award paths.**

- `AFTER INSERT ON boulder_beta` → 5 `beta_posted` to the author, skipped when the
  author already has a `beta_posted` row for that `gym_problem_id`.
- `AFTER INSERT ON boulder_beta_comments` → 1 `engagement` to the commenter,
  skipped when the beta is the commenter's own, and skipped when the commenter
  already has an `engagement` row for that `beta_id`.
- Inside `mark_beta_worked`, after the existing author award → 1 `engagement` to
  the marker, under the same two guards.

Both dedupe guards (`beta_posted` on `(user_id, gym_problem_id)`, `engagement` on
`(user_id, beta_id)`) are enforced by **unique partial indexes**
(`beta_points_beta_posted_uniq`, `beta_points_engagement_uniq`), with every award
insert carrying `on conflict do nothing` so a race that slips past the `exists`
pre-check hits the index instead of raising inside the caller's own insert. The
`exists` pre-checks stay for readability — the index is what actually prevents the
double-award.

Every award resolves `gym` from `gym_problems` via the beta's `gym_problem_id`, and
stamps `cycle_month` as `to_char((now() at time zone 'utc'), 'YYYY-MM')` — matching
every existing award and the UTC month arithmetic the leaderboards page relies on.

All three functions are `SECURITY DEFINER` with `set search_path = public, pg_temp`.
Existing RPCs in this project omit `search_path`; new ones should not repeat that.

### Dormant `bounty_won`

`award_helpful_response` fires on `help_responses.helpful` flipping true, and
nothing writes `help_responses` any more — the standalone `/help` feed was retired
and only `useBadges.ts:23` reads the table. The trigger stays in place untouched:
it is harmless, and old rows remain in the ledger. The popup does not list bounties,
because none can currently be won.

## The popup

An `Info` icon (lucide, `size={14}`) sits immediately after the "Beta points"
heading on `LeaderboardsPage`, as a button labelled "How beta points work". Tapping
it opens the existing `BottomSheet` (`open`/`onClose`/`title`/`children`) titled
**How beta points work**:

```
┌─ How beta points work ─────── × ─┐
│                                  │
│   10   creating a shared boulder │
│        with a photo              │
│        no photo, no points       │
│                                  │
│    5   posting a beta            │
│        once per boulder          │
│                                  │
│    5   someone marks your beta   │
│        "worked for me"           │
│        once per beta, ever       │
│                                  │
│    1   commenting on, or         │
│        marking, someone else's   │
│        beta                      │
│        once per beta, per person │
│                                  │
│  These rules apply from this     │
│  month on. Points are counted    │
│  per gym, per month, and once    │
│  earned they are never taken     │
│  away — if someone unmarks your  │
│  beta, you keep the points.      │
│  Emoji reactions don't earn      │
│  points.                         │
└──────────────────────────────────┘
```

Each row is the points figure in `text-lg font-bold text-sage-700` on the left and
the rule text on the right, with the qualifier in `text-[11px] text-gray-400`
beneath. "Creating" (not "logging") because in this app "logging" already names
the core problem-logging action, which pays nothing — these 10 points come from
publishing a *new* shared boulder. The two "once per beta" qualifiers are
deliberately distinguished: the author's 5-point award is once *ever* per beta no
matter how many people mark it (the `boulder_beta.awarded` guard, live since
`053`), while the engagement point is once *per person* per beta. The closing note
covers the properties a climber will otherwise discover by surprise: the board
resets each month per gym, unmarking a beta does not claw back the author's points
(`053`, by design), and — since nothing is backfilled and the month stepper can
page into months predating 074 — the rules are stated as applying "from this month
on" rather than as an absolute history.

Only the beta-points board gets an icon. Grade score is self-explanatory from the
gym's colour→points config and is out of scope here.

## Files

| File | Change |
|---|---|
| `supabase/migrations/074_beta_points_scheme.sql` | New. The whole scheme change. |
| `src/components/BetaPointsInfo.tsx` | New. The icon button plus its `BottomSheet`, owning its own `open` state so the page stays declarative. |
| `src/pages/LeaderboardsPage.tsx` | Render `<BetaPointsInfo />` in the "Beta points" heading. |

No hook, type, or query changes: the ledger's shape is unchanged from the client's
point of view, and `useGymLeaderboard` already sums whatever rows exist.

## Verification

- `npm run build`, `npm run lint` (baseline 16 problems), `npx vitest run` (137 tests).
- No new pure utils, so no new tests. The award logic is SQL and is verified by
  applying the migration and exercising the four paths by hand.
- Manual, after applying 074 in Supabase: log a boulder with a photo (+10) and
  without (+0); post two betas on one boulder (+5 total); comment on someone
  else's beta (+1) and again on the same beta (+0); comment on your own (+0); mark
  someone's beta worked (+1 marker, +5 author) and toggle it (no further points).

## Release gate

**Migration 074 must be applied in the Supabase dashboard before this ships.** It
drops and recreates `create_gym_problem`, so an unapplied 074 with the new client
deployed is not a risk in itself — the client passes the same 7 arguments — but the
popup would describe awards the database is not yet paying. Apply 074 first, then
deploy.
