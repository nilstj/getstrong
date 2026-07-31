# Variation → Boulder Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a variation seen in `/challenges` say which gym and which boulder it belongs to and link through to it, and stop a boulder delete from silently leaving its variations orphaned.

**Architecture:** One FK embed carries the boulder's gym and colours onto the challenge rows the Challenges tab already fetches; the card displays them and the detail sheet links through. One migration reproduces `delete_gym_problem` with a guard that refuses when another climber has cleared a variation, and an explicit delete of the setter's own variations so `on delete set null` can never orphan them.

**Tech Stack:** React 18 + TypeScript, Vite, React Query, Supabase (Postgres + RLS), Tailwind (`sage` palette), `react-hot-toast`, `react-router-dom`.

**Spec:** [docs/superpowers/specs/2026-07-31-variation-boulder-link-design.md](../specs/2026-07-31-variation-boulder-link-design.md)

## Global Constraints

- **Vocabulary:** a *variation* is a challenge anchored to a shared boulder; a *challenge* is the portable dare at `/challenges`. User-facing copy must not call one the other. The schema keeps saying `challenges`.
- **Build:** `npm run build` is `tsc -b && vite build`. `noUnusedLocals` and `noUnusedParameters` are ON — an unused local or import is a build-failing error. `api/` is checked separately by Vercel; this plan touches no `api/` files.
- **Lint:** `npm run lint` has a baseline of pre-existing problems. **Measure it yourself before starting** (`npm run lint 2>&1 | grep problems`) and add **zero**. Do not trust a number quoted anywhere else.
- **Tests:** Vitest, and **only pure functions in `src/utils/`** are tested. There is no `@testing-library/react`. This change adds no pure function — the chip is presentation and the guard is SQL — so it adds **no tests**, and that is correct, not a gap. Verification is `npm run build` plus the manual pass at the end.
- **Migrations are applied by hand in the Supabase dashboard**, never by tooling from this repo. Writing the `.sql` file is the deliverable.
- **Invalid markup to avoid:** a `<button>` or an `<a>` nested inside another `<button>`. The `/challenges` card is a `<button>`.
- **A missing gym is meaningful.** Only a variation has a boulder; a portable challenge has none, and that absence means "anywhere". A portable challenge's card and sheet must render exactly as they do today — no empty chip, no placeholder, no "unknown gym".

---

### Task 1: Migration 078 — a delete can no longer orphan a variation

**Files:**
- Create: `supabase/migrations/078_delete_gym_problem_variations.sql`
- Modify: `src/pages/CrewPage.tsx` (the delete confirmation string, around line 527)

**Interfaces:**
- Consumes: `delete_gym_problem(p_gym_problem_id uuid)` from migration 070, which this replaces; `challenges.gym_problem_id` from 076; `challenge_attempts` from 003.
- Produces: nothing consumed by later tasks. The function's signature is unchanged, so the client call site in `useGymProblems` does not move.

- [ ] **Step 1: Read the function being replaced**

Run: `cat supabase/migrations/070_delete_gym_problem.sql`

You are reproducing this function with two additions. Note its existing order of checks — authenticated, then setter-owns-it, then nobody-else-has-logged-it — and that it ends with `delete from gym_problems`. Keep all of that.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/078_delete_gym_problem_variations.sql`:

```sql
-- Deleting a shared boulder must never leave a variation orphaned.
--
-- challenges.gym_problem_id is ON DELETE SET NULL (076), so before this migration
-- deleting a boulder silently turned every variation on it into a portable
-- challenge with no gym, no colour and no marker -- a challenge titled "no heel
-- hook on the arête" that nobody can place. Worse, 070's guard could not see it:
-- clearing a variation writes only challenge_attempts, never a problems row, so
-- other climbers' clears never blocked the delete.
--
-- Reproduces 070's delete_gym_problem and adds one guard plus one cleanup step.
-- Table references are qualified and search_path is pinned, matching the
-- hardening the newer migrations use. Signature unchanged, so no client call
-- site moves.
--
-- ORDER: apply after 074, 075, 076 and 077.

create or replace function public.delete_gym_problem(p_gym_problem_id uuid)
returns void as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.gym_problems
     where id = p_gym_problem_id and created_by = v_user
  ) then
    raise exception 'Only the setter can delete this boulder';
  end if;

  if exists (
    select 1 from public.problems
     where gym_problem_id = p_gym_problem_id and user_id <> v_user
  ) then
    raise exception 'Others have logged this boulder — mark it stripped instead';
  end if;

  -- A variation someone else has cleared carries their proof clips. Never destroy
  -- those -- strip archives the boulder and keeps everything.
  if exists (
    select 1 from public.challenge_attempts a
      join public.challenges c on c.id = a.challenge_id
     where c.gym_problem_id = p_gym_problem_id
       and a.user_id <> v_user
  ) then
    raise exception 'Others have cleared a variation on this boulder — mark it stripped instead';
  end if;

  -- Otherwise every variation here is the setter's own with no outside clears, so
  -- take them with the boulder rather than letting ON DELETE SET NULL orphan them.
  -- challenge_attempts cascades off challenges (003).
  delete from public.challenges where gym_problem_id = p_gym_problem_id;

  delete from public.gym_problems where id = p_gym_problem_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;
```

- [ ] **Step 3: Update the confirmation the setter actually reads**

In `src/pages/CrewPage.tsx`, the delete confirm currently reads:

```
'Delete this boulder for everyone? Removes its beta, reviews and comments. Your own logged sends stay in your sessions. Only works if no one else has logged it.'
```

It is now also true that your own variations go with the boulder, and that the delete can be refused because of a variation. Replace it with exactly:

```
'Delete this boulder for everyone? Removes its beta, reviews, comments and any variations you set on it. Your own logged sends stay in your sessions. Only works if no one else has logged it or cleared one of your variations.'
```

This keeps the original's shape and its two existing facts, and adds the two new ones. Do not change any other part of that button or its handler — the new guard's message reaches the user through the existing `onError` toast and already reads as a sentence.

- [ ] **Step 4: Read the migration back against three scenarios**

There is no local database, so this step is a careful read, not a run. Confirm by eye that each of these behaves as intended, and record the reasoning in your report:

1. Setter deletes a boulder with **one of their own variations, no clears by anyone else** → both guards pass, the `delete from public.challenges` removes the variation, its `challenge_attempts` cascade, the boulder goes. No orphan.
2. Setter deletes a boulder whose variation **another climber has cleared** → the new guard raises, nothing is deleted, and the message names stripping as the alternative.
3. Setter deletes a boulder with **no variations at all** → both new statements are no-ops and behaviour is identical to migration 070.

Also confirm the ordering point: the variation delete must come **before** the `delete from public.gym_problems`, or the FK's `set null` fires first and the subsequent delete matches nothing.

- [ ] **Step 5: Verify the client still builds**

Run: `npm run build`
Expected: exit 0.

Run: `npm run lint 2>&1 | grep problems`
Expected: the count you measured before starting.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/078_delete_gym_problem_variations.sql src/pages/CrewPage.tsx
git commit -m "Add migration 078: deleting a boulder no longer orphans its variations"
```

---

### Task 2: The boulder chip on the Challenges tab

**Files:**
- Modify: `src/types/index.ts` (the `Challenge` interface, around line 63)
- Modify: `src/hooks/useChallenges.ts` (the two selects in `useChallenges`, lines 13-15)
- Modify: `src/pages/ChallengesPage.tsx` (`renderChallengeCard`'s tag row, and `ChallengeDetail` around line 431)

**Interfaces:**
- Consumes: `challenges.gym_problem_id` (migration 076); `gym_problems.gym`, `.color`, `.hold_color`; `ProblemColorIcons` from `src/components/Chip.tsx`, which takes `{ color, holdColor, size, className }`.
- Produces: `Challenge.gym_problems?: { gym: string; color: string | null; hold_color: string | null } | null`.

- [ ] **Step 1: Add the embedded shape to the type**

In `src/types/index.ts`, in the `Challenge` interface, after `gym_problem_id`:

```ts
  gym_problem_id: string | null
  /** The anchored boulder's identity, from the FK embed in useChallenges. Null on
   *  a portable challenge — and that absence means "anywhere", not "unknown". */
  gym_problems?: { gym: string; color: string | null; hold_color: string | null } | null
```

- [ ] **Step 2: Embed the boulder in both challenge queries**

In `src/hooks/useChallenges.ts`, `useChallenges` runs two queries in a `Promise.all`. Change both selects from `'*'` to:

```ts
'*, gym_problems(gym, color, hold_color)'
```

so the public query reads `.select('*, gym_problems(gym, color, hold_color)').eq('is_public', true)…` and the private one the same. Leave the rest of both queries, and every other function in the file, untouched — `useCreateChallenge`, `useUpdateChallenge` and the rest must keep their current selects.

`challenges.gym_problem_id` is a real foreign key to `gym_problems.id`, so PostgREST resolves this as a to-one embed and returns an object or `null`, not an array. If the manual pass shows an array arriving instead, the type and the two render sites are what need adjusting — nothing else.

- [ ] **Step 3: Show gym and colours on the card**

In `src/pages/ChallengesPage.tsx`, add the imports you will need for this step and the next:

```ts
import { Link } from 'react-router-dom'
import { ProblemColorIcons } from '../components/Chip'
```

Then, in `renderChallengeCard`, replace the existing variation marker — the block that renders `🧩 Variation` inside the flex-wrap row that also holds the badge and the tags — with:

```tsx
          {challenge.gym_problems && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sage-700 bg-sage-50 border border-sage-200 rounded-full px-1.5 py-px">
              🧩 {challenge.gym_problems.gym}
              <ProblemColorIcons
                color={challenge.gym_problems.color}
                holdColor={challenge.gym_problems.hold_color}
                size={10}
              />
            </span>
          )}
```

Gym name first, colours after: the question this answers while scrolling is "can I do this where I am?".

It stays a `<span>`. The card is a `<button>`, so a nested `<button>` or `<a>` here would be invalid markup — and it costs nothing, because tapping the card already opens the detail sheet, which is where the link lives. Do not add an `onClick` to this chip.

- [ ] **Step 4: Link to the boulder from the detail sheet**

In `ChallengeDetail`, insert this directly above the existing `<TagPills tags={challenge.tags} />` line, so the boulder identity reads before the tags:

```tsx
      {challenge.gym_problems && challenge.gym_problem_id && (
        <Link
          to={`/gym-problems/${challenge.gym_problem_id}`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-sage-200 bg-sage-50 px-2.5 py-1.5 text-sm font-medium text-sage-700 hover:bg-sage-100"
        >
          🧩 On {challenge.gym_problems.gym}
          <ProblemColorIcons
            color={challenge.gym_problems.color}
            holdColor={challenge.gym_problems.hold_color}
            size={14}
          />
          <span className="text-xs text-sage-600">→ open the boulder</span>
        </Link>
      )}
```

Both conditions are needed: `gym_problems` supplies the label, `gym_problem_id` supplies the route.

- [ ] **Step 5: Verify build and lint**

Run: `npm run build`
Expected: exit 0. An unused-import error means one of the two imports from Step 3 has no consumer yet — both are used, `Link` in Step 4 and `ProblemColorIcons` in both steps.

Run: `npx vitest run`
Expected: all pass, unchanged — this task adds no tests and should break none.

Run: `npm run lint 2>&1 | grep problems`
Expected: the count you measured before starting.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/hooks/useChallenges.ts src/pages/ChallengesPage.tsx
git commit -m "Show a variation's gym and boulder on the Challenges tab"
```

---

## Release gate

**Migration 078 must be applied by hand in the Supabase dashboard.** The full outstanding order is **074 → 075 → 076 → 077 → 078**, with **076 and 077 applied together** (see the 2026-07-30 spec for why), and **074 never re-run after 076**.

078 is independent of the client: it only tightens a function the client already calls with an unchanged signature. Applying it early is harmless. Applying it late means a delete can still orphan a variation until it lands — though no variation can exist at all until 076 and 077 are in, so in practice the window is closed as long as 078 goes in with them.

## Manual verification pass

- [ ] A variation's card in `/challenges` shows `🧩 <gym>` and the boulder's colour icons; tapping anywhere on the card opens the challenge detail exactly as before.
- [ ] The detail sheet shows the same identity and its link opens `/gym-problems/:id`.
- [ ] A portable challenge's card and detail sheet are unchanged — no chip, no empty space where one would be.
- [ ] **Confirm the embed's shape.** PostgREST should return `gym_problems` as an object for this to-one foreign key. If it arrives as a single-element array the chip silently renders nothing — check one variation card actually shows its gym before trusting this.
- [ ] As the setter, delete a boulder carrying one of your own variations that nobody else has cleared: both go, and no context-free challenge is left behind in `/challenges`.
- [ ] As the setter, delete a boulder whose variation another climber has cleared: refused, with the "mark it stripped instead" message in a toast.
- [ ] Strip that same boulder instead: it archives, and the variation stays listed and read-only on the Variations tab.
- [ ] The delete confirmation text mentions that your own variations go with the boulder.
