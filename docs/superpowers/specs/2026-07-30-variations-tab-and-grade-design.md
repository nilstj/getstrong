# Variations Tab & Variation Grade Design

**Date:** 2026-07-30
**Status:** Approved

## Summary

Two changes to the boulder variations shipped on 2026-07-30 (merge `df7cec5`):

1. Variations move out of the Beta tab into **their own tab**, labelled with a
   count — `Variations (2)`.
2. A variation can carry **its own grade**, because eliminating a hold can make
   the same boulder harder or softer than the original.

**How this serves learning:** a graded variation tells a climber what they're
taking on before they pull on — "the blue 6C goes at 7A without the crimp" is
information about the movement, not about the tick. And a tab makes the
variations findable; buried at the top of the Beta tab they read as a footnote to
someone else's beta.

## Decisions (from brainstorming)

- **Absolute grade, difference derived.** The setter picks a real grade (`7A`),
  and the UI computes the comparison against the boulder's grade for display.
  The rejected alternative was storing a relative offset (`+2`), which stores
  nothing usable when the boulder itself is ungraded — common, since
  `gym_problems.community_grade` is nullable — and can't be compared with any
  other grade in the app.
- **Same-system comparisons only.** Grades are stored verbatim in whichever
  scale the setter prefers, following `profile.grade_preference`, exactly as
  `AddGymBoulderSheet` already stores a boulder's `community_grade`. Converting
  Font↔V needs the gym's own `gym_gradings` mapping table, so the difference is
  shown only when both grades are in the same system, and the grade alone
  otherwise. Honest, and it adds no new data dependency.
- **The grade is optional**, like a boulder's. No grade means no grade shown.
- **The setter sets it, and it stays theirs.** No per-variation community
  consensus vote: a variation has a handful of clears, so a consensus grade
  would be noise.
- **The setter can regrade it later.** Deliberate: variations have no delete
  path (the `/challenges` delete button cascades and would destroy other
  climbers' clears), so without regrading a mis-graded variation would be
  permanent.
- **The tab hides entirely when the migrations aren't applied**, the same way
  the block hides today, so there is never an empty third tab.

## Scope

**In scope:**
- `'variations'` added to `BoulderTab`; a third tab on the boulder page.
- `challenges.grade text` (migration 077) + the grade control in the
  set-a-variation sheet + regrading from the detail sheet.
- A new tested pure util, `gradeDelta`.
- The `variation_cleared` notification's `openTab` retargeted to the new tab.
- **Both discovery surfaces land on the new tab.** Tapping a variation-bearing
  boulder in the Latest Gym Problems strip, or in the Gym problems overview list,
  opens it on Variations rather than the default tab.
- **A variation marker in the Gym problems overview list**, which previously had
  none.

**Out of scope:**
- Community/consensus grading of a variation.
- Editing the grade from `/challenges` — the boulder page's detail sheet is
  where the comparison is visible, so that is where regrading belongs.
- Showing a variation's grade in the Latest Gym Problems strip or the overview
  list. Both carry the *boulder's* grade; the marker only flags that variations
  exist. A variation's own grade lives on the boulder page.
- Cross-system (Font↔V) comparison.

## Design

### The tab

`BoulderTab` in `src/utils/boulderNav.ts` becomes `'beta' | 'sendtrain' |
'variations'`. `CrewPage`'s `type Tab = BoulderTab` picks that up for free, and
its `TABS` array gains a third entry in last position: **Beta | Sendtrain |
Variations (n)**.

`CrewPage` calls `useVariations(id)` itself for two things — the count for the
label, and `isError` to decide whether the tab exists at all. This costs no
extra request: the panel uses the same `['variations', gymProblemId]` array key,
so React Query serves both from one cached result.

- **Tab hidden whenever the panel would render nothing**, so the tab and its
  content can never disagree. That is two cases: the query errored (the
  pre-migration state, since `challenges.gym_problem_id` won't exist), and the
  boulder is archived or expired with no variations on it — `BoulderVariations`
  already returns `null` for `readOnly && variations.length === 0`, and
  `CrewPage` computes that same `readOnly` expression to pass it down, so the tab
  reuses it rather than deriving its own. Built by filtering the `TABS` array, so
  the remaining two tabs still divide the width evenly.
- **Count always shown**, including `(0)`. A zero is information: it says there
  is nothing inside without costing a tap.
- **`text-xs` on the tab row.** `Variations (0)` is the longest label the row has
  carried, and at three `flex-1` tabs each gets a third of a 375px phone.
- **Fallback:** if `navState.openTab` is `'variations'` while the tab is hidden,
  the page opens on Beta rather than rendering a blank panel. Unreachable today
  (no variations can exist pre-migration, so no such notification can exist) but
  a blank hero screen is a bad failure mode to leave available.

### The panel

`BoulderVariations` moves from the top of the `tab === 'beta'` block into its own
`tab === 'variations'` branch, and **loses its internal "🧩 Variations"
heading** — the tab label carries that now. Its `readOnly` prop and its
`if (isError) return null` guard stay as they are; the guard is now belt-and-braces
behind the hidden tab, and still correct if a transient error hits after mount.

The empty state is now the whole panel rather than a line under a heading, so it
keeps both existing strings — "None yet — same boulder, different rules. Set
one." when the viewer has sent the boulder, "None yet. Send it first, then you
can set one." when they haven't — with the **＋ Set a variation** button beside
the first.

### The grade

**Migration 077**, additive:

```sql
alter table challenges add column if not exists grade text;
```

Free text, like `gym_problems.community_grade`. No check constraint: the two
grade vocabularies live in `src/utils/grades.ts` and a database constraint would
have to be kept in step with them by hand.

**Setting it.** The set-a-variation sheet gains an optional grade `<select>`,
built from `FONT_GRADES_ORDERED` or `V_GRADES` according to
`profile.grade_preference` — the same control and the same source arrays as
`AddGymBoulderSheet`, so a climber is offered the scale they already chose. An
empty first option means "no grade".

**Showing it.** `Variation` gains `grade: string | null`. The row and the detail
sheet render it as `Chip variant="grade"`, matching the boulder page's existing
grade chip, followed by the derived comparison.

**Regrading it.** In the detail sheet, when the viewer is the variation's
creator, the grade renders as the same `<select>` with a save action, through a
new `useUpdateVariationGrade` mutation. This is the only field a setter can
change from the boulder page, and it exists because there is no delete path.

**The comparison — a new pure util,** `src/utils/gradeDelta.ts`:

```ts
gradeDelta(boulderGrade: string | null | undefined,
           variationGrade: string | null | undefined): string | null
```

Returns a phrase for display, or `null` when no honest comparison exists:

| boulder | variation | result |
|---|---|---|
| `6C` | `7A` | `'2 harder than 6C'` |
| `6C` | `6B+` | `'1 softer than 6C'` |
| `6C` | `6C` | `'same as 6C'` |
| `null` | `7A` | `null` |
| `6C` | `null` | `null` |
| `6C` | `V5` | `null` — different systems |
| `6C` | `7Z` | `null` — not a grade we know |

Both scales are ordered ascending in their own array, so the difference is the
index difference within one array: `FONT_GRADES_ORDERED` via the existing
`fontGradeToIndex`, `V_GRADES` via `indexOf`. System detection uses the existing
`gradeSystemFor`. An index of `-1` (a string not in the array) yields `null`
rather than a nonsense number — the columns are free text, so an unrecognised
grade is a real possibility.

"Harder" and "softer" rather than `+2`/`−1`: it is how climbers say it, and it
needs no key to read.

### The two discovery surfaces

A boulder marked as carrying a variation should open on the tab that marker is
advertising. Both surfaces already navigate with `BoulderNavState`, so both gain
`openTab: 'variations'` when `hasVariation` is true, keeping whatever else they
already pass:

- **Latest Gym Problems strip** (`LatestProblemsStrip.tsx`) — already passes
  `boulderIds` for prev/next paging; `openTab` joins it.
- **Gym problems overview list** (`CrewsSection.tsx`, `BoulderRow`) — same, and
  it also gains the marker it never had: a 🧩 badge beside the existing 🆘
  help-wanted badge, which is that row's established idiom for a flag. Not the
  strip's `· Variation` text, because this row already spends its text budget on
  the title and grade.

Both rely on `BoulderSummary.hasVariation`, which already exists.

**The tradeoff, accepted:** the whole row and the whole ring navigate to
Variations, so for a variation-bearing boulder the Beta tab is one extra tap
away. The alternative — making only the marker deep-link — isn't available: both
surfaces are already a single `<Link>`/`<button>`, and nesting an anchor inside
one is invalid markup. Since the marker is what draws the tap, honouring it is
the right default.

Pre-migration this is inert in both places: `hasVariation` comes from a query
that fails and is deliberately swallowed, so it is false, no marker renders and
no `openTab` is passed. And if a stale `openTab: 'variations'` ever did arrive
while the tab is hidden, the boulder page falls back to Beta.

### Elsewhere

The `variation_cleared` notification's `openTab` changes from `'beta'` to
`'variations'` in `AppBar.tsx`. Its known limitation is unchanged and still
documented in `boulderNav.ts`: `openTab` applies on mount only, so it has no
effect for a reader already sitting on a boulder page — which is why this affects
notifications and lists, both of which arrive from another route.

## Testing

- **Unit (vitest):** `gradeDelta` — every row of the table above, both scales,
  and the boundary grades of each array.
- **Build:** `npm run build`.
- **Lint:** measure the baseline first; add zero.
- **Manual pass:** set a variation with a grade harder than the boulder, then
  one softer, then one with no grade; confirm the chip and the phrase on the row
  and in the sheet; regrade one as its setter and confirm it persists; confirm
  the tab label counts correctly and that the tab is absent on a boulder whose
  variations query fails.

## Release gate

**Migration 077 must be applied by hand in the Supabase dashboard.** The full
outstanding order is **074 → 075 → 076 → 077**, and 074 must never be re-run
after 076 — it recreates `beta_points_reason_check` without the two variation
reasons, and the award trigger has no exception handler, so a clear would fail
outright rather than merely go unpaid.

The grade column is additive and independent of the award logic, so a client
deployed with 076 applied but not 077 shows variations correctly and only fails
when someone tries to set a grade.
