# Shared sessions — one boulder list, your own status, awards in place

**Date:** 2026-08-19
**Status:** design, approved from mockup (boulder model revised to a shared list)
**Mockup:** https://claude.ai/code/artifact/a5a361c0-1c43-4870-bc5c-b2e48086b528
**Amends:** `docs/superpowers/specs/2026-08-18-session-awards-design.md` (the awards
round is re-anchored; the crew-page entry card and the standalone verdict route are
deleted)

## How this serves learning

Two people climbing the same boulder on the same evening currently keep two
unconnected records of it. A shared session gives them one list of what was on the
wall, with each climber's own status against it — so "Ida sent the 6C that three of
us are still projecting" is visible without anyone reporting it. The boulder, not
the tick, is the shared object, and it carries its grade, colour, photo and its link
to the published gym boulder with whatever beta lives there. The session then
becomes the thing the awards judge, so the beta and the ribbing sit on the evening
they belong to.

There is a second, unglamorous reason: **it removes a whole class of bug.** The
awards feature currently infers "we climbed together" by matching crew members who
independently typed the same gym string on the same date. That inference is why the
feature showed nothing in production on its first day. A joined session gives the
round an explicit anchor and the matching disappears.

## Decisions taken — overrule on review

1. **Invite-only. Nothing enters your log until you accept.** The mockup also showed
   an "unconfirmed" session sitting greyed in the sessions list, excluded from stats.
   Dropping that: it would mean auditing every streak, frequency-chart and analysis
   query to exclude unconfirmed rows, a wide blast radius where one missed query
   silently corrupts a number. An invite costs one tap and touches nothing.
2. **One shared boulder list, per-person status. Nothing is ever copied.** An
   earlier draft copied the boulders into each person's log as projects on accept.
   The owner chose the stricter model: the group owns the list, your entries attach
   to it, and a boulder you never touched costs you no row at all.
3. **The list is an explicit table, not a derived union.** Deriving it from everyone's
   `problems` rows would need `(grade, colour, hold colour)` signature matching to
   dedupe boulders nobody linked to a published gym boulder — the same guessing that
   made the awards fail. An explicit list is unambiguous.
4. **"Project" is not a new column.** `problems.sent = false` already is a project,
   so every unsent problem in the app reads as one retroactively. What is new is
   `attempts = 0`, meaning "on my list, not tried yet".

## The model

A **session group** is one real-world session that several personal sessions point
at. Your `sessions` row stays yours. The group holds the date, the gym, who is in
it, the boulder list, and the awards.

```
session_groups
  id uuid pk
  date date not null
  gym text not null
  crew_id uuid null references crews(id) on delete set null   -- if it started in a crew
  created_by uuid references auth.users(id) on delete set null
  created_at timestamptz not null default now()

sessions
  + group_id uuid null references session_groups(id) on delete set null

-- The group asked you in.
session_group_invites
  group_id uuid references session_groups(id) on delete cascade
  invited_user uuid references auth.users(id) on delete cascade
  invited_by uuid references auth.users(id) on delete set null
  created_at timestamptz not null default now()
  primary key (group_id, invited_user)

-- You asked to come in. Keyed on the SESSION, not the group, because a session
-- in the feed may have no group yet and a pending request must not create one —
-- creating a group stamps group_id onto the owner's session row, which is the
-- owner's call, not the requester's.
session_join_requests
  session_id uuid references sessions(id) on delete cascade
  user_id uuid references auth.users(id) on delete cascade
  created_at timestamptz not null default now()
  primary key (session_id, user_id)

-- The shared list: what was on the wall that evening. One row per boulder.
session_group_boulders
  id uuid pk
  group_id uuid not null references session_groups(id) on delete cascade
  gym_problem_id uuid null references gym_problems(id) on delete set null
  grade_system text not null
  grade_value text
  grade_value_font text
  grade_value_vscale text
  color text
  hold_color text
  image_url text
  beta_video_url text
  added_by uuid references auth.users(id) on delete set null
  created_at timestamptz not null default now()

-- One list entry per published boulder; two people cannot create rival rows for it.
unique index on session_group_boulders (group_id, gym_problem_id)
  where gym_problem_id is not null

problems
  + group_boulder_id uuid null references session_group_boulders(id) on delete set null
```

A group is created lazily: the first time someone adds a person to their session,
that session gets a `group_id`. A solo session never gets one, and
`group_boulder_id` stays null on every problem in it — **nothing about logging a
solo session changes.**

`session_partners` stays as it is. It means "I climbed with these people" and is
still right for a friend who does not use the app; the group is the stronger
relationship layered above it.

## What your status is

For each boulder on the group's list, your state is exactly one of:

| Your state | In the database | In your stats |
|---|---|---|
| Not logged | no `problems` row | absent |
| Project | `problems` row, `sent = false` | counted as a problem |
| Sent | `problems` row, `sent = true` | counted as a send |

You move between them by logging: adding a try creates the row at `attempts = 1`,
marking it a project without trying creates it at `attempts = 0`, marking it sent
sets `sent`. Removing your entry deletes your row and leaves the list alone.

**`attempts = 0` needs a client change.** `ProblemForm` floors the attempts stepper
at 1 (`Math.max(1, attempts - 1)`) and defaults `existing?.attempts ?? 1`, so
opening a zero-try project would silently credit a try nobody took. Relax the floor
to 0 and render 0 as "no tries logged".

## Screens

### 1. Accept if true

An invite appears at the top of `/sessions` and as a notification: **"Marius added
you to a session"**, with the date, gym and who has already accepted. Two actions:
**Accept** and **Wasn't me**.

`accept_session_group(p_group)` creates a `sessions` row for the caller with
`group_id`, and `date`/`location` copied from the group. Nothing else is copied —
not duration, not intensity, not the goal, not the notes; those are personal. Then
it deletes the invite. **No problems are created.** You land on a session whose
boulder list is already populated and whose entries are all yours to fill in.

### 1b. Joining from the friends feed

The feed already lists sessions: `mergeHomeFeed` merges friends' sessions with beta
events and deliberately drops `send` events because they would "double-report the
session cards". A friend's session card gains a join affordance, and which path it
takes depends on the relationship:

- **You share a crew with the owner** — join directly. You were plausibly there, and
  a climbing log is self-reported anyway. `join_session(p_session)` checks the shared
  crew, creates the group if the session has none, stamps `group_id` on the owner's
  session, and creates yours.
- **You do not** — the tap becomes a request. `request_to_join_session(p_session)`
  writes a `session_join_requests` row and nothing else. The owner sees it on the
  session and approves with one tap, which runs the same join path. One tap each
  side, and no stranger can attach themselves to your evening.

**Two guards, both necessary:**

- **The owner's session row is written by someone else.** Setting `group_id` is the
  only column touched, inside a `SECURITY DEFINER` function, and only on the direct
  path or after the owner approves. Nothing about their climbs, stats or notes is
  reachable.
- **Joining closes when the verdict opens.** A join is refused once the session's
  award round has `unlocked_at` set: adding a participant to a round whose result
  people have already read is wrong, and the one-way unlock rule only prevents
  *re-locking*, not this. After that the answer is "log your own session".

Note what this does **not** change: the feed's session card stays derived from the
friend's readable `problems` rows, because `sessions` is owner-only under RLS (the
sole non-owner policy is migration 032's shared-wisdom case) and
`session_group_boulders` is readable by group members only. Showing the group's
boulder list on a card to a non-member would need either a broad new read policy or
an aggregate-only RPC — see Follow-ups.

### 2. The session view

`/sessions/:id` for a grouped session shows:

- **Who was there** — the group's roster as avatars, pending invitees faded and
  marked, plus an add affordance.
- **Boulders** — the group's list, every boulder anyone put up, each row carrying
  the boulder's identity (grade chip, hold colour, photo, a beta count when it links
  to a published gym boulder) and **your** status chip: `Project`, `Sent`, or
  nothing. Inline controls add a try or mark it sent, creating your entry on first
  touch. A boulder nobody has sent shows that; so does one everybody has.
- **Session awards** — the whole awards surface, in place.

`+ Add a boulder` adds to the group's list and creates your entry in one action,
reusing the existing `ProblemForm` and gym-boulder picker. Anyone in the group can
add; the list is not the creator's property.

For a session with no group, this section renders exactly as it does today.

### 3. Voting, in place

No sheet and no separate route. The awards section renders the pickers inline, with
the session collapsed to a one-line context header above them.

### 4. The creator's side

The add-people sheet lists the crew first, then people you follow. Rows show who has
already accepted versus who will be asked. Copy states what the invitee receives.

## Re-anchoring the awards

This is where the feature gets smaller. `crew_award_rounds` currently keys on
`(crew_id, round_date, gym)` and snapshots participants by matching `sessions`.
Replace that key with the group:

```
crew_award_rounds
  + group_id uuid unique references session_groups(id) on delete cascade
  + unlocked_at timestamptz null
  crew_id becomes nullable        -- a group of friends need not be a crew
  round_date, gym                 -- retained, denormalised from the group for history
```

Participants become **the group's members** — every user with a `sessions` row
carrying that `group_id`. The guards follow: `assert_award_voter` stops querying
`crew_award_participants` and instead asks whether a `sessions` row with this
`group_id` belongs to the user, and `get_award_round` derives its participant count
and roster the same way. `crew_award_participants` is dropped.

**Live membership needs one new guard.** With a snapshot the denominator was frozen;
with live membership, someone accepting after the last vote lands would push
`participants` above `voted` and **re-lock a verdict people have already read**. So
the round records `unlocked_at` the first time it unlocks, and the gate becomes
"`unlocked_at` is set, or every participant has a GOAT vote, or 24h after voting
opened" — unlocking is one-way. A late joiner can still vote and be voted for while
the round is open; they just cannot un-reveal it.

Deleted, and these are all deletions worth having:

- `crew_award_candidates` and its whole 7-day discovery query
- `crew_award_participants`, the `first_vote_at` freeze, the re-snapshot, and the
  orphan-row cleanup that existed only to keep the snapshot honest
- `am_participant` on both the round and the candidate row, and the staleness bug
  between them
- the `trim(s.location)` canonicalisation on both sides of every gym comparison
- `SessionAwardsCard`, its crew-page mount, and the `/crews/:crewId/awards/:roundId`
  route and page

Kept unchanged: the results embargo (`crew_award_votes`, `_tags`, `_notes` keep RLS
with no SELECT policy; `get_award_round` stays the only read path), the tag
vocabulary, dig reactions, and that **nothing awards `beta_points`**.

`crew_id` is retained on the round so the repeat-donkey streak still has a crew to
count within; when a group has no crew, the streak is simply absent.

## Delivery in two steps

The design is one thing; building it is two, and each ships working software:

**Step 1 — shared sessions.** `session_groups`, invites, `accept_session_group`,
`session_group_boulders`, `problems.group_boulder_id`, the attempts-floor fix, the
roster and boulder sections in the session view, the add-people sheet, and the
join-from-feed paths (`session_join_requests`, `join_session`,
`request_to_join_session`, `approve_join_request`) with the join affordance on the
friends-feed session card. Awards are untouched and keep working off their existing
anchor, so the "joining closes when the verdict opens" guard is inert until step 2 —
build it anyway, since step 2 turns it on. Shippable alone.

**Step 2 — awards move in.** Re-anchor the round to the group, add `unlocked_at`,
rewrite the guards onto live membership, render the awards inside the session view,
and delete the machinery listed above.

Two migrations, therefore: **080** for step 1 and **081** for step 2, each its own
release gate. Do not fold them: step 2 alters live award data and wants its own
apply-and-verify.

## Migrations

Applied by hand in the Supabase dashboard, each a release gate that must be applied
**before** the client that reads it is deployed: **080_shared_sessions.sql** and
**081_awards_on_groups.sql**. Migration 079 is already applied in production, so 081
alters live objects — it must say explicitly whether existing award rounds are
migrated onto groups or dropped, and the plan must decide which. Dropping is
defensible: at the time of writing the feature has produced no rounds anyone has
seen.

RLS: `session_groups`, `session_group_invites` and `session_group_boulders` are
readable by group members (and invitees, for the group row); writes go through
`SECURITY DEFINER` RPCs — `create_session_group`, `invite_to_session_group`,
`accept_session_group`, `decline_session_group`, `add_group_boulder`,
`join_session`, `request_to_join_session`, `approve_join_request` — because a client
must never write another user's `sessions` or `problems` rows.
`accept_session_group` writes only rows owned by `auth.uid()`; `join_session` and
`approve_join_request` additionally set `group_id` on the owner's session row and
nothing else.

## Pure utils to TDD

- `boulderRows(groupBoulders, myProblems)` → one row per list entry, joined to my
  entry, carrying `status: 'none' | 'project' | 'sent'` and my try count, in a
  stable order.
- `sessionProjectSummary(rows)` → `{ projects, sent, untouched, label }` for the
  summary line.
- `groupRoster(sessions, invites, profiles)` → accepted members and pending
  invitees in a stable order.

Everything else is a hook, component or page, verified by `npm run build` plus the
manual pass, per the project's testing constraint.

## Follow-ups, not in either step

- **A richer feed card.** The card shows counts, a top grade and photos; with a
  shared list it could show what was on the wall and who got up it. A non-member
  cannot read `session_group_boulders`, so this needs an aggregate-only RPC — boulder
  count, hardest grade, sends across the group, no per-person attribution — rather
  than a broadened read policy. Worth doing; not worth blocking step 1.

## Out of scope

- **Merging with a session you already logged that day.** Still deferred, but the
  shared-list model shrinks it: because nothing is copied, joining an existing
  session is `update sessions set group_id = …` with no boulder reconciliation at
  all. Interim behaviour, which must be built: `accept_session_group` detects an
  existing session with the same date and gym and returns a distinguishable error;
  the client warns — "You already logged a session that day" — and offers to attach
  that session to the group instead of creating a second one. If attaching proves as
  simple as it looks, this leaves Out of scope in step 1.
- Removing a boulder from the group's list once someone else has logged it.
- Leaving a group after accepting; removing someone else from a group.
- Copying or sharing exercises and challenge attempts.
- Groups spanning more than one day, or more than one gym.
- Any points for joining, accepting, adding a boulder, or being added.
