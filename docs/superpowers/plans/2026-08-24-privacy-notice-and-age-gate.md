# Privacy Notice, Acceptance and Age Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tell people what the app does with their climbing before they sign up, record that they were told, and keep under-13s out.

**Architecture:** Three columns on `profiles` hold a versioned acceptance record. Email signups write it through `signUp` metadata and the existing `handle_new_user` trigger; Google signups and pre-existing accounts are caught by a `PolicyGate` route component. The notice and house rules are public routes so they can be read before an account exists.

**Tech Stack:** Postgres trigger, React Router v7 nested routes, React Query, Vitest for the pure utils.

**Spec:** `docs/superpowers/specs/2026-08-24-privacy-notice-and-age-gate-design.md`

## Global Constraints

- `noUnusedLocals` and `noUnusedParameters` are ON — an unused local is a build-failing error that fails the Vercel deploy.
- `npm run lint` must add **zero** new problems. Measure the baseline yourself first.
- Only pure functions in `src/utils/` get tests. Pages, components and hooks are verified by `npm run build` plus a manual pass.
- Migrations are applied by hand in the Supabase dashboard. Migration 089 must be applied **before** the client deploys, or acceptance writes fail against missing columns and every user is stuck at the gate.
- Copy rule: "log" is the private per-session action, "publish" the shared one. The notice must not claim published beta is deleted with the account — it is anonymised.
- The notice may assert **only** what the code actually does. If a claim can't be traced to code, it doesn't go in.
- Three facts are owner-supplied and unknown at implementation time: controller name, contact address, Supabase region. They live in exactly one place and render a visible warning until filled.

---

### Task 1: Migration 089 — acceptance columns and the trigger

**Files:**
- Create: `supabase/migrations/089_policy_acceptance.sql`

**Interfaces:**
- Produces: `profiles.policy_version text`, `profiles.policy_accepted_at timestamptz`, `profiles.age_confirmed_at timestamptz`; `handle_new_user()` now copies acceptance out of `raw_user_meta_data`

- [ ] **Step 1: Write the migration**

```sql
-- Versioned record of "this climber was told what the app does". Versioned so a
-- future revision of the notice can re-prompt everyone; without the version
-- there is no way to tell who read which text.

alter table profiles add column if not exists policy_version     text;
alter table profiles add column if not exists policy_accepted_at timestamptz;
alter table profiles add column if not exists age_confirmed_at    timestamptz;

-- Email signups tick the box before the account exists, so the acceptance
-- rides along in signUp's metadata and lands here -- otherwise they would tick
-- it at registration and then be asked again by PolicyGate on first login.
--
-- Google signups have no checkbox to tick (the button goes straight to Google)
-- and existing accounts predate all of this, so both still fall to PolicyGate.
-- The username line is unchanged from migration 002.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (
    id, username, policy_version, policy_accepted_at, age_confirmed_at
  )
  values (
    new.id,
    split_part(new.email, '@', 1),
    nullif(new.raw_user_meta_data->>'policy_version', ''),
    case when nullif(new.raw_user_meta_data->>'policy_version', '') is not null
         then now() end,
    case when (new.raw_user_meta_data->>'age_confirmed') = 'true'
         then now() end
  );
  return new;
end;
$$ language plpgsql security definer;
```

- [ ] **Step 2: Confirm the trigger cannot break signup**

Read it back and check: the insert names every column it supplies, the username expression is character-for-character what migration 002 had, and every new value is null-tolerant (`nullif` / `case` with no `else` yields null). A trigger that raises here makes account creation fail, so there is no acceptable "probably fine".

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/089_policy_acceptance.sql
git commit -m "Record versioned policy acceptance on the profile"
```

---

### Task 2: The policy constants and completeness check, TDD

**Files:**
- Create: `src/utils/policy.ts`
- Test: `src/utils/__tests__/policy.test.ts`

**Interfaces:**
- Produces: `POLICY_VERSION: string`, `CONTROLLER: { name: string; email: string; supabaseRegion: string }`, `UNSET: string`, `unresolvedControllerFacts(c): string[]`, `hasAcceptedCurrentPolicy(profile): boolean`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest'
import {
  UNSET, unresolvedControllerFacts, hasAcceptedCurrentPolicy, POLICY_VERSION,
} from '../policy'

describe('unresolvedControllerFacts', () => {
  it('names every fact still unfilled', () => {
    expect(unresolvedControllerFacts({ name: UNSET, email: UNSET, supabaseRegion: UNSET }))
      .toEqual(['controller name', 'contact address', 'Supabase region'])
  })

  it('names only what is missing', () => {
    expect(unresolvedControllerFacts({ name: 'A Climber', email: UNSET, supabaseRegion: 'eu-north-1' }))
      .toEqual(['contact address'])
  })

  it('is empty once all three are filled', () => {
    expect(unresolvedControllerFacts({ name: 'A Climber', email: 'a@b.no', supabaseRegion: 'eu-north-1' }))
      .toEqual([])
  })

  it('treats blank as unfilled, so whitespace cannot pass for an answer', () => {
    expect(unresolvedControllerFacts({ name: '  ', email: '', supabaseRegion: 'eu-north-1' }))
      .toEqual(['controller name', 'contact address'])
  })
})

describe('hasAcceptedCurrentPolicy', () => {
  it('accepts a profile on the current version', () => {
    expect(hasAcceptedCurrentPolicy({ policy_version: POLICY_VERSION })).toBe(true)
  })

  it('rejects a profile on an older version', () => {
    expect(hasAcceptedCurrentPolicy({ policy_version: '1970-01-01' })).toBe(false)
  })

  it('rejects a profile that never accepted', () => {
    expect(hasAcceptedCurrentPolicy({ policy_version: null })).toBe(false)
  })

  it('rejects a missing profile, so the gate fails closed', () => {
    expect(hasAcceptedCurrentPolicy(undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/utils/__tests__/policy.test.ts`
Expected: FAIL — `Failed to resolve import "../policy"`.

- [ ] **Step 3: Write the implementation**

```typescript
/**
 * Bump this when the notice changes materially. PolicyGate compares it against
 * profiles.policy_version, so bumping it re-prompts everyone -- which is the
 * only way a revision reaches people who signed up under the old text.
 */
export const POLICY_VERSION = '2026-08-24'

/** Sentinel for a fact only the owner can supply. */
export const UNSET = '__UNSET__'

/**
 * The three facts that cannot be read out of the codebase. While any of them is
 * UNSET, /privacy renders a warning naming it, so an incomplete legal notice
 * cannot quietly go live looking finished.
 */
export const CONTROLLER = {
  name: UNSET,
  email: UNSET,
  supabaseRegion: UNSET,
}

const FACT_LABELS: [keyof typeof CONTROLLER, string][] = [
  ['name', 'controller name'],
  ['email', 'contact address'],
  ['supabaseRegion', 'Supabase region'],
]

export function unresolvedControllerFacts(
  controller: { name: string; email: string; supabaseRegion: string },
): string[] {
  return FACT_LABELS
    .filter(([key]) => {
      const value = controller[key]
      return !value.trim() || value === UNSET
    })
    .map(([, label]) => label)
}

export function hasAcceptedCurrentPolicy(
  profile: { policy_version: string | null } | undefined | null,
): boolean {
  return profile?.policy_version === POLICY_VERSION
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/utils/__tests__/policy.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/policy.ts src/utils/__tests__/policy.test.ts
git commit -m "Add policy version, controller facts and the completeness check"
```

---

### Task 3: The public notice and house-rules pages

**Files:**
- Create: `src/pages/PrivacyPage.tsx`
- Create: `src/pages/HouseRulesPage.tsx`

**Interfaces:**
- Consumes: `CONTROLLER`, `unresolvedControllerFacts`, `POLICY_VERSION` from `src/utils/policy`
- Produces: `<PrivacyPage />`, `<HouseRulesPage />` — both self-contained, no auth, no hooks

- [ ] **Step 1: Write `PrivacyPage`**

Plain prose in the app's voice, `max-w-2xl mx-auto p-5` on the existing `#f7f5f0` background, `<h1>` then `<h2>` per section. Sections, in this order, asserting exactly the claims tabulated in the spec's "What the notice must contain" — no others:

Who we are · What you give us · What you create · What we work out from it · What other climbers can see · Where you are right now · Who else touches it · The AI coach and video analysis · What we don't do · How long we keep it · What you can do about it · Age · When this changes

Three requirements that are easy to get wrong:

1. When `unresolvedControllerFacts(CONTROLLER)` is non-empty, render an amber box at the very top: `⚠ Draft — still to fill in: <list>`, and render the missing values inline as `[controller name]` rather than as the `__UNSET__` sentinel.
2. "What other climbers can see" must state plainly that every problem you log is currently readable by any signed-in climber, and that this is a known gap being changed. Do not soften it — the whole value of the page is that it is true.
3. "What you can do about it" names the two buttons by their exact UI labels, *Download my data* and *Delete my account*, and says published beta stays with your name taken off. It also names Datatilsynet as the complaint route.

- [ ] **Step 2: Write `HouseRulesPage`**

Same shell. Four rules, one short paragraph each: ask before you post someone else's face; beta should be honest; digs stay friendly; don't publish a boulder that isn't on the wall. Close with a line that these are house rules rather than a contract.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/pages/PrivacyPage.tsx src/pages/HouseRulesPage.tsx
git commit -m "Add the privacy notice and house rules as public pages"
```

---

### Task 4: The gate, the acceptance screen and the hook

**Files:**
- Create: `src/hooks/usePolicyAcceptance.ts`
- Create: `src/components/PolicyGate.tsx`
- Create: `src/pages/AcceptPolicyPage.tsx`
- Modify: `src/hooks/useProfile.ts` (add the three fields to `Profile`)

**Interfaces:**
- Consumes: `hasAcceptedCurrentPolicy`, `POLICY_VERSION` from `src/utils/policy`; `useProfile` from `src/hooks/useProfile`
- Produces: `useAcceptPolicy()` mutation, `<PolicyGate />`, `<AcceptPolicyPage />`

- [ ] **Step 1: Extend the `Profile` interface**

In `src/hooks/useProfile.ts`, add to `interface Profile`:

```typescript
  policy_version: string | null
  policy_accepted_at: string | null
  age_confirmed_at: string | null
```

- [ ] **Step 2: Write the acceptance hook**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import { POLICY_VERSION } from '../utils/policy'

/**
 * Writes the climber's own acceptance record. Plain profile update rather than
 * an RPC: it is their record of their own reading, and the existing "users can
 * update own profile" policy already scopes it correctly.
 */
export function useAcceptPolicy() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('profiles')
        .update({
          policy_version: POLICY_VERSION,
          policy_accepted_at: now,
          age_confirmed_at: now,
        })
        .eq('id', user!.id)
      if (error) throw error
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['profile'] }) },
  })
}
```

- [ ] **Step 3: Write `PolicyGate`**

Same shape as `OnboardingGate`, and it fails closed for the same reason.

```tsx
import { Navigate, Outlet } from 'react-router-dom'
import { useProfile } from '../hooks/useProfile'
import { hasAcceptedCurrentPolicy } from '../utils/policy'

export function PolicyGate() {
  const { data: profile, isLoading } = useProfile()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  // Fail closed, like OnboardingGate: an unresolved profile means we cannot
  // show that this climber was ever told what the app does, so ask again.
  // `/accept-policy` sits outside this gate, so there is no redirect loop.
  if (!hasAcceptedCurrentPolicy(profile)) {
    return <Navigate to="/accept-policy" replace />
  }

  return <Outlet />
}
```

- [ ] **Step 4: Write `AcceptPolicyPage`**

One screen: heading "Before you carry on", two short paragraphs saying what changed and why they are seeing it, links to `/privacy` and `/house-rules` opening in the same tab, one checkbox reading exactly "I'm 13 or older, and I've read the privacy notice and house rules", and a primary button disabled until it is ticked. On success, `navigate('/dashboard', { replace: true })` and a `toast.success('Thanks — that’s recorded.')`. On error, `toast.error` with the message. Use `sage` palette classes and `rounded-2xl`, matching `OnboardingPage`.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/usePolicyAcceptance.ts src/components/PolicyGate.tsx src/pages/AcceptPolicyPage.tsx src/hooks/useProfile.ts
git commit -m "Gate the app on a recorded acceptance of the current notice"
```

---

### Task 5: Wire the routes

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the public routes beside `/login`**

```tsx
            <Route path="/login" element={<LoginPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/house-rules" element={<HouseRulesPage />} />
```

Public on purpose: a notice you need an account to read is not notice.

- [ ] **Step 2: Nest `PolicyGate` inside `ProtectedRoute`, wrapping onboarding**

`/accept-policy` goes outside the gate — the same reason `/onboarding` sits outside `OnboardingGate`, or the gate redirects to a page it is itself blocking. Acceptance precedes onboarding, so the app doesn't ask which gyms you climb at before saying what it does with the answer.

```tsx
            <Route element={<ProtectedRoute />}>
              <Route path="/accept-policy" element={<AcceptPolicyPage />} />
              <Route element={<PolicyGate />}>
                <Route path="/onboarding" element={<OnboardingPage />} />
                <Route element={<OnboardingGate />}>
                  ... every existing route, unchanged ...
                </Route>
              </Route>
            </Route>
```

- [ ] **Step 3: Build and lint**

Run: `npm run build && npm run lint`
Expected: build exit 0; lint count unchanged from baseline.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "Route the notice publicly and the gate ahead of onboarding"
```

---

### Task 6: Signup checkbox, and the notices in context

**Files:**
- Modify: `src/pages/LoginPage.tsx`
- Modify: `src/pages/VideoAnalysisPage.tsx`
- Modify: `src/pages/ProfilePage.tsx`

- [ ] **Step 1: Add the checkbox to the register tab of `LoginPage`**

State `const [accepted, setAccepted] = useState(false)`. Render the checkbox only when `tab === 'register'`, with the exact label "I'm 13 or older, and I've read the privacy notice and house rules", the two words linking to `/privacy` and `/house-rules`. The submit button gets `disabled={loading || (tab === 'register' && !accepted)}`.

Pass the acceptance to the trigger:

```typescript
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { policy_version: POLICY_VERSION, age_confirmed: true } },
        })
```

Import `POLICY_VERSION` from `../utils/policy`. Leave the Google button alone — it has no checkbox to gate, which is exactly what `PolicyGate` is for. Below both tabs, always visible, add small links to `/privacy` and `/house-rules` so the notice is reachable without signing up.

- [ ] **Step 2: Add the in-context notice to `VideoAnalysisPage`**

Directly above the file picker, in `text-xs text-gray-500`:

> Five stills from your clip are sent to Groq, an AI provider in the US, and aren't stored. Please don't upload video of other climbers without asking them first.

with "Groq, an AI provider in the US" carrying a link to `/privacy`. This is the disclosure that matters most in the whole feature, because it is the one place a third party's face can leave the app.

- [ ] **Step 3: Link the notice from the profile page**

In the "Your data" section added by the previous plan, below the two buttons, a small `Link` to `/privacy` reading "What we do with your data".

- [ ] **Step 4: Build, test, lint**

```bash
npm run build && npx vitest run && npm run lint
```

Expected: build exit 0; all tests pass; lint count unchanged from baseline.

- [ ] **Step 5: Commit**

```bash
git add src/pages/LoginPage.tsx src/pages/VideoAnalysisPage.tsx src/pages/ProfilePage.tsx
git commit -m "Ask for acceptance at signup and disclose Groq where it happens"
```

---

### Task 7: Verification and the owner's remaining facts

- [ ] **Step 1: Full check**

```bash
npm run build && npx vitest run && npm run lint
```

- [ ] **Step 2: Report the three unfilled facts**

`/privacy` renders its amber warning until the owner supplies the controller name, contact address and Supabase region in `src/utils/policy.ts`. All three live in the single `CONTROLLER` object, so filling them in is a one-line-each edit with no other code to touch. Say so explicitly rather than reporting the feature as finished.

- [ ] **Step 3: Manual pass — needs a deploy**

Local boot is impossible (no `.env`), so verify on a preview deploy, in this order:

1. Apply migration 089 **first**, or every user is stuck at a gate whose write fails.
2. `/privacy` and `/house-rules` load while signed out.
3. An existing account is sent to `/accept-policy` on next visit, cannot continue until the box is ticked, and lands on the dashboard afterwards — and does **not** see the gate again on reload.
4. A new email registration cannot submit without the checkbox, and after confirming, goes straight to onboarding with no gate — proving the trigger read the metadata.
5. A Google signup does hit the gate.

## Out of scope

Narrowing migration 015's blanket read on `problems`; the email-derived username; the presence opt-out.
