# Instagram-style Redesign — Foundation + Home Feed + Boulder Page Design

**Date:** 2026-06-26
**Status:** Draft for review
**Umbrella:** "Make getStrong feel like Instagram, focused on learning, sharing knowledge, and friendly digs." This is **sub-project 1+2** of that umbrella (foundation + the two hero screens). Profile, Sessions, and Explore reskins are later sub-projects (each its own spec).

## Summary

Reshape getStrong around a social-learning loop: the thing you open, react to, and earn credit for is **beta** (how a move actually goes), with **banter** riding on top. We keep the data model and the sage/khaki identity and adopt Instagram's bones — a stories row, a vertical feed, a tab/sidebar shell — but the hero object is the *beta*, not the tick.

This spec covers three things, built foundation-first:
1. **Foundation** — a restructured app shell (slim mobile tabs + stories row; sidebar + crew/banter rail on web) and a small set of reused primitives (feed card, beta card, chips, dig/reaction bar, crew-title badge).
2. **Home feed** — replaces the dashboard with a vertical activity feed of beta/sends/digs from the people you follow and the crews you're in.
3. **Boulder page** — reskins the crew page (`/gym-problems/:id`) into the place learning + digs happen: a **beta thread ranked by "✓ worked for N"**, the crew with playful titles, and a `+ dig`/reaction bar.

The visual reference is the approved mockup (Direction A feed + the "beta is the hero" boulder page).

## Decisions (chosen — flag any you'd change at review)

- **Beta is a first-class object on shared boulders.** Today beta exists only on *challenges* (`challenge_betas` + `beta_helpful`). We add a parallel, boulder-scoped beta thread rather than overloading the per-problem comment thread. Comments stay for chatter; beta is structured knowledge.
- **"Worked for N" is a real action.** A "this beta worked for me" button (one per user per beta, idempotent) drives ranking AND awards the beta's author reputation (reuse the existing `beta_points` ledger, reason `helpful`). This is what makes knowledge rank itself.
- **Dig = a real action, not a buried comment.** Extend reactions to shared boulders (`gym_problem_reactions`, mirroring `problem_reactions`) with a quick emoji bar surfaced as `+ dig`.
- **Crew titles are derived, not stored.** *Flash 👑, Grinder 🪨 (most attempts before a send), First send, Sandbagger* are computed from the `problems` already linked to a boulder. No schema.
- **Feed source = follows + crews.** Aggregate recent events (new boulder, send, beta added, beta worked, dig) via one SECURITY DEFINER RPC. No client-side fan-out.
- **Shell: 5 mobile tabs + stories; web sidebar.** Home · Explore · ＋ · Crews · Profile. Sessions, Analysis, and Help move into a secondary menu (sidebar on web, "＋"/Profile overflow on mobile) — they are not part of the social loop.
- **Migrations are applied manually in the Supabase dashboard** (per project workflow); every deploy gates on the migration being applied first.

## Scope

**In scope (this sub-project):**
- App shell restructure: mobile tab bar (5) + stories strip on Home; web two-rail layout (left nav, center feed/page, right crew/banter rail). Reuse the existing `AppBar`/`BottomNav` files, restructured.
- Design primitives (components reused across the app): `FeedCard`, `BetaCard`, `Chip` (grade/colour/gym), `ReactionDigBar`, `CrewTitleBadge`, `StoryRing`.
- Home feed page + its feed RPC/hook.
- Boulder page reskin + boulder beta thread (+ "worked for N") + boulder reactions/digs + crew titles + a teaching-credit line.
- New data model below (tables + RPCs + RLS).

**Out of scope (later sub-projects / YAGNI now):**
- Profile reskin + teaching-reputation page + tongue-in-cheek badges (sub-project 3).
- Sessions / Session-detail / New-session reskin (sub-project 4).
- Explore grid as a tab, Challenges/Analysis/Help/Login polish (sub-project 5).
- Callout/nemesis tagging (a follow-on; the data — notifications — exists, but it's not required for the loop).
- Video upload/hosting changes — beta clips reuse the existing external-video-URL mechanism (Instagram/YouTube links), no new storage.
- Realtime feed; the feed refetches on focus/pull, like the rest of the app.

## Design

### A. App shell

**Mobile.** A slim bottom tab bar of five: **Home, Explore, ＋ (log), Crews, Profile** — the climbing-relevant secondary items (Sessions, Analysis, Help) move to a small overflow reachable from Profile. Home gains a horizontally-scrolling **stories strip** of your gyms and crews (tap → that crew/gym's active boulders). The top `AppBar` keeps notifications + contextual back, restyled.

**Web (≥ `lg`).** A persistent **left sidebar** (logo + the same nav, expanded with the secondary items) and, on feed/boulder pages, a **right rail** for crew/banter and suggestions — matching the desktop reference. Center column holds the feed/page at a readable max-width.

**Primitives** (in `src/components/`, styled with Tailwind + the existing `sage`/`khaki` tokens):
- `StoryRing` — gradient ring + avatar + label.
- `Chip` — grade / colour-dot / gym pill, the look already used on boulder tiles.
- `FeedCard` — author row, media (photo or external-video play tile), `ReactionDigBar`, caption; whole card links to its boulder.
- `BetaCard` — optional clip thumb, the tip text, author + "✓ worked for N", a "worked for me" toggle, a points chip; a `best` variant for the top-ranked beta.
- `ReactionDigBar` — like + comment/beta + `+ dig` (emoji picker) + save; reads/writes reactions.
- `CrewTitleBadge` — small labelled badge (Flash 👑 / Grinder 🪨 / First send / Sandbagger).

### B. Home feed

Replaces `DashboardPage` as `/dashboard` (route unchanged). Layout: stories strip, then a vertical list of `FeedCard`s newest-first, infinite/paged. Each card is one feed event:

- `beta_added` — "X shared beta on «Boulder»" → tip preview + media.
- `beta_worked` — "X's beta worked for Y on «Boulder»".
- `send` — "X sent «Boulder» (grade)".
- `boulder_new` — "X put up «Boulder» at «Gym»".
- `dig` — surfaced inline in a card's caption (not its own card), e.g. "hk: 14 tries? 😂".

Tapping a card → the boulder page. Empty state nudges following a gym/crew.

**Data:** a SECURITY DEFINER RPC `get_crew_feed(p_limit int, p_before timestamptz)` returns a unified row set (`event_type`, `actor`, `gym_problem_id`, `boulder` summary, `beta` snippet, `created_at`, counts) drawn from `gym_problems`, `problems` (sends), `boulder_beta`, `boulder_beta_worked`, and `gym_problem_reactions`, scoped to boulders in gyms/crews the caller follows or has logged in. Hook: `useCrewFeed()` (react-query infinite query). The exact row contract is finalized in the implementation plan.

### C. Boulder page (reskin of `CrewPage` / `/gym-problems/:id`)

Matches the approved mockup:
- **Hero**: boulder photo, name, grade chip, colour dot, gym, send-rate ("9/14 sent").
- **Tabs**: **Beta · Crew · Banter** (counts).
- **Beta tab**: `BetaCard` list **sorted by worked-for count desc, then recency**; the top card gets the `best` highlight. Each card: tip text, optional clip, author, "✓ worked for N", a **worked-for-me toggle**, points chip. A composer ("Share beta or call someone out…") posts a new beta or a banter line.
- **Crew tab**: the derived crew (people who logged this boulder) with `CrewTitleBadge`s; existing crew/leaderboard data.
- **Banter tab**: the reaction/dig stream + comments (reuse `ProblemCommentThread` styling), with the emoji `ReactionDigBar`.
- A small **teaching-credit** line on each beta author ("helped N climbers") sourced from `beta_points`.

### D. New data model (manual migrations)

Next migration numbers after 051. RLS on all; writes that award points go through SECURITY DEFINER functions (consistent with `beta_points`).

1. **`boulder_beta`** — `id uuid pk`, `gym_problem_id uuid not null references gym_problems(id) on delete cascade`, `user_id uuid not null references auth.users on delete cascade`, `body text`, `video_url text`, `created_at timestamptz default now()`. RLS: select for authenticated; insert/update/delete by owner. (At least one of `body`/`video_url` required — check constraint.)
2. **`boulder_beta_worked`** — `beta_id uuid references boulder_beta(id) on delete cascade`, `user_id uuid references auth.users on delete cascade`, `created_at`, **primary key (beta_id, user_id)** (idempotent one-per-user). RLS: select authenticated; insert/delete own row.
   - A SECURITY DEFINER `mark_beta_worked(p_beta_id)` / `unmark_beta_worked(p_beta_id)` inserts/deletes the row AND, on first insert, awards the beta's author a `beta_points` row (reason `helpful`, the boulder's gym + current cycle_month), idempotently (no double award if re-marked). This unifies "worked for N" with teaching reputation.
3. **`gym_problem_reactions`** — mirrors `problem_reactions`: `gym_problem_id`, `user_id`, `emoji text`, `created_at`, unique `(gym_problem_id, user_id, emoji)`. RLS: select authenticated; insert/delete own.
4. **`get_crew_feed(p_limit, p_before)`** — SECURITY DEFINER, returns the unified feed rows described in B.

Types added to `src/types`: `BoulderBeta`, `FeedEvent` (+ `FeedEventType` union), `CrewTitle`. Hooks: `useBoulderBetas(gymProblemId)`, `useMarkBetaWorked()/useUnmarkBetaWorked()`, `useGymProblemReactions()`, `useCrewFeed()`.

### E. Crew titles (derived)

A pure helper `crewTitles(problemsOnBoulder): Map<userId, CrewTitle[]>`:
- **Flash 👑** — sent in 1 attempt.
- **Grinder 🪨** — most attempts before their send (highest `attempts` among senders).
- **First send** — earliest `created_at` among `sent` problems.
- **Sandbagger** — the boulder's `first_logger` when the community grade trends easier than their logged grade (heuristic; refined in the plan).

Unit-tested (pure), per repo convention.

## Error handling

- Feed RPC failure → feed shows a retry state; the shell still renders.
- "Worked for me" double-tap / offline → idempotent (PK guard); optimistic toggle reconciles on settle; author points never double-award.
- Posting empty beta (no text and no clip) → blocked by the check constraint and a client guard with an inline message.
- A boulder with no beta yet → "Be the first to crack it — share your beta" empty state.
- Reactions/digs follow the existing optimistic add/remove pattern from `problem_reactions`.

## Testing

- **Unit (Vitest):** `crewTitles` (Flash/Grinder/First-send/tie cases); any pure feed-row → view-model mapping; the beta sort comparator (worked-for desc, recency tiebreak). These are the only new pure-logic units (repo convention: only pure utils are unit-tested).
- **Migration faithfulness:** reviewer diffs the new SECURITY DEFINER functions against the patterns in `046_beta_points.sql` (no SQL test harness; the award path must be idempotent and SECURITY DEFINER).
- **Verification (per repo convention):** shell, primitives, pages, hooks via `npx tsc -b` + `npm run lint` (baseline 17, 0 new) + `npm run build`. Manual QA: feed populates from a followed crew; posting beta appears and is rankable; "worked for me" bumps the count, highlights the top card, and credits the author once; a dig shows on the card; crew titles render; web sidebar/rail layout holds at `lg`.

## Build decomposition (becomes separate implementation plans)

Foundation-first, each independently shippable:
1. **Data model** — migrations 1–4 + types + hooks (no UI). Gates on applying migrations.
2. **Shell + primitives** — restructured `AppBar`/`BottomNav`, web sidebar/rail, `Chip`/`StoryRing`/`ReactionDigBar`/`FeedCard`/`BetaCard`/`CrewTitleBadge`.
3. **Boulder page** — reskin `CrewPage` onto the beta thread + worked-for + reactions + crew titles.
4. **Home feed** — replace `DashboardPage` with the feed using `useCrewFeed`.

## Open questions for implementation

- **Feed scoping precision** — "gyms/crews you follow or have logged in" vs strictly people you follow. Default to the broader (gym+crew) scope; tighten if it's noisy.
- **Sandbagger heuristic** — needs a concrete community-grade comparison; finalize the threshold in the plan (or drop it for v1 if data is thin).
- **Secondary nav placement on mobile** — Sessions/Analysis/Help under Profile vs a "More" sheet; pick in the shell plan.
