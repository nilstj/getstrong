# Session awards — GOAT, donkey, props and a session thread

**Date:** 2026-08-18
**Status:** design, approved from mockup
**Mockup:** https://claude.ai/code/artifact/755bc208-794e-4174-afc7-765b216621d3

## How this serves learning

Every award is attached to the movement it was won for — "showed the heel-toe on
the blue 6", "stole her toe swap" — so the recap is a list of things the crew
learned from each other, wearing a joke as a costume. Grades and attempt counts
never appear on these screens.

The honest caveat: **the donkey award rewards nothing but showing up badly.** It
is the app's first surface where a climber gains a place in a list without
contributing knowledge. It earns its place on the social and fun axes, and the
owner has approved it knowingly. It pays no points (see "No points", below),
which is what keeps it a joke rather than a metric.

## Two decisions taken without you — overrule on review

1. **A crew session is a derived round, not a new first-class session.** Sessions
   stay per-user. A round is keyed by `(crew_id, round_date, gym)` and its
   participants are the crew members who logged a `sessions` row at that gym on
   that date. No new logging step, and it works whether or not anyone used
   `crew_plans`.
2. **No `beta_points`, at all.** A 2-person crew trading GOAT votes every week
   is unguardable in principle — there is no way to tell a real verdict from a
   traded one. Rather than bolt a weak guard onto a farmable path, the award pays
   nothing: the reward is the recap and the ribbing. This also keeps the
   leaderboards measuring beta only.

## Screens

Four screens, all mobile-first and reachable from the crew page (`/crews/:crewId`).

### 1. Awards open — a card on the crew page

Sits directly under the crew header, above Upcoming sessions, while a round is
open. Once the results unlock it becomes a `See the verdict` link, and it leaves
the crew page seven days after the round date.

- Overlapping GOAT + donkey marks, headline, `Tue 18 Aug · 5 of you climbed`.
- Voter avatars, filled for those who voted, faded for those who have not, plus
  `3 of 5 voted` and `18h left`.
- Primary CTA `Cast your votes`; after you vote it becomes `Change my verdict`
  and the footnote switches to what unlocks the results.

### 2. Vote sheet — `BottomSheet`, title "Rate the session"

- **GOAT of the session** — helper copy "Who taught you the most. One vote." A
  row of 52px avatars; tapping one moves your vote. Selected shows a sage ring
  and a check.
- **Donkey of the session** — same control, khaki, helper "Worst excuse, worst
  beta, worst timing. Be fair."
- Scrolls into the props section (screen 3). Sticky footer: `Post my verdict`
  plus the unlock rule.

### 3. Props and comments — same sheet, scrolled

Awards collapse to a one-line summary strip with an Edit affordance. Then one
card per other participant:

- Eight toggleable tag chips: `🧠 Best beta`, `💪 Effort`, `📣 Powerscream`,
  `⚡ Flash`, `🎥 Beta vulture`, `🩹 Worst excuse`, `🧗 Silky feet`, `🪨 Grinder`.
- One free-text line on that climber. **Signed, not anonymous** — anonymous
  ribbing curdles in a five-person crew, and a signed dig is a conversation. The
  sheet says so: "Posted with your name — the crew sees who said it."

### 4. The verdict — `/crews/:crewId/awards/:roundId`

- GOAT card (sage) and donkey card (khaki): winner, `3/5`, voter avatars, the
  top-voted comment with attribution, and `ReactionDigBar` dig chips.
- Donkey card shows a repeat-offender streak (`3rd week 🏅`) — weeks in a row as
  donkey, not weeks of attendance.
- **The verdicts** — one row per participant with their tag tallies and the
  comments people wrote about them.
- **On the session** — a crew-visible thread on the round, same shape as
  `CrewBanter`.

## Data model

One migration, **079_session_awards.sql**. All tables RLS-on, and every write
goes through a `SECURITY DEFINER` RPC so the guards below cannot be bypassed by
a client. Read access splits in two:

- `crew_award_rounds`, `crew_award_participants` and `crew_award_messages` get a
  SELECT policy for crew members (`is_crew_member`) — progress and banter are
  never secret.
- `crew_award_votes`, `crew_award_tags` and `crew_award_notes` get **no SELECT
  policy at all**. They are readable only through `get_award_round` below, which
  is what makes the unlock gate real rather than cosmetic.

```
crew_award_rounds
  id uuid pk
  crew_id uuid -> crews on delete cascade
  round_date date not null
  gym text not null                         -- sessions.location is not null
  opened_by uuid -> auth.users on delete set null
  opened_at timestamptz not null default now()
  closes_at timestamptz not null            -- opened_at + 24h
  first_vote_at timestamptz                 -- freezes the participant snapshot
  unique (crew_id, round_date, gym)

crew_award_participants
  round_id uuid -> crew_award_rounds on delete cascade
  user_id uuid -> auth.users on delete cascade
  primary key (round_id, user_id)

crew_award_votes
  round_id uuid -> crew_award_rounds on delete cascade
  voter_id uuid -> auth.users on delete cascade
  kind text check (kind in ('goat','donkey'))
  subject_id uuid -> auth.users on delete cascade
  created_at timestamptz not null default now()
  primary key (round_id, voter_id, kind)              -- one vote each way
  check (kind = 'donkey' or voter_id <> subject_id)   -- no self-GOAT

crew_award_tags
  round_id, voter_id, subject_id, tag text
  primary key (round_id, voter_id, subject_id, tag)   -- one of each tag
  check (voter_id <> subject_id)

crew_award_notes
  round_id, voter_id, subject_id, body text check (length(trim(body)) > 0)
  created_at timestamptz
  primary key (round_id, voter_id, subject_id)        -- one line per climber
  check (voter_id <> subject_id)

crew_award_messages          -- the session-wide thread, open to the whole crew
  id uuid pk, round_id, user_id, body text, created_at
  -- readable and postable by any crew member, not just participants: someone
  -- who missed the session should still get to rib the people who went.
```

Every guard is a **primary key or a check constraint**, never a check-then-write.
Self-donkey is deliberately allowed; self-GOAT is not.

### RPCs

- `open_award_round(p_crew uuid, p_date date, p_gym text) returns uuid` —
  idempotent on the unique key. Snapshots participants from crew members with a
  `sessions` row at that gym on that date. Re-snapshots on every call **until
  `first_vote_at` is set**, so a late logger still gets counted but the
  denominator cannot shift mid-vote. **Raises if fewer than two participants** —
  this is a crew surface, and that is where the "no solo awards" rule in Out of
  scope is actually enforced.
- `cast_award_vote(p_round, p_kind, p_subject)` — upsert; rejects a voter or
  subject who is not a participant; stamps `first_vote_at` on the first vote.
  A participant **counts as having voted once they have a GOAT vote**; the donkey
  vote is optional, so abstaining from naming a donkey is allowed and does not
  hold the round hostage.
- `toggle_award_tag(p_round, p_subject, p_tag)`, `set_award_note(...)`,
  `post_award_message(...)` — same membership guards.
- `get_award_round(p_round)` — **the unlock gate.** Returns tallies, comments and
  attributions only when every participant has voted or `now() > closes_at`;
  before that it returns progress counts only. The raw vote tables have **no
  client SELECT policy** — results are only ever readable through this function,
  so an early peek is impossible rather than merely hidden in the UI.

## Pure utils to TDD

Only `src/utils/` is tested here, so the logic worth testing gets extracted:

- `awardTally(votes)` → `{ winners, counts }`. **A tie awards everyone tied** —
  a "split verdict" — rather than picking arbitrarily by timestamp.
- `awardsUnlocked({ participants, voters, closesAt, now })` → boolean. Mirrors
  the RPC gate so the client can render the right card without a round-trip;
  the RPC stays the authority.
- `tagTally(rows)` → per-subject tags sorted by count then label.
- `donkeyStreak(rounds, userId)` → consecutive weeks as donkey, counted in weeks
  of rounds, not weeks of attendance (same shape as `crewStreak`).

Hooks, sheets and pages are verified by `npm run build` plus a manual pass, per
the project's testing constraint.

## Release gate

Migration **079_session_awards.sql** is applied by hand in the Supabase
dashboard, and **must be applied before the client that reads it is deployed**.
Pushing `main` is a release, so: apply 079, then merge.

## Out of scope

- Points of any kind (see above).
- Cross-crew or gym-wide award leaderboards — gym-wide stats parked on a crew
  page is the pattern this app has already rejected twice.
- Reopening or editing a closed round; a round is final once unlocked.
- Awards on a solo session. This is a crew surface; two participants minimum.
