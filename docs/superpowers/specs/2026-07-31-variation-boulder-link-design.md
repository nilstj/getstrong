# Variation → Boulder Link, and No Orphaned Variations

**Date:** 2026-07-31
**Status:** Approved

## Summary

Two fixes to boulder variations, both about a variation's connection to the
boulder it belongs to:

1. **A variation seen in `/challenges` must say which boulder it is on** — the
   gym first, then the boulder's colour identity — and tap through to it. Today
   it carries a bare 🧩 marker, so a card reading "no heel hook on the arête"
   gives a climber no way to know where that arête is.
2. **Deleting a boulder must never leave a variation orphaned.** Today
   `challenges.gym_problem_id` is `on delete set null`, so deleting a boulder
   silently converts every variation on it into a context-free portable
   challenge — and the delete guard doesn't even see those variations.

**How this serves learning:** beta only teaches if you can find the wall it
belongs to. A variation whose boulder can't be identified is noise on the
Challenges tab, and an orphaned one is noise nobody can ever clear.

## The bug being fixed, precisely

`delete_gym_problem` (migration 070) blocks deletion when **others have logged
the boulder** — a `problems` row by another user. But clearing a variation writes
only to `challenge_attempts`; it never creates a `problems` row. So this sequence
is currently possible and loses nothing visibly while breaking everything:

1. You publish a boulder and set a variation on it.
2. Three other climbers clear that variation, two with proof clips.
3. You delete the boulder. The guard sees no other `problems` rows and allows it.
4. `on delete set null` fires. The variation survives with all three clears and
   both clips — anchored to nothing, showing no gym, no colour, no 🧩 marker,
   titled "no heel hook on the arête".

Stripping is unaffected and always was: `strip_gym_problem` sets
`status = 'archived'` and deletes nothing, so a stripped boulder keeps its
variations, anchored and readable, read-only.

## Decisions

- **Gym first in the chip.** The question a climber is asking on the Challenges
  tab is "can I do this where I am?", so the gym name leads and the colour icons
  follow as identity. Not the reverse.
- **A missing gym is meaningful, not missing information.** Only a variation has
  a gym; a portable challenge has none, and that absence says "anywhere". So a
  portable challenge's card is unchanged — no empty chip, no placeholder.
- **Block the delete only when someone else has cleared a variation, and take
  the setter's own variations with the boulder otherwise.** The naive rule —
  block whenever any variation exists — deadlocks: there is no delete path for a
  variation either, so a boulder you published and varied by mistake would be
  permanently undeletable. The rejected alternatives were cascading
  unconditionally (destroys other climbers' clips, the same reason the
  `/challenges` delete button is hidden for variations) and snapshotting the
  boulder's identity onto the challenge so an orphan stays legible (more schema,
  and it preserves a challenge nobody can climb).

## Scope

**In scope:**
- The boulder chip on the `/challenges` card (display only) and in the challenge
  detail sheet (linking through to `/gym-problems/:id`).
- One FK embed in `useChallenges` to carry the boulder's gym and colours.
- Migration 078: `delete_gym_problem` gains a variation guard and explicitly
  deletes the setter's own variations rather than orphaning them.
- The delete confirmation copy on the boulder page, which currently promises only
  "Only works if no one else has logged it".

**Out of scope:**
- Filtering or sorting `/challenges` by gym. Showing the gym is what was asked;
  a "at my gym" filter is the natural follow-on once there are enough variations
  to need one.
- A delete path for a variation. Still deliberately absent — its clears belong to
  other climbers.
- Backfilling the variations already orphaned by a delete. None can exist yet:
  migration 076 has not been applied, so no variation exists in any database.

## Design

### The boulder chip

`useChallenges` currently selects `*`. Both of its queries gain one FK embed:

```ts
.select('*, gym_problems(gym, color, hold_color)')
```

CLAUDE.md's no-embed rule is specifically about `problems`↔`profiles`; this is a
plain to-one embed on a real foreign key. `Challenge` gains the matching optional
field, which is `null` for a portable challenge.

**On the card** ([ChallengesPage.tsx](../../../src/pages/ChallengesPage.tsx),
`renderChallengeCard`): the bare `🧩 Variation` span becomes a chip carrying the
gym name then `ProblemColorIcons`, in the same wrap row as the tags. It stays a
plain `<span>` — **display only, not tappable.** The card is itself a `<button>`,
and a `<button>` nested inside a `<button>` is invalid markup for the same reason
an anchor is; the card's existing edit and delete buttons dodge this only by
living outside the card button as absolutely-positioned siblings, which is the
wrong place for identity that belongs beside the tags.

That is enough for what the card is for: answering "can I do this where I am?" at
a glance, while scrolling. It costs nothing, because tapping the card already
opens the detail sheet.

**In the detail sheet** (`ChallengeDetail`): the same identity as a real `Link` to
`/gym-problems/:id`, since the sheet is not nested inside a button. This is where
a climber reads the variation properly, and it is where the link requirement is
actually met — one tap from the card.

A challenge with no `gym_problem_id` renders exactly as it does today.

### Migration 078

Reproduces 070's `delete_gym_problem` with one added guard and one added cleanup
step. The signature is unchanged, so no client call site moves. All table
references are qualified and `set search_path = public, pg_temp` is added,
matching the hardening convention the newer migrations use — a behaviour-neutral
change on top of the two real ones.

The two real changes, after the existing authentication, ownership and
"others have logged this" checks:

```sql
  -- A variation someone else has cleared carries their proof clips. Never
  -- destroy those — strip archives the boulder and keeps everything.
  if exists (
    select 1 from public.challenge_attempts a
      join public.challenges c on c.id = a.challenge_id
     where c.gym_problem_id = p_gym_problem_id
       and a.user_id <> v_user
  ) then
    raise exception 'Others have cleared a variation on this boulder — mark it stripped instead';
  end if;

  -- Otherwise every variation here is the setter's own with no outside clears, so
  -- take them with the boulder. Without this, gym_problem_id's ON DELETE SET NULL
  -- (076) would leave them as context-free portable challenges.
  -- challenge_attempts cascades off challenges (003).
  delete from public.challenges where gym_problem_id = p_gym_problem_id;
```

The `delete from gym_problems` that ends the function is unchanged and still last.

### The confirmation copy

The boulder page's delete confirm ([CrewPage.tsx:527](../../../src/pages/CrewPage.tsx))
says "Only works if no one else has logged it." It now also removes the setter's
own variations, and can also be refused because of a variation, so the copy has to
say both. The error message from the new guard reaches the user through the
existing `onError` toast and reads as a sentence, so no client-side error handling
changes.

## Testing

No new pure util: the chip is presentation and the guard is SQL. Per the
project's constraint that only `src/utils/` pure functions are tested,
verification is `npm run build` plus the manual pass below.

- **Lint:** measure the baseline first; add zero.
- **Manual pass:**
  - A variation's card shows its gym then its colours, and tapping anywhere on the
    card still opens the challenge as before.
  - The detail sheet shows the same identity and its link opens the boulder.
  - Confirm the embed's actual shape: PostgREST returns an object for a to-one
    foreign key, but if `gym_problems` arrives as a single-element array the chip
    renders nothing and the type is wrong. This cannot be checked without a live
    database, so check it here.
  - A portable challenge's card and sheet are unchanged.
  - As the setter, on a boulder with one of your own variations and no outside
    clears, delete it: the boulder and the variation both go, and no context-free
    challenge is left in `/challenges`.
  - As the setter, on a boulder whose variation another climber has cleared,
    delete it: refused, with the "mark it stripped instead" message in a toast.
  - Strip that same boulder instead: it archives, and the variation stays listed
    and read-only.

## Release gate

**Migration 078 must be applied by hand in the Supabase dashboard.** The full
outstanding order is now **074 → 075 → 076 → 077 → 078**, with 076 and 077
applied together (see the 2026-07-30 spec for why), and 074 never re-run after
076.

078 is independent of the client: it only tightens a function the client already
calls with the same signature. Applying it early is harmless; applying it late
means a delete can still orphan a variation until it lands.
