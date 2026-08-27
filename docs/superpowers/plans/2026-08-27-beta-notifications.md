# Beta Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When beta lands on a live shared boulder, notify the climbers who asked for beta on it and the climbers projecting it.

**Architecture:** One `SECURITY DEFINER` trigger on `boulder_beta` inserts rows into the existing `notifications` table for two disjoint audiences, using set-based `insert … select` (the fan-out shape from `038_video_notifications.sql`). Two new `NotificationType` entries carry the rows. All copy branching lives in a pure util so it can be unit-tested, because this project tests only pure functions in `src/utils/`.

**Tech Stack:** Postgres/plpgsql (Supabase), TypeScript, React, React Query, Vitest, Tailwind (`sage`/`khaki` palettes), `lucide-react`.

**Spec:** `docs/superpowers/specs/2026-08-27-beta-notifications-design.md`

## Global Constraints

- **Lint baseline is 16 problems (15 errors, 1 warning), measured 2026-08-27 with `npm run lint`.** New work must add **zero**. Re-measure before you start; the baseline drifts as files change.
- **`npm run build` = `tsc -b && vite build`.** `noUnusedLocals` and `noUnusedParameters` are ON — an unused local or parameter is a build-failing error that fails the Vercel deploy.
- **Only pure functions in `src/utils/` are tested.** There is no `@testing-library/react`. Hooks, components and pages are verified by `npm run build` plus a manual pass. Do not add a component-test framework.
- **Migrations are applied by hand in the Supabase dashboard**, never by tooling from this repo. Do not attempt to run one.
- **091 requires 090.** It reads `boulder_beta.kind`, which `090_caution_beta.sql` adds. `090` was not applied as of 2026-08-27. Applying 091 first fails outright.
- **Vocabulary.** A *beta* is a first-class object on a shared boulder, not a comment. *Log* is the private per-session action; *create/publish* is the public one — never use "log" for a shared boulder. A *caution* is a kind of beta in the schema, but user-facing copy must not call a caution "beta".
- **`points must never be mintable by a client`** — this plan awards no points and must not touch `beta_points`.
- **Copy strings are exact.** Reproduce them character for character, including the em dash (`—`), the apostrophe in `you're`, and the trailing ` ⚠️`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/utils/boulders.ts` (modify) | Add `boulderColorGradeLabel` — "the blue 6C". Pure. |
| `src/utils/__tests__/boulders.test.ts` (modify) | Tests for the above. |
| `src/components/BetaRequestsSection.tsx` (modify) | Drop its private `boulderLabel`, consume the shared util. |
| `src/utils/betaNotification.ts` (create) | `betaNotificationText` — the whole §4 copy table. Pure. |
| `src/utils/__tests__/betaNotification.test.ts` (create) | Tests for the above. |
| `src/types/index.ts` (modify) | Two new `NotificationType` entries. |
| `src/components/AppBar.tsx` (modify) | Icon, copy dispatch, route, Beta-tab landing. |
| `supabase/migrations/091_notify_beta_recipients.sql` (create) | Decide recipients and write their notification rows. |

Task order is utils → types+UI → migration, so every commit builds and every commit's tests pass.

---

## Task 1: `boulderColorGradeLabel`

The string "the blue 6C" already exists as a private `boulderLabel` in `BetaRequestsSection.tsx:36`. Task 3 needs the identical string for an inbox row, so it moves to `src/utils/boulders.ts` and gets tests. This is the only refactoring in scope.

**Files:**
- Modify: `src/utils/boulders.ts` (append)
- Modify: `src/utils/__tests__/boulders.test.ts` (append)
- Modify: `src/components/BetaRequestsSection.tsx:31-40` (remove the private helper) and its import block at line 5

**Interfaces:**
- Consumes: nothing.
- Produces: `boulderColorGradeLabel(b: { color: string | null; community_grade: string | null }): string`

- [ ] **Step 1: Write the failing test**

Append to `src/utils/__tests__/boulders.test.ts`. Also add `boulderColorGradeLabel` to the existing import on line 2, which becomes:

```ts
import { boulderTitle, countMembersByBoulder, boulderColorGradeLabel } from '../boulders'
```

Then append:

```ts
describe('boulderColorGradeLabel', () => {
  it('reads "the <colour> <grade>"', () => {
    expect(boulderColorGradeLabel({ color: 'blue', community_grade: '6C' })).toBe('the blue 6C')
  })
  it('lowercases the colour but leaves the grade as stored', () => {
    // Grades are written "6C" and "V4"; lowercasing them would be wrong.
    expect(boulderColorGradeLabel({ color: 'Blue', community_grade: '6C' })).toBe('the blue 6C')
  })
  it('drops the missing half when only a colour is known', () => {
    expect(boulderColorGradeLabel({ color: 'Blue', community_grade: null })).toBe('the blue')
  })
  it('drops the missing half when only a grade is known', () => {
    expect(boulderColorGradeLabel({ color: null, community_grade: '6C' })).toBe('the 6C')
  })
  it('falls back to "a boulder" when neither is known', () => {
    // Not to the boulder's title: names were removed from the app, so a title
    // is a wall angle and would read "the overhang".
    expect(boulderColorGradeLabel({ color: null, community_grade: null })).toBe('a boulder')
  })
  it('treats empty strings as missing', () => {
    expect(boulderColorGradeLabel({ color: '', community_grade: '' })).toBe('a boulder')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/utils/__tests__/boulders.test.ts`

Expected: FAIL. The import of `boulderColorGradeLabel` is unresolved, so every test in the new `describe` errors with a message naming `boulderColorGradeLabel` (typically `TypeError: boulderColorGradeLabel is not a function`). The pre-existing `boulderTitle` and `countMembersByBoulder` tests must still pass.

- [ ] **Step 3: Write the minimal implementation**

Append to `src/utils/boulders.ts`:

```ts
/**
 * "the blue 6C" — how a climber refers to a boulder out loud, for a sentence
 * that has to name one ("Ada posted beta on the blue 6C").
 *
 * The colour is lowercased because it appears mid-sentence; the grade is left
 * exactly as stored, since grades are written "6C" and "V4".
 *
 * Falls back to "a boulder" rather than to the boulder's title: names were
 * removed from the app, so a title is a wall angle or a generic label and would
 * read "the overhang". Same fallback FeedCard uses.
 */
export function boulderColorGradeLabel(
  b: { color: string | null; community_grade: string | null },
): string {
  const colorGrade = [b.color?.toLowerCase(), b.community_grade].filter(Boolean).join(' ')
  return colorGrade ? `the ${colorGrade}` : 'a boulder'
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/__tests__/boulders.test.ts`

Expected: PASS, all tests in the file.

- [ ] **Step 5: Point `BetaRequestsSection` at the shared util**

In `src/components/BetaRequestsSection.tsx`, add the import below the existing `betaRequests` import (line 5):

```ts
import { boulderColorGradeLabel } from '../utils/boulders'
```

Delete this whole block (lines 31-40) — the doc comment moved into the util:

```ts
/** "the blue 6C", falling back to the summary's own title. */
function boulderLabel(r: BetaRequest): string {
  const colorGrade = [r.boulder.color?.toLowerCase(), r.boulder.community_grade]
    .filter(Boolean)
    .join(' ')
  // Falling back to boulder.title would read "stuck on Shared boulder" or "stuck
  // on overhang", since names were removed and the title is then a wall angle or
  // a generic label. "a boulder" is the same fallback FeedCard uses.
  return colorGrade ? `the ${colorGrade}` : 'a boulder'
}
```

Change the one call site (in the JSX, inside the `shown.map`) from:

```tsx
                  <span className="font-medium">{boulderLabel(r)}</span>
```

to:

```tsx
                  <span className="font-medium">{boulderColorGradeLabel(r.boulder)}</span>
```

- [ ] **Step 6: Verify the build and lint**

Run: `npm run build`
Expected: exit 0. `noUnusedLocals` catches a leftover `boulderLabel` or a now-unused `BetaRequest` type import, so a clean build confirms the removal was complete.

Run: `npm run lint 2>&1 | tail -3`
Expected: still `✖ 16 problems (15 errors, 1 warning)` — the baseline, unchanged. If your own re-measured baseline differed, match that number instead.

- [ ] **Step 7: Commit**

```bash
git add src/utils/boulders.ts src/utils/__tests__/boulders.test.ts src/components/BetaRequestsSection.tsx
git commit -m "Extract the \"the blue 6C\" boulder label into a tested util

An inbox row needs the same string BetaRequestsSection built privately.
Same behaviour, including the \"a boulder\" fallback and why it isn't the
boulder's title."
```

---

## Task 2: `betaNotificationText`

The whole of the spec's §4 copy table, as a pure function. It exists so the four-cell branch is unit-testable and so `AppBar`'s `describe()` stays one line per case.

**Files:**
- Create: `src/utils/betaNotification.ts`
- Create: `src/utils/__tests__/betaNotification.test.ts`

**Interfaces:**
- Consumes: `riskMoveLabel(id: string | null): string` from `src/utils/riskMoves.ts`. It returns `''` for null, and falls back to the raw id for an unrecognised one.
- Produces:
  ```ts
  export type BetaNotificationType = 'beta_answered' | 'beta_on_project'
  export interface BetaNotificationInput {
    type: BetaNotificationType
    kind: string | null
    actor: string
    label: string
    gym: string | null
    body: string | null
    riskMove: string | null
  }
  export function betaNotificationText(input: BetaNotificationInput): { text: string; detail?: string }
  ```
  The return shape matches what `AppBar`'s `describe()` already returns, so Task 3 can return it directly.

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/betaNotification.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { betaNotificationText } from '../betaNotification'

// The shared half of every case: only the fields under test vary.
const base = {
  actor: 'Ada',
  label: 'the blue 6C',
  gym: 'Klatreverket',
  body: null,
  riskMove: null,
} as const

describe('betaNotificationText', () => {
  it('tells an asker their ask was answered', () => {
    const { text } = betaNotificationText({ ...base, type: 'beta_answered', kind: 'beta' })
    expect(text).toBe('Ada answered your ask for beta on the blue 6C at Klatreverket')
  })

  it('tells a projector, and says why they are hearing about it', () => {
    const { text } = betaNotificationText({ ...base, type: 'beta_on_project', kind: 'beta' })
    expect(text).toBe("Ada posted beta on the blue 6C at Klatreverket — you're working on it")
  })

  it('never calls a caution "beta" to an asker', () => {
    const { text } = betaNotificationText({ ...base, type: 'beta_answered', kind: 'caution' })
    expect(text).toBe(
      'Ada flagged a move to watch out for on the blue 6C at Klatreverket — you asked for beta ⚠️',
    )
    expect(text).not.toContain('beta on')
  })

  it('never calls a caution "beta" to a projector', () => {
    const { text } = betaNotificationText({ ...base, type: 'beta_on_project', kind: 'caution' })
    expect(text).toBe(
      "Ada flagged a move to watch out for on the blue 6C at Klatreverket — you're working on it ⚠️",
    )
    expect(text).not.toContain('posted beta')
  })

  it('omits the gym clause when the gym is unknown', () => {
    const { text } = betaNotificationText({ ...base, gym: null, type: 'beta_answered', kind: 'beta' })
    expect(text).toBe('Ada answered your ask for beta on the blue 6C')
    expect(text).not.toContain(' at ')
  })

  it('quotes the tip as the detail line', () => {
    const { detail } = betaNotificationText({
      ...base, type: 'beta_on_project', kind: 'beta', body: 'heel hook the arête',
    })
    expect(detail).toBe('"heel hook the arête"')
  })

  it('has no detail line for a video-only beta', () => {
    // body is null when a beta is a bare video link — 052's constraint allows it.
    const { detail } = betaNotificationText({ ...base, type: 'beta_on_project', kind: 'beta' })
    expect(detail).toBeUndefined()
  })

  it('treats a whitespace-only tip as no tip', () => {
    const { detail } = betaNotificationText({
      ...base, type: 'beta_on_project', kind: 'beta', body: '   ',
    })
    expect(detail).toBeUndefined()
  })

  it('shows the risk move as the detail line for a caution, not the tip', () => {
    const { detail } = betaNotificationText({
      ...base, type: 'beta_answered', kind: 'caution',
      riskMove: 'heel_hook', body: 'go static instead',
    })
    expect(detail).toBe('Heel-hook / drop-knee')
  })

  it('falls back to the raw risk move id when it is not in the vocabulary', () => {
    // 090 constrains risk_move to seven ids, so this is defence against a row
    // written before a future id is added to the client's RISK_MOVES.
    const { detail } = betaNotificationText({
      ...base, type: 'beta_answered', kind: 'caution', riskMove: 'mantel',
    })
    expect(detail).toBe('mantel')
  })

  it('has no detail line for a caution with no move', () => {
    // 090's boulder_beta_caution_shape forbids this, so it is pure defence.
    const { detail } = betaNotificationText({ ...base, type: 'beta_answered', kind: 'caution' })
    expect(detail).toBeUndefined()
  })

  it('reads an unknown kind as a plain beta', () => {
    // A future kind must degrade to the neutral sentence, never to caution
    // wording that would claim a hazard nobody reported.
    const { text } = betaNotificationText({ ...base, type: 'beta_answered', kind: 'mystery' })
    expect(text).toBe('Ada answered your ask for beta on the blue 6C at Klatreverket')
  })

  it('reads a missing kind as a plain beta', () => {
    const { text } = betaNotificationText({ ...base, type: 'beta_on_project', kind: null })
    expect(text).toBe("Ada posted beta on the blue 6C at Klatreverket — you're working on it")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/utils/__tests__/betaNotification.test.ts`

Expected: FAIL — `Failed to resolve import "../betaNotification"`. The file does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Create `src/utils/betaNotification.ts`:

```ts
import { riskMoveLabel } from './riskMoves'

/**
 * The two ways a climber comes to hear about beta on a boulder they didn't post
 * it on: they asked for it, or they're working on the boulder.
 */
export type BetaNotificationType = 'beta_answered' | 'beta_on_project'

export interface BetaNotificationInput {
  type: BetaNotificationType
  /** `boulder_beta.kind`. Anything other than 'caution' reads as a plain beta. */
  kind: string | null
  /** The poster's display name, already resolved. */
  actor: string
  /** From `boulderColorGradeLabel` — "the blue 6C", or "a boulder". */
  label: string
  gym: string | null
  /** The tip itself, already truncated server-side. Null for a video-only beta. */
  body: string | null
  /** `boulder_beta.risk_move`. Null for a plain beta. */
  riskMove: string | null
}

/**
 * The sentence and detail line for a beta notification.
 *
 * Two rules the tests pin down:
 *
 * 1. A caution is a KIND of beta in the schema (090), but calling one "beta" in
 *    the inbox misleads the reader about what they're opening — so a caution
 *    gets its own sentence, and an unknown kind degrades to the plain-beta
 *    wording rather than to caution wording that would claim a hazard nobody
 *    reported.
 * 2. Every sentence says WHY this climber is being told, because an unexplained
 *    ping about someone else's boulder reads as noise.
 */
export function betaNotificationText(
  input: BetaNotificationInput,
): { text: string; detail?: string } {
  const { type, kind, actor, label, gym, body, riskMove } = input

  // A climber logs at more than one gym, so the row has to say which.
  const where = gym ? ` at ${gym}` : ''
  // Em dash, matching session_group_invite's "— accept to join in".
  const why = type === 'beta_answered' ? ' — you asked for beta' : " — you're working on it"

  if (kind === 'caution') {
    // The move is the subject, never an injury (090). riskMoveLabel returns ''
    // for a missing move, which becomes no detail line at all.
    const move = riskMoveLabel(riskMove)
    return {
      text: `${actor} flagged a move to watch out for on ${label}${where}${why} ⚠️`,
      detail: move || undefined,
    }
  }

  // An asker already knows why they're being told — they asked — so their
  // sentence carries no trailing clause.
  const text = type === 'beta_answered'
    ? `${actor} answered your ask for beta on ${label}${where}`
    : `${actor} posted beta on ${label}${where}${why}`

  const tip = body?.trim()
  return { text, detail: tip ? `"${tip}"` : undefined }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/__tests__/betaNotification.test.ts`

Expected: PASS, 13 tests.

- [ ] **Step 5: Verify the whole suite and lint**

Run: `npx vitest run`
Expected: PASS. No pre-existing test regresses.

Run: `npm run lint 2>&1 | tail -3`
Expected: the baseline, unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/utils/betaNotification.ts src/utils/__tests__/betaNotification.test.ts
git commit -m "Add the beta-notification copy as a tested pure util

The four-cell branch in the spec's copy table, extracted so it can be
tested — only pure utils are tested here. Pins the rule that a caution is
never called \"beta\" to the reader, and that an unknown kind degrades to
the plain-beta sentence rather than claiming a hazard."
```

---

## Task 3: Notification types, icon, copy dispatch and routing

Registers the two types and wires them into the inbox. No rows of these types exist until Task 4, so this task is safe to deploy on its own — which is exactly the release order §8 of the spec calls for.

**Files:**
- Modify: `src/types/index.ts:162-184` (the `NotificationType` union)
- Modify: `src/components/AppBar.tsx` — imports (~line 18), `ICONS` (104-126), `describe` (128-196), `routeFor` (198-235), `navState` (281-286)

**Interfaces:**
- Consumes: `boulderColorGradeLabel` (Task 1) and `betaNotificationText` (Task 2). `BetaNotificationType` is not imported — the two `case` labels narrow `n.type` to a structurally identical union, so it passes without an annotation.
- Produces: the `NotificationType` values `'beta_answered'` and `'beta_on_project'`, which Task 4's migration writes into `notifications.type`.

- [ ] **Step 1: Add the two union members**

In `src/types/index.ts`, the union currently ends:

```ts
  | 'session_join_request'
  | 'session_join_approved'
```

Append the two new members so it ends:

```ts
  | 'session_join_request'
  | 'session_join_approved'
  | 'beta_answered'
  | 'beta_on_project'
```

- [ ] **Step 2: Run the build to see the exhaustiveness error**

Run: `npm run build`

Expected: FAIL. `ICONS` is declared `Record<Notification['type'], string>`, so `tsc` reports something like `Property 'beta_answered' is missing in type ...` at `src/components/AppBar.tsx:104`. This is the type system telling you the icon map is now incomplete — that is the point of this step.

- [ ] **Step 3: Add the imports and the icons**

In `src/components/AppBar.tsx`, add two imports after the existing `riskMoveLabel` import (line 18):

```ts
import { boulderColorGradeLabel } from '../utils/boulders'
import { betaNotificationText } from '../utils/betaNotification'
```

Add two entries at the end of `ICONS`, after `boulder_caution: '⚠️',`:

```ts
  beta_answered: '💡',
  beta_on_project: '👀',
```

- [ ] **Step 4: Add the copy dispatch**

In `describe()`, insert these cases immediately before the `default:` branch (i.e. after the `case 'session_join_approved':` return):

```ts
    case 'beta_answered':
    case 'beta_on_project':
      // Both switch labels narrow n.type to exactly the util's input union.
      return betaNotificationText({
        type: n.type,
        kind: d.kind ?? null,
        actor: username,
        label: boulderColorGradeLabel({
          color: d.color ?? null,
          community_grade: d.community_grade ?? null,
        }),
        gym: d.gym ?? null,
        body: d.body ?? null,
        riskMove: d.risk_move ?? null,
      })
```

Do **not** remove the existing `riskMoveLabel` import — `case 'boulder_caution'` still uses it.

- [ ] **Step 5: Add the route**

In `routeFor()`, insert immediately before the `default:` branch (after `case 'boulder_caution': return n.entity_id ? ... : null`):

```ts
    case 'beta_answered':
    case 'beta_on_project':
      return n.entity_id ? `/gym-problems/${n.entity_id}` : null
```

- [ ] **Step 6: Land the tap on the Beta tab**

The `navState` ternary in `NotificationRow` currently reads:

```ts
    const navState = notification.type === 'variation_cleared'
      ? { state: { openTab: 'variations' } satisfies BoulderNavState }
      : notification.type === 'boulder_caution'
      ? { state: { openTab: 'beta' } satisfies BoulderNavState }
      : undefined
```

A third type wanting the Beta tab makes the chain worth naming. Add this constant just below `ICONS` (module scope, near the other module constants):

```ts
/**
 * Notification types whose reason for existing lives on the boulder's Beta tab —
 * a watch-out, or beta someone posted. Landing on the default Sendtrain tab
 * would leave the thing you tapped for three taps away.
 */
const BETA_TAB_TYPES: Notification['type'][] = [
  'boulder_caution',
  'beta_answered',
  'beta_on_project',
]
```

and replace the ternary with:

```ts
    const navState = notification.type === 'variation_cleared'
      ? { state: { openTab: 'variations' } satisfies BoulderNavState }
      : BETA_TAB_TYPES.includes(notification.type)
      ? { state: { openTab: 'beta' } satisfies BoulderNavState }
      : undefined
```

Leave the surrounding comment block above `navState` in place; it still describes exactly this behaviour.

- [ ] **Step 7: Verify the build, tests and lint**

Run: `npm run build`
Expected: exit 0.

Run: `npx vitest run`
Expected: PASS.

Run: `npm run lint 2>&1 | tail -3`
Expected: the baseline, unchanged.

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/components/AppBar.tsx
git commit -m "Render and route the two beta notification types

Registers beta_answered and beta_on_project, gives each an icon, and lands
a tap on the boulder's Beta tab — where the beta that caused the row lives.
No rows of these types exist until migration 091, so this is safe to deploy
ahead of it, which is the order the spec's release gate wants."
```

---

## Task 4: Migration 091 — decide who hears about a new beta

The server half. Fires on every `boulder_beta` insert and writes the rows Task 3 renders.

**Files:**
- Create: `supabase/migrations/091_notify_beta_recipients.sql`

**Interfaces:**
- Consumes: `boulder_beta.kind` and `.risk_move` (090); `gym_problem_help` (057); `problems.gym_problem_id` and `.sent` (001, 044); `gym_problems.status`, `.expires_at`, `.gym`, `.color`, `.community_grade` (044); `notifications` (037). Uses the `notifications.type` string values Task 3 registered.
- Produces: `public.notify_beta_recipients()` and the trigger `on_boulder_beta_notify_recipients`.

No new indexes are needed: `problems_gym_problem_idx on problems (gym_problem_id)` exists (044:30), `gym_problem_help` is primary-keyed on `(gym_problem_id, user_id)` (057), and `notifications_unread_idx on notifications (recipient_id) where read_at is null` exists (037).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/091_notify_beta_recipients.sql`:

```sql
-- Beta reaches the climber who needs it. When a beta is posted on a live shared
-- boulder, tell the climbers who have a reason to care — rather than leaving it
-- on the boulder page to be discovered.
--
-- Two audiences, both already tracked by the schema, and deliberately disjoint:
--
--   asked      an open gym_problem_help row (057). They said "I'm stuck".
--   projecting a problems row on this boulder with no sent go. This is the
--              app's own definition of a project, per the comment in
--              src/hooks/useDiscoverBoulders.ts: "Done = at least one sent go.
--              A claimed-but-unsent boulder is still a project."
--
-- "asked" wins the overlap, so one beta is never two rows for one climber.
--
-- Set-based inserts rather than a loop over create_notification (037) — the
-- shape 038_video_notifications.sql uses for a fan-out. The
-- `user_id <> new.user_id` predicates supply the self-skip that
-- create_notification would otherwise have given: you are not pinged for your
-- own beta.
--
-- REQUIRES 090: reads boulder_beta.kind and .risk_move. Applying this before
-- 090 fails.

create or replace function public.notify_beta_recipients()
returns trigger as $$
declare
  v_gym   text;
  v_color text;
  v_grade text;
  v_data  jsonb;
begin
  -- Live boulders only: the SQL mirror of isActiveBoulder
  -- (src/utils/gymProblems.ts), expiry day inclusive to match the "N days left"
  -- display. A stripped or expired boulder pings nobody — there is nothing left
  -- on the wall to try.
  select gp.gym, gp.color, gp.community_grade
    into v_gym, v_color, v_grade
    from public.gym_problems gp
   where gp.id = new.gym_problem_id
     and gp.status = 'active'
     and gp.expires_at >= current_date;

  if not found then
    return new;
  end if;

  v_data := jsonb_build_object(
    'gym', v_gym,
    'color', v_color,
    'community_grade', v_grade,
    -- The client needs the kind to pick its wording: a caution is a kind of
    -- beta here, but calling one "beta" to the reader misleads them.
    'kind', new.kind,
    'risk_move', new.risk_move,
    -- An inbox row renders one line, and this payload is copied into every
    -- recipient's row — so store a snippet, not the whole tip.
    'body', left(new.body, 140)
  );

  -- ── asked: an open help request ────────────────────────────────────────────
  -- Never collapsed. You asked, so every answer earns a ping, and it
  -- self-limits: 057's resolve_help_on_beta_worked closes the request the
  -- moment you mark a beta worked.
  insert into public.notifications (recipient_id, actor_id, type, entity_id, data)
  select h.user_id, new.user_id, 'beta_answered', new.gym_problem_id, v_data
    from public.gym_problem_help h
   where h.gym_problem_id = new.gym_problem_id
     and h.resolved_at is null
     and h.user_id <> new.user_id;

  -- ── projecting: claimed, not sent, and not already told as an asker ────────
  -- `distinct` because a climber may hold several problems rows for one boulder,
  -- one per session, and that must be one notification rather than one each.
  --
  -- Suppressed when this climber already holds an UNREAD beta_on_project for
  -- this boulder. Nothing rate-limits beta inserts, so without this one climber
  -- posting ten thin tips stacks ten rows on everyone on the boulder. Reading
  -- the row makes them eligible again, and nothing is lost: opening the boulder
  -- shows every beta, so a collapsed burst costs only a name in one sentence.
  --
  -- This is a check-then-write, which this schema avoids for beta_points. The
  -- difference is the stake: a lost race here writes one duplicate inbox row,
  -- not points, so a constraint is not worth carrying.
  --
  -- Scoped to beta_on_project only, so an unread projector ping can never
  -- swallow the answer to an explicit ask.
  insert into public.notifications (recipient_id, actor_id, type, entity_id, data)
  select distinct p.user_id, new.user_id, 'beta_on_project', new.gym_problem_id, v_data
    from public.problems p
   where p.gym_problem_id = new.gym_problem_id
     and p.user_id <> new.user_id
     and not exists (
       select 1 from public.problems s
        where s.gym_problem_id = new.gym_problem_id
          and s.user_id = p.user_id
          and s.sent = true
     )
     and not exists (
       select 1 from public.gym_problem_help h
        where h.gym_problem_id = new.gym_problem_id
          and h.user_id = p.user_id
          and h.resolved_at is null
     )
     and not exists (
       select 1 from public.notifications n
        where n.recipient_id = p.user_id
          and n.type = 'beta_on_project'
          and n.entity_id = new.gym_problem_id
          and n.read_at is null
     );

  -- No `raise` anywhere above, deliberately: this trigger fires inside the
  -- climber's beta insert, and it must never be the reason their tip is
  -- rejected.
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists on_boulder_beta_notify_recipients on boulder_beta;
create trigger on_boulder_beta_notify_recipients
  after insert on boulder_beta
  for each row execute procedure public.notify_beta_recipients();

-- ── smoke ────────────────────────────────────────────────────────────────────
-- A plpgsql body is NOT validated at CREATE, so this migration can apply
-- perfectly clean and notify_beta_recipients() still raise on the first real
-- beta — a mistyped column, a table outside the search_path. A trigger function
-- cannot be called directly ("trigger functions can only be called as
-- triggers"), so plan and execute the same queries here against an id that
-- matches nothing: every column reference is resolved, and zero rows are
-- touched.
do $$
declare
  v_none uuid := '00000000-0000-0000-0000-000000000000';
  v_n    bigint;
begin
  perform gp.gym, gp.color, gp.community_grade
     from public.gym_problems gp
    where gp.id = v_none and gp.status = 'active' and gp.expires_at >= current_date;

  -- Fails loudly here, now, if 090 was skipped.
  perform b.kind, b.risk_move from public.boulder_beta b where b.id = v_none;

  select count(*) into v_n
    from public.gym_problem_help h
   where h.gym_problem_id = v_none
     and h.resolved_at is null
     and h.user_id <> v_none;

  select count(*) into v_n
    from public.problems p
   where p.gym_problem_id = v_none
     and p.user_id <> v_none
     and not exists (select 1 from public.problems s
                      where s.gym_problem_id = v_none and s.user_id = p.user_id and s.sent = true)
     and not exists (select 1 from public.gym_problem_help h
                      where h.gym_problem_id = v_none and h.user_id = p.user_id
                        and h.resolved_at is null)
     and not exists (select 1 from public.notifications n
                      where n.recipient_id = p.user_id and n.type = 'beta_on_project'
                        and n.entity_id = v_none and n.read_at is null);

  raise notice 'notify_beta_recipients: all queries planned and ran (% rows, expected 0)', v_n;
end $$;
```

- [ ] **Step 2: Check the SQL parses**

There is no local Postgres in this project and migrations are applied by hand, so the check available to you is a read-through against the schema. Confirm each referenced column exists:

```bash
grep -n "kind\|risk_move" supabase/migrations/090_caution_beta.sql | head -5
grep -n "resolved_at\|user_id\|gym_problem_id" supabase/migrations/057_beta_help.sql | head -5
grep -n "status\|expires_at\|community_grade" supabase/migrations/044_gym_problems.sql | head -5
grep -n "recipient_id\|actor_id\|entity_id\|read_at" supabase/migrations/037_notifications.sql | head -5
```

Expected: every column named in the migration appears. **Do not attempt to apply the migration** — that is done by hand in the Supabase dashboard.

- [ ] **Step 3: Verify the build and lint are untouched**

Run: `npm run build`
Expected: exit 0. `tsconfig` covers `src` only, so a `.sql` file cannot affect it — this confirms nothing else drifted.

Run: `npm run lint 2>&1 | tail -3`
Expected: the baseline, unchanged.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/091_notify_beta_recipients.sql
git commit -m "Notify askers and projectors when beta lands on their boulder

One trigger on boulder_beta over two disjoint audiences the schema already
tracks: an open gym_problem_help row, and a claimed-but-unsent problems row.
Live boulders only. The projector ping collapses while unread so a burst of
thin tips can't stack rows on the whole boulder; the answer to an explicit
ask never collapses.

Requires 090 — reads boulder_beta.kind."
```

---

## Task 5: Manual pass

The only verification for the trigger and the rendered row, since hooks and components are not unit-tested here. **This task cannot start until 089 → 090 → 091 are applied in the Supabase dashboard** (check the dashboard; it is the only authority on what is actually applied).

**Files:** none.

- [ ] **Step 1: Apply the migrations**

In the Supabase dashboard, apply every outstanding migration in numeric order up to and including 091. Confirm 091's smoke block emits its `notice` and does not raise.

- [ ] **Step 2: Walk the asker path**

Two accounts, A and B, at the same gym, on one active shared boulder, on a **phone-width viewport** (this is a phone-in-a-gym app; a desktop-only check is not a check).

1. As A, open the boulder's Beta tab and ask for beta with a note.
2. As B, post a plain beta with a tip.
3. As A, without reloading: the bell badge increments live (`notifications` is in the realtime publication).
4. Open the bell. The row reads **"B answered your ask for beta on the blue 6C at <gym>"** with a 💡 badge and the tip quoted beneath.
5. Tap it. You land on `/gym-problems/<id>` **on the Beta tab**, not Sendtrain.

- [ ] **Step 3: Walk the projector path and the collapse**

1. As A, mark B's beta worked (this closes A's help request, per 057).
2. As A, log a go on the boulder with **sent unchecked** — A is now projecting, not asking.
3. As B, post a second beta. A's row reads **"B posted beta on the blue 6C at <gym> — you're working on it"** with a 👀 badge.
4. As B, post a **third** beta while A has not read the row. A must still have exactly **one** `beta_on_project` row for this boulder — the collapse working.
5. As A, open the bell (marking all read), then have B post a fourth beta. A gets a new row — eligibility restored.

- [ ] **Step 4: Walk the caution path**

1. As B, post a caution with a risk move.
2. A's row reads **"B flagged a move to watch out for on the blue 6C at <gym> — you're working on it ⚠️"**, detail line showing the move label, ⚠️ badge, and tapping lands on the Beta tab.
3. If B is a setter at that gym, confirm B is not pinged for their own caution, and that a setter who is *also* projecting the boulder sees both rows — the ⚠️ setter ping from 090 and this one. This is expected and was chosen deliberately.

- [ ] **Step 5: Walk the negative cases**

1. As A, log a **sent** go on a boulder. As B, post beta on it. A gets **nothing** — a sender is done.
2. On a boulder A has never claimed and never asked about, B posts beta. A gets **nothing**.
3. Strip (archive) a boulder A is projecting, then as B post beta on it. A gets **nothing**.
4. As B, post beta on a boulder **B** is projecting. B is not pinged for their own beta.

- [ ] **Step 6: Report**

Record which steps passed and which did not, with what you actually saw. Do not report the feature working on the strength of the steps you skipped.

---

## Release Gate

Restating the spec's §8, because getting this wrong is the one way this branch breaks production:

1. **Deploy the client first.** Tasks 1-3 are harmless without the migration: no rows of the new types exist yet. Deploying first means no row ever lands in an inbox that cannot render it. (A stale client degrades to *"Someone did something new"* with no badge emoji rather than throwing — but that is a degradation, not a feature.)
2. **Then apply migrations by hand in the Supabase dashboard**, in numeric order, up to and including 091. The hard dependency is **090 before 091**.
3. **Then walk Task 5.**

Pushing `main` auto-deploys via Vercel — a push is a release. `api/` is type-checked separately by Vercel, so a green local build does not guarantee a green deploy; this branch touches no `api/` file, so that risk is unchanged here.
