# Shared sessions — join a session, get its boulders as projects, judge it in place

**Date:** 2026-08-19
**Status:** design, approved from mockup
**Mockup:** https://claude.ai/code/artifact/a5a361c0-1c43-4870-bc5c-b2e48086b528
**Amends:** `docs/superpowers/specs/2026-08-18-session-awards-design.md` (the awards
round is re-anchored; the crew-page entry card and the standalone verdict route are
deleted)

## How this serves learning

Two people climbing the same boulder on the same evening currently keep two
unconnected records of it. Joining a session connects them, and the boulder — not
the tick — is what travels: when you accept, the wall's boulders arrive in your log
as projects, carrying grade, colour, photo and the link to the shared boulder with
its beta. You get a list of things to learn rather than a blank form. The session
then becomes the container the awards judge, so "Ida's heel-toe got three of us up
the blue 6" is attached to the evening it happened on.

There is a second, unglamorous reason: **it removes a whole class of bug.** The
awards feature currently infers "we climbed together" by matching crew members who
independently typed the same gym string on the same date. That inference is why the
feature showed nothing in production on its first day. A joined session gives the
round an explicit anchor and the matching disappears.

## Three decisions taken — overrule on review

1. **Invite-only. Nothing enters your log until you accept.** The mockup also showed
   an "unconfirmed" session sitting greyed in the sessions list, excluded from stats.
   Dropping that: it would mean auditing every streak, frequency-chart and analysis
   query to exclude unconfirmed rows, a wide blast radius where one missed query
   silently corrupts a number. An invite costs one tap and touches nothing.
2. **"Project" is not a new column — a project is `sent = false`.** `problems`
   already stores exactly this state, so every unsent problem in the app becomes a
   project retroactively, which is correct. What is new is `attempts = 0`, meaning
   "haven't touched it yet". A project with tries is still a project.
3. **Merging is out of scope** (owner deferred it), so accepting when you already
   logged that evening would create a second session. That is not silently
   acceptable, so the interim behaviour is specified: warn before creating it. See
   Out of scope.

## The model

A **session group** is one real-world session that several personal sessions point
at. Your `sessions` row stays yours — your problems, your grades, your notes. The
group holds date, gym, who is in it, and the awards.

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

session_group_invites
  group_id uuid references session_groups(id) on delete cascade
  invited_user uuid references auth.users(id) on delete cascade
  invited_by uuid references auth.users(id) on delete set null
  created_at timestamptz not null default now()
  primary key (group_id, invited_user)
```

A group is created lazily: the first time someone adds a person to their session,
that session gets a `group_id`. A solo session never gets one.

`session_partners` stays as it is. It means "I climbed with these people" and is
still the right thing for a friend who does not use the app; the group is the
stronger relationship layered above it.

## Screens

### 1. Accept if true

An invite appears at the top of `/sessions` and as a notification: **"Marius added
you to a session"**, with the date, gym and who has already accepted. Two actions:
**Accept** and **Wasn't me**. Copy states what arrives: the boulders come as
projects, no tries, nothing marked sent.

### 2. What accepting does

`accept_session_group(p_group)`:

1. Creates a `sessions` row for the caller with `group_id`, and `date`, `location`
   copied from the group. Nothing else is copied — not duration, not intensity, not
   the goal, not the notes; those are personal.
2. Copies the group's boulders into it as projects (below).
3. Deletes the invite.

**Boulder copying.** The source is the distinct set of boulders already logged
against the group by anyone. Copied per boulder: `grade_system`, `grade_value`,
`grade_value_font`, `grade_value_vscale`, `color`, `hold_color`, `gym`,
`gym_problem_id`, `image_url`, `beta_video_url`. Set fresh: `attempts = 0`,
`sent = false`, `notes = null`. **Never copied: `attempts`, `sent`, `notes`** — a
send is a claim about a person.

Dedupe by `gym_problem_id` where present, and otherwise by the tuple
`(grade_value, color, hold_color)`, so an unlinked boulder logged by two people
copies once. A boulder you already have is skipped.

**Copying once at accept time is not enough.** Accept before the creator has logged
their climbs and you would get an empty session; boulders logged later would never
reach you. So the session view also offers it on demand: when the group holds
boulders you do not have, a row appears — "3 more boulders on this session · Add
them" — running the same dedupe. Same function, called again; not a second
mechanism.

**Nothing is ever pushed, and the flow is symmetric.** After the accept-time seed, no
boulder enters your log without you tapping: people split up inside one session, and a
project you never tried is permanent noise in your project list. The pool is boulders
logged against the group *by anyone*, so a boulder you add is offered to the others on
exactly the same terms as one the creator added — the creator is not privileged. The
accept-time copy is the one push in the design, and it is justified by accepting being
an explicit "I was there".

**`attempts = 0` needs a client change.** `ProblemForm` currently floors the
attempts stepper at 1 (`Math.max(1, attempts - 1)`) and defaults
`existing?.attempts ?? 1`, so opening a copied boulder would silently bump it to one
try the user never took. Relax the floor to 0 and let 0 render as "no tries logged".

### 3. Session view, with the awards inline

`/sessions/:id` gains two sections and the awards move into it:

- **Who was there** — the group's roster as avatars, with pending invitees shown
  faded and marked, plus an add affordance.
- **Boulders from this session** — projects and sends together, each row showing a
  `Project` or `Sent` chip and its try count, with inline controls to add a try or
  mark it sent.
- **Session awards** — the whole awards surface, in place: the GOAT and donkey
  cards with their comments and dig chips when unlocked, the vote pickers and prop
  chips when open, and the thread.

### 4. Voting, in place

No sheet and no separate route. The awards section renders the pickers inline, with
the session collapsed to a one-line context header above them.

### 5. The creator's side

The add-people sheet lists the crew first, then people you follow. Rows show who has
already accepted versus who will be asked. Copy states what the invitee receives.

## Re-anchoring the awards

This is where the feature gets smaller. `crew_award_rounds` currently keys on
`(crew_id, round_date, gym)` and snapshots participants by matching `sessions`.
Replace that key with the group:

```
crew_award_rounds
  + group_id uuid unique references session_groups(id) on delete cascade
  crew_id becomes nullable        -- a group of friends need not be a crew
  round_date, gym                 -- retained, denormalised from the group for history
```

Participants become **the group's members** — every user with a `sessions` row
carrying that `group_id`. The guards follow: `assert_award_voter` stops querying
`crew_award_participants` and instead asks whether a `sessions` row with this
`group_id` belongs to the user, and `get_award_round` derives its participant count
and roster the same way. `crew_award_participants` is dropped.

That deletes, and these are all deletions worth having:

- `crew_award_candidates` and its whole 7-day discovery query
- `crew_award_participants` as a *snapshot* (membership is now live and authoritative)
- the `first_vote_at` freeze, the re-snapshot, and the orphan-row cleanup that
  existed only to keep the snapshot honest
- `am_participant` on both the round and the candidate row, and the staleness bug
  between them
- the `trim(s.location)` canonicalisation on both sides of every gym comparison
- `SessionAwardsCard`, the crew-page mount, and the `/crews/:crewId/awards/:roundId`
  route and page

**Live membership needs one new guard.** With a snapshot, the denominator was
frozen; with live membership, someone accepting after the last vote lands would push
`participants` above `voted` and **re-lock a verdict people have already read**. So
the round records `unlocked_at` the first time it unlocks, and the gate becomes
"`unlocked_at` is set, or every participant has a GOAT vote, or 24h after voting
opened" — unlocking is one-way. A late joiner can still vote and still be voted for
while the round is open; they just cannot un-reveal it.

Kept unchanged: the unlock rule (every participant has a GOAT vote, or 24h after
voting opened), the results embargo (`crew_award_votes`, `_tags`, `_notes` keep RLS
with no SELECT policy; `get_award_round` stays the only read path), the tag
vocabulary, dig reactions, and that **nothing awards `beta_points`**.

`crew_id` is retained on the round so the repeat-donkey streak still has a crew to
count within; when a group has no crew, the streak is simply absent.

## Migration

Two migrations, applied by hand in the Supabase dashboard, each a release gate
that must be applied **before** the client that reads it is deployed:
**080_shared_sessions.sql** (step 1) and **081_awards_on_groups.sql** (step 2).
Migration 079 is already applied in production, so 081 alters live objects — it must
say explicitly whether existing award rounds are migrated onto groups or dropped, and
the plan must decide which. Dropping is defensible: at the time of writing the
feature has produced no rounds anyone has seen.

RLS: `session_groups` and `session_group_invites` are readable by group members and
invitees; writes go through `SECURITY DEFINER` RPCs (`create_session_group`,
`invite_to_session_group`, `accept_session_group`, `decline_session_group`), since a
client must never be able to write another user's `sessions` or `problems` rows.
`accept_session_group` writes only rows owned by `auth.uid()`.

## Delivery in two steps

The design is one thing; building it is two, and each ships working software:

**Step 1 — shared sessions.** `session_groups`, invites, `accept_session_group`,
boulder copying as projects, the attempts-floor fix, the roster and boulder sections
in the session view, and the add-people sheet. Awards are untouched and keep working
off their existing anchor. This is shippable and useful on its own.

**Step 2 — awards move in.** Re-anchor the round to the group, add `unlocked_at`,
rewrite the guards onto live membership, render the awards inside the session view,
and delete `crew_award_candidates`, `crew_award_participants`, `SessionAwardsCard`
and the `/crews/:crewId/awards/:roundId` route.

Two migrations, therefore: **080** for step 1 and **081** for step 2, each its own
release gate. Do not fold them together — step 2 alters live award data and wants its
own apply-and-verify.

## Pure utils to TDD

- `bouldersToCopy(groupProblems, myProblems)` → the boulders to create, deduped by
  `gym_problem_id` then by `(grade_value, color, hold_color)`, excluding ones the
  caller already has.
- `sessionProjectSummary(problems)` → `{ projects, sent, label }` for the
  "2 projects · 2 sent" line.
- `groupRoster(sessions, invites, profiles)` → accepted members and pending
  invitees in a stable order.

Everything else is a hook, component or page, verified by `npm run build` plus the
manual pass, per the project's testing constraint.

## Out of scope

- **Merging with a session you already logged that day.** Deferred by the owner.
  Interim behaviour, which must be built: `accept_session_group` detects an existing
  session with the same date and gym and returns a distinguishable error; the client
  warns — "You already logged a session that day. Accepting adds a second one." —
  and proceeds only on confirmation. No silent duplicate.
- Leaving a group after accepting; removing someone else from a group.
- Copying exercises or challenge attempts.
- Groups spanning more than one day, or more than one gym.
- Any points for joining, accepting or being added.
