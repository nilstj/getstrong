# Tell the climbers who need it when beta lands

**Date:** 2026-08-27

## How this serves learning

A climber who says "I'm stuck" is told the moment someone explains the move. A
climber grinding a project hears about new movement knowledge on it without
going looking for it. Knowledge moves to the person who needs it, at the moment
they need it — rather than sitting on a boulder page waiting to be discovered.

## The gap today

Posting beta fires no notification. The only `after insert on boulder_beta`
triggers are 074's points award and 090's setter-caution ping
(`090_caution_beta.sql:182`). Answer someone's explicit plea for beta and they
are told nothing; they find out by reopening the boulder.

Two audiences exist in the schema already and neither is served:

- **Asked for beta** — an open row in `gym_problem_help` (`resolved_at is
  null`), from `057_beta_help.sql`.
- **Projecting** — claimed the boulder (a `problems` row carrying that
  `gym_problem_id`) with no `sent = true` go. This is the app's own definition,
  spelled out at `src/hooks/useDiscoverBoulders.ts:46`: *"Done = at least one
  sent go. A claimed-but-unsent boulder is still a project."*

## Scope

**In:** one new server trigger, two new notification types, their inbox copy and
routing, and the pure utils the copy needs.

**Out:** push/email delivery (the inbox and its realtime badge are the delivery
mechanism, per `037_notifications.sql`); notifying the boulder's publisher;
notifying on beta *replies* or *reactions*; any change to who gets 090's setter
caution ping; claims that arrive only via a variation.

## 1. Recipients

A new `SECURITY DEFINER` trigger, `after insert on boulder_beta`, fires for both
`kind = 'beta'` and `kind = 'caution'`.

**Boulder must be live.** Gate on `status = 'active' and expires_at >=
current_date` — the SQL mirror of `isActiveBoulder` at
`src/utils/gymProblems.ts:25`, including the inclusive expiry day. A stripped or
expired boulder pings nobody.

Two **disjoint** recipient sets, with the beta's author excluded from both:

| Set | Rule |
| --- | --- |
| **Asked** | An open `gym_problem_help` row (`resolved_at is null`) for this boulder. |
| **Projecting** | Has a `problems` row with this `gym_problem_id`, **and** no row for this `gym_problem_id` with `sent = true`, **and** is not in *Asked*. |

*Asked* wins the overlap, so a single beta is never two rows for one person. An
asker who has in fact already sent the boulder still counts as an asker: they
asked, and 057 only closes the request when they mark a beta worked.

## 2. Notification types

Two new entries in `NotificationType` (`src/types/index.ts`):

- `beta_answered` — you asked for beta here.
- `beta_on_project` — you are working on this boulder.

Two types rather than one type carrying a `reason` in `data`, because that is
this codebase's idiom: `session_join_request` and `session_join_approved` are
already two types with identical routing, separated purely because the sentence
differs. Two types also give each row a distinct icon for free, since `ICONS` in
`AppBar.tsx` is keyed `Record<Notification['type'], string>`.

Both rows carry:

- `entity_id` = the `gym_problem_id`.
- `actor_id` = the beta's author.
- `data` = `{ gym, color, community_grade, kind, risk_move, body }` read off
  the `gym_problems` row, where `body` is
  truncated to 140 characters (an inbox row shows one line; storing the whole
  tip bloats every recipient's copy of it).
- Route `/gym-problems/:id` with `state: { openTab: 'beta' } satisfies
  BoulderNavState` — the same landing `boulder_caution` already uses, so the
  reason for the tap is on screen on arrival.

Insertion is set-based (two `insert … select` statements, one per type), the
shape `038_video_notifications.sql` uses for a fan-out, with `and recipient <>
new.user_id` supplying the self-skip that `create_notification` would otherwise
give. Declared `set search_path = public, pg_temp`, matching 090.

## 3. Throttle

**`beta_answered` is never collapsed.** You asked; every answer earns a ping.
It self-limits: 057's `resolve_help_on_beta_worked` closes your request as soon
as you mark a beta worked.

**`beta_on_project` is suppressed** when that recipient already holds an
**unread** `beta_on_project` for that boulder. Nothing rate-limits beta inserts,
so without this one climber posting ten thin tips stacks ten rows on everyone
projecting the boulder. Reading the row makes you eligible again. Nothing is
lost: opening the boulder shows every beta, and the collapsed row's stale
`actor_id` costs only a name in one sentence.

This is a check-then-write, which the project conventions warn against. That
guidance is about `beta_points`, where a lost race mints currency. Here a lost
race costs one duplicate inbox row, so a database constraint is not worth
carrying — stated explicitly so the exception is a decision rather than an
oversight.

## 4. Copy

`kind = 'caution'` must never be called "beta" in copy — 090 is emphatic that a
caution is a kind of beta *in the schema*, but "Ada posted beta" for a watch-out
misleads the reader about what they are about to open. So each type branches on
`kind`:

| | `kind = 'beta'` | `kind = 'caution'` |
| --- | --- | --- |
| **`beta_answered`** 💡 | *Ada answered your ask for beta on the blue 6C* | *Ada flagged a move to watch out for on the blue 6C you asked about* ⚠️ |
| **`beta_on_project`** 👀 | *Ada posted beta on the blue 6C you're working on* | *Ada flagged a move to watch out for on the blue 6C you're working on* ⚠️ |

**Detail line:** the risk-move label (via existing `riskMoveLabel`) for a
caution; the stored body snippet, quoted, for a plain beta — matching how
`problem_comment` renders its `body`.

**Boulder label:** "the blue 6C", falling back to "a boulder". Names were
removed from the app, so there is nothing else to call it.

## 5. Components and their boundaries

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| `supabase/migrations/091_notify_beta_recipients.sql` | Decide who hears about a new beta, and write their rows. | `boulder_beta.kind` (090), `gym_problem_help` (057), `problems`, `gym_problems`, `notifications` (037) |
| `boulderColorGradeLabel()` in `src/utils/boulders.ts` | Turn a colour + grade into "the blue 6C". Pure. | nothing |
| `betaNotificationText()` in `src/utils/betaNotification.ts` (new) | Turn (type, kind, actor name, label, gym, body, risk move) into `{ text, detail }`. Pure. | `boulderColorGradeLabel`, `riskMoveLabel` |
| `AppBar.tsx` | Render and route the row. | `betaNotificationText` |

`betaNotificationText` exists so the branching table in §4 is testable. Project
convention tests only pure functions in `src/utils/`, so logic worth testing
gets extracted there rather than left in a component switch — which also keeps
`AppBar`'s `describe()` to one line per new case.

`boulderColorGradeLabel` is an extraction, not a new idea: the same string is
built privately today as `boulderLabel` in `BetaRequestsSection.tsx:36`,
including the "a boulder" fallback and the reasoning for it. This spec needs the
identical string, so it moves to `boulders.ts` and that component consumes it.
That is the whole of the refactoring in scope.

## 6. Error handling and degradation

- **Unknown type on a stale client.** `notifications` is in the realtime
  publication, so an open tab predating this change can receive a
  `beta_on_project` row. `describe()` already degrades to *"Someone did
  something new"* via its `default` branch. `ICONS[type]` is then `undefined`,
  which `Avatar` passes straight into JSX — React renders nothing for it, so the
  row loses its badge emoji and does not throw. That is a degradation, not a
  handled case, which is why the client deploys first (§8).
- **Boulder row missing.** The live-boulder gate is a join, so a beta whose
  `gym_problems` row has vanished selects zero recipients rather than raising.
- **`gym` null.** Copy omits the gym clause; existing types do the same.
- **Trigger raising would abort the beta insert.** The trigger does no work that
  can fail on well-formed input, but it must never be the reason a climber's
  tip is rejected — no `raise` in the trigger body, and the recipient queries
  stay set-based rather than looping over rows that could be modified
  concurrently.

## 7. Verification

- **Unit (Vitest, pure utils only):** `betaNotificationText` — all four cells of
  §4's table, plus null gym, null body, null risk move, and an unknown `kind`
  falling back to the plain-beta wording. `boulderColorGradeLabel` — colour and
  grade, colour only, grade only, neither (the "a boulder" fallback), and case
  normalisation.
- **Migration smoke:** the migration ends with a `do` block that calls the
  trigger function's dependencies, because a plpgsql body is not validated at
  `CREATE` — a migration can apply perfectly clean and still raise on first
  call.
- **`npm run build`** must pass (`noUnusedLocals` and `noUnusedParameters` are
  on, and an unused local fails the Vercel deploy).
- **`npm run lint`** must add **zero** problems. Measure the baseline before
  starting; a number from a doc or a memory is not evidence.
- **Manual pass on a phone-width viewport:** ask for beta on a boulder as user
  A; post beta as user B; confirm A's bell badges live, the row reads as §4
  specifies, and the tap lands on the Beta tab. Repeat for a projector, then
  post a second beta and confirm the projector row does **not** stack while
  unread. Post a caution and confirm the ⚠️ wording plus that a setter who is
  also projecting sees both rows.

## 8. Release gate

**091 reads `boulder_beta.kind`, which 090 adds, and 090 is not yet applied.**

Migrations are applied by hand in the Supabase dashboard, so the dashboard is
the only authority on what has actually been applied — check it rather than
trusting this list. Order:

1. Deploy the client first. It renders the two new types and is harmless
   without the migration (no rows of these types exist yet). Deploying it first
   means no row ever lands in an inbox that cannot render it.
2. Apply every outstanding migration in numeric order, up to and including
   **091**. The hard dependency is **090 before 091**: 091 reads
   `boulder_beta.kind`, so applying it first fails outright.

Only after step 2 does any notification of these types exist.
