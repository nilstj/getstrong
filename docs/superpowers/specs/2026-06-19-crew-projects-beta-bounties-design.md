# Crew Projects & Beta Bounties Design

**Date:** 2026-06-19  
**Status:** Approved

## Summary

Turn fragmented, private problem logging into a public, social, time-boxed experience. A **Gym Problem** is a shared boulder that climbers *crowd-create* (no setter involvement). Everyone working it forms a **Crew** with live states. Posting a beta request stakes a **Beta Bounty**; winning bounties and helpful marks climb a **monthly per-gym leaderboard** that resets each set cycle (~1 month).

The goal is to fix the core adoption problem: **the public path currently has no payoff that private tracking lacks.** Every reward in this design is structurally unavailable to a private logger — you cannot see your Crew, the live beta getting sends, or the leaderboard from a private log.

## The payoff loop

> Log publicly → join the Crew → see who's on your boulder *right now* and the beta getting sends (payoff B) → ask publicly with a staked bounty → answering earns bounties + leaderboard rank before the set is stripped (payoff C) → that rank is visible, so others log publicly too.

## Scope

**In scope (this spec):**
- Shared `gym_problems` entity, crowd-created bottom-up
- Claiming a personal `problems` row onto a shared boulder
- Crew membership with `projecting | sent | flashed` states
- Crew page: countdown, crew list, aggregate stats, beta feed
- Beta Bounties staked on help requests, awarded on send
- Monthly per-gym leaderboard, resets each set cycle
- 1-month lifecycle: estimated expiry + community "stripped" action → archive

**Deferred (YAGNI — not this spec):**
- Photo-based automatic boulder matching (start with manual color+angle suggestions)
- Cross-gym features / global leaderboards
- Anti-gaming machinery beyond a simple monthly point budget

## Design

### Data model

All changes are additive. The existing per-user `problems` model is preserved unchanged; a problem can now optionally *claim* onto a shared boulder.

**New `gym_problems`** — the shared boulder identity the schema currently lacks:

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `gym` | text not null | matches `problems.gym` |
| `wall_angle` | text | reuses board-angle vocabulary from migration 014 |
| `color` | text | |
| `community_grade` | text | crowd consensus; nullable until enough data |
| `name` | text | community-given (first logger names it) |
| `image_url` | text | canonical photo from first logger |
| `created_by` | uuid → auth.users | the "first logger" |
| `set_at` | date not null default today | when the boulder went up (approx) |
| `expires_at` | date not null | defaults to `set_at + 30 days` |
| `status` | text check (`active`,`archived`) default `active` | |
| `created_at` | timestamptz default now() | |

**Change to `problems`:** add nullable `gym_problem_id uuid references gym_problems(id) on delete set null`. A personal log row is otherwise untouched; `null` means "not claimed onto a shared boulder" (current behavior).

**New `gym_problem_members`** — the Crew:

| column | type | notes |
|---|---|---|
| `gym_problem_id` | uuid → gym_problems | |
| `user_id` | uuid → auth.users | |
| `state` | text check (`projecting`,`sent`,`flashed`) default `projecting` | |
| `joined_at` | timestamptz default now() | |
| pk | (`gym_problem_id`, `user_id`) | one membership per user per boulder |

**New `beta_points`** — ledger for the leaderboard (C):

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid → auth.users | |
| `gym` | text not null | leaderboard is per-gym |
| `gym_problem_id` | uuid → gym_problems | provenance |
| `points` | integer not null | |
| `reason` | text check (`bounty_won`,`helpful`,`first_logger`) | |
| `cycle_month` | text not null | e.g. `2026-06`; leaderboard groups by this |
| `created_at` | timestamptz default now() | |

**Reused as-is:** `help_requests` / `help_responses` (add nullable `gym_problem_id` so a request can be scoped to a shared boulder instead of a private problem), `follows`, `notifications` (migration 037), `profiles`.

### Crowd-create & matching (the no-setter mechanic)

When a user logs a problem with `gym` + `color` + `wall_angle` + photo, query active `gym_problems` in that gym matching color + angle and present them with photos:

> *"Is this the one? 🟦 Blue overhang — 6 climbers on it, 9 days left."*

- **Tap to join** → set `problems.gym_problem_id`, upsert a `gym_problem_members` row (`state = projecting`).
- **"No, it's new"** → create a `gym_problems` row, set `created_by` = current user, award `first_logger` points. The photo lets the next climber recognize it.

Matching is a suggestion, never automatic — the climber confirms. This is how shared boulders appear without setters.

### Crew page (payoff B)

Route: `/gym-problems/:id`. Shows:
- Canonical photo + community grade + **countdown to `expires_at`**
- **Crew list** with live states (projecting / sent / **flashed**)
- Aggregate stats: total attempts, send rate, distribution
- **Beta feed**: `help_requests` + `help_responses` scoped to this `gym_problem_id` (reuses the entire existing beta UI)

Notifications (via existing `notifications` table) drive re-engagement:
- *"Anna sent the Blue overhang — her beta is posted"* (to crewmates when a member flips to `sent`/`flashed`)
- *"3 days left on your project"* (to `projecting` members as `expires_at` nears)

### Beta Bounties + leaderboard (payoff C)

- Each user has a **monthly point budget** (a simple constant, e.g. 100 pts/cycle) to stake. Track staked vs. available by summing the current `cycle_month`'s stakes.
- Posting a beta request on a `gym_problem` **stakes a bounty** (visible amount). The request is public (`help_requests.visibility = 'global'`).
- When the asker flips their membership to `sent`, they **award** the bounty to the `help_response` that helped — extends the existing "mark helpful" action. This writes a `beta_points` row (`reason = bounty_won`) to the responder.
- `helpful` marks (existing badge mechanic) also write small `beta_points` rows.
- **Leaderboard:** `SELECT user_id, SUM(points) FROM beta_points WHERE gym = ? AND cycle_month = ? GROUP BY user_id ORDER BY 2 DESC`. Resets implicitly each `cycle_month`. Surfaced as a per-gym view.

### Lifecycle (the 1-month rhythm)

- `expires_at` defaults to `set_at + 30 days`.
- **Effective status is derived from `expires_at` at read time** (`active` while `now() < expires_at`, else `archived`) — this is the source of truth, so no job is required for correctness. A Vercel cron (the project already has `api/` + `vercel.json`) runs nightly only to fire the *"X days left"* / archive notifications, which can't be lazy. A community **"this got stripped"** action archives early by setting `expires_at = today`.
- On archive: crew projects close, the cycle's leaderboard for affected points locks (points already in the ledger by `cycle_month` are immutable), and the boulder moves to a history view.
- Personal `problems` rows (including sends) are preserved forever, independent of the shared boulder's archival.

### Security (RLS)

- `gym_problems`: readable by all authenticated users; insert by any authenticated user (they become `created_by`); update limited to safe community fields (`community_grade`, `expires_at`, `status` via the strip action) — follow the SECURITY DEFINER RPC pattern already used in `create_help_request` (migration 042) to avoid the `auth.uid()` RLS evaluation issue seen there.
- `gym_problem_members`: a user manages only their own membership row.
- `beta_points`: insert only via SECURITY DEFINER RPCs (award/helpful/first_logger) so points can't be self-minted; readable by all (leaderboard).
- `help_requests` scoping to `gym_problem_id` reuses `can_see_help_request`.

### Build order

1. `gym_problems` + `problems.gym_problem_id` + claim/create flow + matching suggestions
2. `gym_problem_members` + Crew page + notifications (payoff B is usable here)
3. `beta_points` + bounty staking/award + monthly leaderboard (payoff C)
4. Lifecycle archival job + history view

## Open questions for implementation

- Exact monthly point budget and bounty min/max — pick sane constants, tune later.
- Whether `wall_angle` should reference the existing board-angle enum (migration 014) or stay free text — lean toward reusing the existing vocabulary.
