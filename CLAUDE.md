# MoreSends

## What this app is for

MoreSends helps climbers **learn climbing movement** — together, and with some
mischief. The unit of value is *beta*: the knowledge of how a boulder actually
goes. Logging a send is how you get credit for participating; sharing what
worked is the point.

The guiding line, in the owner's words: **make the beta the hero, not the tick.**

Three qualities the app is trying to have, in priority order when they conflict:

1. **Learning** — a climber leaves knowing something about movement they didn't.
2. **Social** — knowledge moves between people, and there's a reason to talk to
   the climber next to you. Friendly digs count as social.
3. **Innovative** — it does something no other climbing logbook does. Given two
   designs of equal quality, prefer the one that doesn't already exist elsewhere.

"Fun" isn't a fourth item; it's a constraint on all three. If a feature is
correct and worthy and nobody would enjoy using it, it's not done.

## Applying this to a feature

**Before writing a spec, state in one line how the feature serves learning.** If
that line is hard to write, the feature probably needs reshaping, not building
faster.

Useful tests, in rough order of how often they've settled a real decision here:

- **Teaching over ticking.** Does this reward sharing knowledge, or just
  attendance and volume? Beta points sit *above* grade score on the leaderboards
  page for exactly this reason.
- **Does knowledge move?** A feature where one climber's insight reaches another
  beats one where a climber only sees their own numbers.
- **Is it reachable where climbing happens?** This is a phone-in-a-gym app.
  A feature only reachable on desktop is, in practice, not shipped. (This bit us
  once: leaderboards moved to an Analysis subpage that had no mobile entry
  point, which would have deleted them from phones rather than relocating them.)
- **Would a climber tell someone about it?** The innovative bar.
- **What does it cost the boulder page and the feed?** Those two surfaces are the
  app's hero screens. Adding to them needs a better reason than "it fits".

### Off-vision patterns, concretely

These have been rejected or reshaped here before — recognise them early:

- **Vanity metrics.** Numbers that measure showing up rather than contributing.
  A streak of gym visits is vanity; a streak of weeks you posted beta is not.
- **Gym-wide stats parked on a boulder.** Context that isn't about the thing
  you're looking at. Two leaderboards lived on the shared boulder page for
  months for no better reason than that the boulder supplied the gym name.
- **Solo-only surfaces.** A screen only ever useful to its owner, with no path
  for knowledge to leave it.
- **Farmable rewards.** Any points path without a guard invites gaming, and the
  leaderboard stops meaning anything. Every award in `beta_points` is guarded;
  keep it that way, and prefer a database constraint over a check-then-write.
- **Scope sprawl.** Outdoor bouldering, exercise logging and strength tests were
  all deliberately cut from v1, and problem names and training boards were
  removed after the fact. Narrower has been the right call every time so far.

### When a request pulls against the vision

Say so in a sentence or two — name the tension and the nearest on-vision
alternative — then **build what was asked, in full.** Don't block, don't
water it down, don't quietly substitute your own idea. The owner decides; the
job is to make sure they're deciding knowingly.

## Vocabulary

Getting these wrong makes user-facing copy misleading:

- **Problem** — a climb *you* logged in a session. Private to your log.
- **Gym problem / shared boulder** — a boulder published to a gym, that others
  can find, claim and add beta to. Routes live at `/gym-problems/:id`.
- **Log** vs **create** — "logging" a problem is the private per-session action.
  "Creating"/"publishing" a shared boulder is the public one. They pay different
  points; don't use "log" for both in UI copy.
- **Beta** — a first-class object on a shared boulder (tip and/or video), not a
  comment. It can be marked "worked for me" by others.
- **Sendtrain** — the user-facing name for a crew on a boulder. The route is
  still `/crews` and internal names still say `Crew*`; don't rename them.
- **Digs** — friendly emoji ribbing. Deliberate, not decoration.

## Practical conventions

**Build:** `npm run build` = `tsc -b && vite build`. `noUnusedLocals` and
`noUnusedParameters` are ON — an unused local is a build-failing error, which
fails the Vercel deploy. `tsconfig` covers `src` only: **`api/` (Vercel edge
functions) is checked separately by Vercel**, so a green local build does not
guarantee a green deploy.

**Lint:** `npm run lint` has a baseline of pre-existing problems. New work must
add **zero**. **Measure the baseline yourself before starting** — it drifts as
files change, so a number quoted in a doc or a memory is not evidence.

**Tests:** Vitest, and only **pure functions in `src/utils/`** are tested. There
is no `@testing-library/react`; hooks, components and pages are verified by
`npm run build` plus a manual pass. This is a deliberate constraint, not a gap to
fill — so when logic is worth testing, extract it into a pure util and TDD it
there.

**Migrations:** applied **by hand in the Supabase dashboard**, never by tooling
from here. A branch containing a migration therefore has a **release gate**:
state it explicitly, and apply the migration before deploying the client that
needs it. Points-awarding functions are `SECURITY DEFINER` because
`beta_points` has no insert policy — points must never be mintable by a client.

**Deploys:** pushing `main` auto-deploys via Vercel. A push is a release.

**Docs:** designs live in `docs/superpowers/specs/`, implementation plans in
`docs/superpowers/plans/`, both dated.

## Patterns

React Query with array query keys; hooks named `useX`; no FK embed between
`problems` and `profiles` — fetch profiles in a second `.in('id', ids)` query;
`sage`/`khaki` Tailwind palettes; `lucide-react` icons; `react-hot-toast` for
feedback; `BottomSheet` for modals. Note that a `BottomSheet` rendered inside a
heading inherits its font weight and is invalid markup — keep it a sibling.
