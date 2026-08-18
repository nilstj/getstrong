# Crew Beta Streak Design

**Date:** 2026-07-31
**Status:** Approved

## Summary

The crew page's headline number — `🔥 4-week streak` — counts weeks in which crew
members **logged a session**. Reframe it to count weeks in which the crew
**posted beta**.

CLAUDE.md draws the line explicitly: *"A streak of gym visits is vanity; a streak
of weeks you posted beta is not."* The crew page currently leads with the vanity
one, while the on-vision metric — the inside-crew leaderboard, already running on
`beta_points` — sits quieter below it.

**How this serves learning:** the most prominent, most emotional number on the
crew page starts rewarding the thing the app exists for. Nothing is added to the
screen; the same pixel starts telling the truth.

## Decisions

- **The input changes; the arithmetic does not.** `weeklyStreak(dates, now)` in
  `src/utils/crewStreak.ts` already takes a bag of ISO dates and counts
  consecutive weeks back from now. It is not modified. Only what is fed to it
  changes.
- **Source: `boulder_beta` only.** That is what *beta* means in this codebase's
  vocabulary — a tip and/or video on a shared boulder, first-class per migration
  052 — so the new label is literally true and the query touches one table. The
  rejected alternative was also counting variation teaching (a variation set with
  a demo video, or cleared with a proof clip): both genuinely teach movement, but
  it means three sources, and "beta streak" becomes a stretch for "you set an
  eliminate". Widening later is a union, not a redesign.
- **Bounded to the last 26 weeks.** A streak only ever needs recent weeks, and the
  bound matters: `boulder_beta` is indexed on `(gym_problem_id, created_at desc)`,
  not on `user_id`, so an unbounded `.in('user_id', …)` would scan.
- **The `on_fire` badge keeps its threshold** of 4 weeks; only its description
  changes.
- **Still hidden at zero.** The header already renders the streak only when
  `streak > 0`. A crew with no beta streak shows nothing rather than a shaming
  zero.
- **`weeklyStreak`'s existing tests get one gap closed.** An earlier draft of
  this spec claimed `crewStreak.ts` had no test file; that was wrong — it is
  covered by `src/utils/__tests__/crewStreak.test.ts`, which the check missed
  because that directory holds fourteen test files and only the flat
  `src/utils/*.test.ts` names were listed. Note the repo uses **both**
  conventions. Since this change repurposes what the function measures, its
  coverage was reviewed and the one behaviour its doc comment promises but no
  test exercised — future dates being ignored — was added there.

## Scope

**In scope:**
- A new `useCrewBetaWeeks(memberIds)` hook.
- `CrewGroupPage` feeds the streak from it, and both labels change.
- One added case in the existing `src/utils/__tests__/crewStreak.test.ts`.

**Out of scope:**
- Any change to `weeklyStreak`'s **logic**. Its doc comment is corrected,
  because it currently names the input as "crew activity (member sessions)",
  which this change falsifies — but the arithmetic and the signature stand.
- Counting variation teaching or `challenge_betas` toward the streak.
- The other four crew badges (`crew_send`, `flash_mob`, `first_blood`,
  `deep_bench`), which remain send-shaped. Reshaping those is a separate slice.
- Persisting battle outcomes, and the other review findings from this session.
- Any migration. This is a client-only change.

## Design

### The hook

`useCrewBetaWeeks(memberIds: string[]): UseQueryResult<string[]>` in
`src/hooks/useCrews.ts`, returning the `created_at` timestamps of `boulder_beta`
rows authored by any crew member within the last 26 weeks.

It follows the conventions of `useCrewActivityFeed` directly above it: an array
query key including the sorted, joined member ids; `enabled: memberIds.length > 0`;
and a plain `.in('user_id', memberIds)` filter. `boulder_beta` is readable by any
authenticated user (migration 052), so no policy work is needed.

The 26-week cutoff is computed from `now` and passed as a `.gte('created_at', …)`
filter, which both bounds the scan and keeps the payload to what a streak can
actually use.

### The page

In `CrewGroupPage`:

- The streak is computed from the new hook's dates rather than from
  `useCrewActivityFeed`'s session dates.
- `useCrewActivityFeed` **stays** — the Crew feed section still renders from it.
  It simply stops driving the streak.
- The header subtitle changes from `🔥 {n}-week streak` to `🔥 {n}-week beta
  streak`. The word *beta* is load-bearing: without it the number looks like it
  broke rather than changed meaning.
- The `on_fire` badge's description changes from `'4-week active streak'` to
  `'4 weeks running with beta'`.

### What this looks like the day it ships

Most crews' streaks will drop to zero, because showing up weekly is easy and
posting beta weekly is not. That is the intended effect, not a regression — but it
is why the label must explain itself on the same line.

## Testing

- **Unit (vitest), `src/utils/__tests__/crewStreak.test.ts`:** the six behaviours
  the doc comment promises were already covered there. The seventh — future-dated
  input being ignored — was missing and is added.
- **Build:** `npm run build`.
- **Lint:** measure the baseline first; add zero.
- **Manual pass:** on a crew whose members have posted beta in consecutive weeks,
  confirm the header reads `🔥 n-week beta streak` with the right n; on a crew
  with no beta, confirm no streak is shown at all and the On Fire badge is absent;
  confirm the Crew feed section still lists sessions as before.

## Release gate

None. No migration, so this ships on its own — the first crew change in a while
that does. The outstanding queue from earlier work is unaffected and still
**074 → 075 → 076 → 077 → 078**, with 076 and 077 together.
