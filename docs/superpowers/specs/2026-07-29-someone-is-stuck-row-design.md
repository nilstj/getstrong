# "Someone's stuck": beta requests on the homepage

Date: 2026-07-29

## Problem

Asking for beta is the app's most direct expression of its purpose: a climber has
explicitly said "I can't do this, help me", and another climber can answer. It is the
one mechanic where knowledge moves because someone asked for it.

Today that ask is a **20-pixel 🆘 emoji** on a 56px story circle
(`StoryRing.tsx:45-48`), and nothing else on the homepage acknowledges it. You cannot
tell who is stuck, on what, or whether you would be any use — only that some boulder
in the strip has a badge.

The data is already on the page. `useDiscoverBoulders` runs a query against
`gym_problem_help` for open requests (`useDiscoverBoulders.ts:87-89`) and spends the
result on a single boolean per boulder, `helpWanted`.

## Decisions

| Decision | Choice |
|---|---|
| Placement | Between the Latest Gym Problems strip and the feed. It reads as part of "what's happening" rather than as an alert bar above everything. |
| Row content | Asker's name, their note, and the boulder (colour + grade, gym). |
| Scope | Boulders in `myGyms` — `default_gyms` ∪ every gym you've logged at — matching the strip above it, so a climber who has only set a home gym still sees its asks. |
| Active only | Requests on expired or archived boulders are dropped. |
| Your own asks | Hidden. You know you asked; seeing yourself listed under "someone's stuck" is the same third-person oddity we removed from the beta feed. |
| One row per request | Not per boulder — two climbers stuck on the same boulder is two asks, and the count should say so. |
| Cap | Three rows, newest first. Beyond that, a muted "+N more" linking to `/gym-problems`, which already has a help-wanted filter. |
| Empty | Renders nothing at all when nobody is stuck. |

### What this costs

- **The help rows are free.** The query already runs with the right
  `.in('gym_problem_id', ids)` and `.is('resolved_at', null)` filters; it currently
  selects one column and will select four (`gym_problem_id, user_id, note,
  created_at`). Same round trip.
- **The asker's name costs one batched query** — `profiles.select('id, username').in('id', askerIds)`, the pattern used throughout this codebase, skipped entirely when there are no open requests.
- **The boulder's display fields are already computed.** `BoulderSummary` carries
  `title`, `gym`, `color` and `community_grade`, so a request references the summary
  rather than re-deriving anything.

### Staying non-fatal

The existing help query deliberately ignores its error so that an unapplied migration
057 degrades to "no help indicators" instead of breaking the home strip
(`useDiscoverBoulders.ts:84-86`). The widened select and the new profile lookup keep
that property: any failure yields an empty request list, and the strip and feed render
as they do today.

## The list is built by a pure function

```ts
export interface BetaRequest {
  gymProblemId: string
  askerId: string
  askerName: string | null
  note: string | null
  createdAt: string
  boulder: BoulderSummary
}

/**
 * Open beta requests worth showing: not your own, on a boulder still active, newest
 * first. A row whose boulder isn't in `boulders` is dropped — that is how expired and
 * archived boulders are excluded, since the caller passes only the active summaries.
 */
export function buildBetaRequests(
  rows: { gym_problem_id: string; user_id: string; note: string | null; created_at: string }[],
  boulders: BoulderSummary[],
  profiles: { id: string; username: string | null }[],
  currentUserId: string | undefined,
): BetaRequest[]
```

It lives in `src/utils/betaRequests.ts` and is unit-tested — the filtering and
ordering is the only logic in this feature, and this project tests pure utils.

## The section

`src/components/BetaRequestsSection.tsx`, given `requests: BetaRequest[]`, renders
nothing when the list is empty. Otherwise:

```
── SOMEONE'S STUCK ────────────────
┌──────────────────────────────────┐
│ 🙋 ola · the blue 6C          ›  │
│    "can't hold the crux"         │
│    Boulders Oslo                 │
└──────────────────────────────────┘
┌──────────────────────────────────┐
│ 🙋 kari · the red             ›  │
│    Klatreverket                  │
└──────────────────────────────────┘
                     +5 more →
```

Each row is a button navigating to `/gym-problems/{gymProblemId}`, where the Beta tab
carries the thread and the composer. The note line is omitted when there is no note —
`gym_problem_help.note` is nullable (migration 059), and an empty quotation reads as a
bug. The boulder is named the way the rest of the app now names one, colour and grade,
falling back to the summary's `title`.

The heading matches the strip's style above it: `text-xs font-bold uppercase
tracking-wide text-gray-400`.

## Files

| File | Change |
|---|---|
| `src/utils/betaRequests.ts` | New. `BetaRequest` and `buildBetaRequests`. |
| `src/utils/__tests__/betaRequests.test.ts` | New. Own-asks excluded, inactive boulders dropped, newest first, name attached or null, empty inputs. |
| `src/hooks/useDiscoverBoulders.ts` | Widen the help select; batch-fetch asker profiles; return `betaRequests` alongside `yours`/`discover`/`archived`. |
| `src/components/BetaRequestsSection.tsx` | New. The section described above. |
| `src/pages/DashboardPage.tsx` | Render it between the strip and the feed. |

No migration. No new RPC. `gym_problem_help` and its `note` column have been live
since migrations 057 and 059.

## Out of scope

- Answering a request from the homepage. Tapping opens the boulder, where the beta
  composer already lives — engagement stays on the boulder page, as decided when the
  feed was first built.
- A dedicated "all requests" screen. The `+N more` link points at `/gym-problems`,
  which already filters by help-wanted.
- Notifying anyone. Asking already notifies via the existing trigger.
- The asker's attempt video (`gym_problem_help.video_url`). It shows on the boulder
  page; a thumbnail here would crowd a three-line row.
- Resolving a request from this section.

## Verification

- `npm run build`, `npm run lint` (measure the baseline first), `npx vitest run`.
- `buildBetaRequests`'s tests are the real coverage; the section and hook are verified
  by build and a manual pass.
- Manually: with an open request at one of your gyms, the section appears between the
  strip and the feed showing the asker, note and boulder, and tapping it opens that
  boulder; asking for beta yourself does **not** add a row; resolving the request
  removes it; with no open requests the section is absent entirely.
