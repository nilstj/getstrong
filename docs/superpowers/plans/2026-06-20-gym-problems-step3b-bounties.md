# Gym Problems — Step 3b (Beta Bounties) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a climber stake a points bounty on a beta request for a shared boulder, capped by a monthly budget, and award it to the first response they mark helpful — completing payoff C on top of the 3a ledger/leaderboard.

**Architecture:** Bounties live on `help_requests` (a `bounty` amount + the `gym_problem_id` it's scoped to + a `bounty_awarded` flag). The existing `create_help_request` RPC is extended to accept a bounty and enforce a monthly staking budget server-side. The existing `award_helpful_response` trigger is extended so that marking a response helpful awards the bounty (once) as a `bounty_won` ledger row to the responder — and, while there, it gains idempotency for the 3a `helpful` points (via a new `beta_points.response_id`), sources the gym from `gym_problems` when available, and never awards the asker their own points. UI: `CallForHelp` gains a bounty stepper (shown only for problems claimed onto a shared boulder), and request cards show the bounty.

**Tech Stack:** React 18 + TypeScript, `@tanstack/react-query`, Supabase (Postgres + RLS + triggers + SECURITY DEFINER RPCs), Tailwind, `react-hot-toast`, `lucide-react`, Vitest (jsdom).

## Global Constraints

- **Monthly staking budget = 100 points per cycle.** Enforced server-side in `create_help_request` (sum of this cycle's staked bounties + the new one must be ≤ 100). The same constant `100` appears in SQL and as `BOUNTY_BUDGET` in TS — keep them equal.
- **Cycle = UTC `YYYY-MM`**, same as 3a (`to_char((now() at time zone 'utc'),'YYYY-MM')` in SQL; `cycleMonth(new Date())` in TS).
- **Bounties only on shared-boulder problems.** A bounty > 0 requires a non-null `gym_problem_id`; the RPC rejects a bounty without one. The UI shows the bounty control only when `problem.gym_problem_id` is set.
- **Auto-award on first helpful mark, once per request.** Marking a response helpful awards `bounty` points (reason `bounty_won`) to that responder if the request has a bounty and `bounty_awarded` is false; then sets `bounty_awarded = true`. Idempotent — toggling helpful cannot re-award.
- **No self-award.** Neither `helpful` nor `bounty_won` points are written when the responder is the asker (`new.user_id = request.user_id`). Closes the self-response farming vector.
- **`helpful` points are idempotent per response** via a new `beta_points.response_id`: award the 5-point `helpful` row only if none already exists for that response. Closes the toggle re-award vector.
- **Gym key prefers `gym_problems.gym`.** Points rows source `gym` as `coalesce(gym_problems.gym, problems.gym)` so they land under the same key the leaderboard groups by.
- **Append-only ledger, SECURITY DEFINER writes only** (unchanged from 3a). Points are never client-inserted.
- **Migrations are numbered SQL applied manually** (no CLI/local DB, no SQL test harness); make them re-runnable (`add column if not exists`, `create or replace`). Verify by reading + the provided query.
- **Tests exist only for pure utilities.** Hooks/components verified via `npx tsc -b` + `npm run lint` + `npm run build`. TDD only for the pure helper in Task 2. Lint baseline is 17 — introduce 0 new.
- **Out of scope:** refunding unawarded bounties, expiring/returning budget, lifecycle archival (step 4), any standalone bounty page. A staked-but-never-awarded bounty simply stays counted against that cycle (acceptable; revisit with lifecycle).

---

### Task 1: Migration 047 — bounty columns + budget enforcement + award extension

**Files:**
- Create: `supabase/migrations/047_beta_bounties.sql`

**Interfaces:**
- Consumes: `help_requests`/`help_responses` (039), `create_help_request` (042), `award_helpful_response` (046), `beta_points`/`gym_problems` (044/046), `problems`.
- Produces (relied on by Tasks 2–5): `help_requests.bounty int`, `help_requests.gym_problem_id uuid`, `help_requests.bounty_awarded boolean`, `beta_points.response_id uuid`; `create_help_request(p_problem_id, p_message, p_visibility, p_bounty default 0, p_gym_problem_id default null)`; `bounty_won` ledger rows on helpful-award.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/047_beta_bounties.sql`. Both functions are reproduced from their current versions (042 / 046) and EXTENDED only where marked.

```sql
-- Crew Projects step 3b: beta bounties. A help request on a shared boulder can
-- carry a points bounty (capped by a monthly staking budget); marking a response
-- helpful awards that bounty once. Also hardens 3a's point awards (idempotent
-- helpful points, gym sourced from gym_problems, no self-award).

alter table help_requests add column if not exists bounty integer not null default 0;
alter table help_requests add column if not exists gym_problem_id uuid references gym_problems(id) on delete set null;
alter table help_requests add column if not exists bounty_awarded boolean not null default false;
alter table beta_points add column if not exists response_id uuid references help_responses(id) on delete set null;

-- ── create_help_request: extended with an optional bounty + boulder scope ─────
-- Reproduces migration 042 and ADDS bounty params + monthly budget enforcement.
-- Drop the old 3-arg overload first: adding defaulted params creates a separate
-- function, and a 3-arg call would then be ambiguous ("function is not unique").
-- The 5-arg version below still serves 3-arg named calls via its defaults.
drop function if exists public.create_help_request(uuid, text, text);

create or replace function public.create_help_request(
  p_problem_id     uuid,
  p_message        text,
  p_visibility     text,
  p_bounty         integer default 0,
  p_gym_problem_id uuid default null
)
returns uuid as $$
declare
  v_user_id uuid := auth.uid();
  v_id      uuid;
  v_staked  integer;
  v_cycle   text := to_char((now() at time zone 'utc'), 'YYYY-MM');
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if p_visibility not in ('friends', 'global') then
    raise exception 'Invalid visibility value: %', p_visibility;
  end if;
  if p_bounty < 0 then
    raise exception 'Bounty must be non-negative';
  end if;
  if p_bounty > 0 and p_gym_problem_id is null then
    raise exception 'A bounty requires a shared boulder';
  end if;

  if p_bounty > 0 then
    select coalesce(sum(bounty), 0) into v_staked
      from public.help_requests
     where user_id = v_user_id
       and bounty > 0
       and to_char((created_at at time zone 'utc'), 'YYYY-MM') = v_cycle;
    if v_staked + p_bounty > 100 then  -- BOUNTY_BUDGET (keep in sync with TS)
      raise exception 'Monthly bounty budget exceeded: % staked of 100', v_staked;
    end if;
  end if;

  insert into public.help_requests (problem_id, user_id, message, visibility, bounty, gym_problem_id)
  values (p_problem_id, v_user_id, p_message, p_visibility, p_bounty, p_gym_problem_id)
  returning id into v_id;

  return v_id;
end;
$$ language plpgsql security definer;

-- ── award_helpful_response: extended for bounty + hardened 3a awards ──────────
-- Reproduces migration 046 (notification + badges + helpful points) and ADDS:
-- bounty award (once), idempotent helpful points (via beta_points.response_id),
-- gym sourced from gym_problems, and a no-self-award guard.
create or replace function public.award_helpful_response()
returns trigger as $$
declare
  v_asker   uuid;
  v_count   integer;
  v_tier    record;
  v_gym     text;
  v_gpid    uuid;
  v_bounty  integer;
  v_awarded boolean;
  v_cycle   text := to_char((now() at time zone 'utc'), 'YYYY-MM');
begin
  if new.helpful = true and (old.helpful is distinct from true) then
    select r.user_id, r.bounty, r.bounty_awarded,
           coalesce(r.gym_problem_id, p.gym_problem_id),
           coalesce(gp.gym, p.gym)
      into v_asker, v_bounty, v_awarded, v_gpid, v_gym
      from public.help_requests r
      join public.problems p on p.id = r.problem_id
      left join public.gym_problems gp on gp.id = coalesce(r.gym_problem_id, p.gym_problem_id)
     where r.id = new.request_id;

    perform public.create_notification(
      new.user_id, v_asker, 'help_marked_helpful', new.request_id, '{}'::jsonb
    );

    select count(*) into v_count
      from public.help_responses
     where user_id = new.user_id and helpful = true;

    for v_tier in
      select * from (values
        ('spotter', 1), ('beta_sprayer', 5), ('crux_crusher', 25), ('beta_legend', 100)
      ) as t(badge, threshold)
    loop
      if v_count >= v_tier.threshold
         and not exists (
           select 1 from public.user_badges b
           where b.user_id = new.user_id and b.badge = v_tier.badge
         ) then
        insert into public.user_badges (user_id, badge)
          values (new.user_id, v_tier.badge)
          on conflict do nothing;
        perform public.create_notification(
          new.user_id, v_asker, 'badge_earned', null,
          jsonb_build_object('badge', v_tier.badge)
        );
      end if;
    end loop;

    -- helpful points: 5 to the helper, idempotent per response, never to the asker.
    if v_gym is not null and new.user_id <> v_asker
       and not exists (
         select 1 from public.beta_points bp
         where bp.reason = 'helpful' and bp.response_id = new.id
       ) then
      insert into public.beta_points (user_id, gym, gym_problem_id, points, reason, cycle_month, response_id)
      values (new.user_id, v_gym, v_gpid, 5, 'helpful', v_cycle, new.id);
    end if;

    -- bounty: award the request's bounty once, to the helper, never to the asker.
    if v_bounty > 0 and not v_awarded and v_gym is not null and new.user_id <> v_asker then
      insert into public.beta_points (user_id, gym, gym_problem_id, points, reason, cycle_month, response_id)
      values (new.user_id, v_gym, v_gpid, v_bounty, 'bounty_won', v_cycle, new.id);
      update public.help_requests set bounty_awarded = true where id = new.request_id;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;
```

- [ ] **Step 2: Self-review the SQL**

Confirm: the three `help_requests` columns + `beta_points.response_id` use `add column if not exists`; `create_help_request` is the migration-042 body plus the bounty params, the `p_bounty > 0` budget block, and the two extra insert columns — defaulted params keep the existing 3-arg callers working; `award_helpful_response` reproduces 046 (notification + 4 badge tiers + helpful insert) and adds the gym `coalesce`, the `response_id` idempotency guard, the `new.user_id <> v_asker` guards on BOTH inserts, and the bounty block that sets `bounty_awarded`. Both functions remain `security definer`.

- [ ] **Step 3: Apply via the Supabase SQL editor and verify**

Apply `047_beta_bounties.sql`. Then:

```sql
select column_name from information_schema.columns
 where table_name = 'help_requests' and column_name in ('bounty','gym_problem_id','bounty_awarded');
select column_name from information_schema.columns
 where table_name = 'beta_points' and column_name = 'response_id';
```
Expected: three `help_requests` columns; one `beta_points.response_id`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/047_beta_bounties.sql
git commit -m "feat: beta bounties — staking budget + award-on-helpful (migration 047)"
```

---

### Task 2: Bounty types + budget helper (TDD)

**Files:**
- Modify: `src/types/index.ts` (extend `HelpRequest`)
- Create: `src/utils/bounty.ts`
- Test: `src/utils/__tests__/bounty.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (relied on by Tasks 3–5):
  - `HelpRequest` gains `bounty: number`, `gym_problem_id: string | null`, `bounty_awarded: boolean`.
  - `export const BOUNTY_BUDGET = 100`
  - `remainingBudget(staked: number): number` — `max(0, BOUNTY_BUDGET - staked)`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/bounty.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { BOUNTY_BUDGET, remainingBudget } from '../bounty'

describe('remainingBudget', () => {
  it('is the full budget when nothing is staked', () => {
    expect(remainingBudget(0)).toBe(BOUNTY_BUDGET)
  })
  it('subtracts what is staked', () => {
    expect(remainingBudget(30)).toBe(70)
  })
  it('is zero when fully staked', () => {
    expect(remainingBudget(100)).toBe(0)
  })
  it('never goes negative', () => {
    expect(remainingBudget(150)).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/utils/__tests__/bounty.test.ts`
Expected: FAIL — cannot resolve module `../bounty`.

- [ ] **Step 3: Write the helper**

Create `src/utils/bounty.ts`:

```ts
export const BOUNTY_BUDGET = 100

export function remainingBudget(staked: number): number {
  return Math.max(0, BOUNTY_BUDGET - staked)
}
```

- [ ] **Step 4: Extend the type**

In `src/types/index.ts`, extend the existing `HelpRequest` interface by adding three fields (after `resolved: boolean`):

```ts
  bounty: number
  gym_problem_id: string | null
  bounty_awarded: boolean
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/utils/__tests__/bounty.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/utils/bounty.ts src/utils/__tests__/bounty.test.ts
git commit -m "feat: add bounty budget helper and HelpRequest bounty fields"
```

---

### Task 3: Budget hook + create-with-bounty

**Files:**
- Create: `src/hooks/useBountyBudget.ts`
- Modify: `src/hooks/useHelp.ts` (`useCreateHelpRequest`)

**Interfaces:**
- Consumes: `supabase`, `useAuth`, `remainingBudget` from `src/utils/bounty`, `cycleMonth` from `src/utils/leaderboard`.
- Produces (relied on by Task 4):
  - `useMyBountyBudget()` → `{ staked: number; remaining: number }` for the current cycle.
  - `useCreateHelpRequest()` mutation input gains optional `bounty?: number` and `gymProblemId?: string | null`.

- [ ] **Step 1: Write the budget hook**

Create `src/hooks/useBountyBudget.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import { remainingBudget } from '../utils/bounty'
import { cycleMonth } from '../utils/leaderboard'

export function useMyBountyBudget() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['bounty_budget', user?.id],
    queryFn: async (): Promise<{ staked: number; remaining: number }> => {
      const monthStart = `${cycleMonth(new Date())}-01T00:00:00Z`
      const { data, error } = await supabase
        .from('help_requests')
        .select('bounty')
        .eq('user_id', user!.id)
        .gt('bounty', 0)
        .gte('created_at', monthStart)
      if (error) throw error
      const staked = (data ?? []).reduce((s, r) => s + ((r as { bounty: number }).bounty ?? 0), 0)
      return { staked, remaining: remainingBudget(staked) }
    },
    enabled: !!user,
  })
}
```

- [ ] **Step 2: Extend `useCreateHelpRequest`**

In `src/hooks/useHelp.ts`, the current mutation is:

```ts
export function useCreateHelpRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ problemId, message, visibility }: { problemId: string; message: string | null; visibility: HelpVisibility }) => {
      const { data: id, error } = await supabase
        .rpc('create_help_request', { p_problem_id: problemId, p_message: message, p_visibility: visibility })
      if (error) throw error
      ...
```

Replace the `mutationFn` signature and the `.rpc(...)` call so it threads the bounty (leave the rest of the function — the post-insert select and the `onSuccess` — intact, but add a `['bounty_budget']` invalidation in `onSuccess`):

```ts
    mutationFn: async ({ problemId, message, visibility, bounty = 0, gymProblemId = null }: { problemId: string; message: string | null; visibility: HelpVisibility; bounty?: number; gymProblemId?: string | null }) => {
      const { data: id, error } = await supabase
        .rpc('create_help_request', {
          p_problem_id: problemId,
          p_message: message,
          p_visibility: visibility,
          p_bounty: bounty,
          p_gym_problem_id: gymProblemId,
        })
      if (error) throw error
```

And in that mutation's existing `onSuccess`, add (alongside the existing invalidations):

```ts
      queryClient.invalidateQueries({ queryKey: ['bounty_budget'] })
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useBountyBudget.ts src/hooks/useHelp.ts
git commit -m "feat: bounty budget hook + stake a bounty when creating a help request"
```

---

### Task 4: Bounty stepper in CallForHelp

**Files:**
- Modify: `src/components/CallForHelp.tsx`

**Interfaces:**
- Consumes: `useMyBountyBudget`, `useCreateHelpRequest` (extended), `BOUNTY_BUDGET` from `src/utils/bounty`, `lucide-react` (`Trophy`).
- Produces: passes `bounty` + `gymProblemId` to the create mutation.

**Design:** Widen the `problem` prop to include `gym_problem_id`. When it's set, show a bounty stepper in the sheet (0 to the smaller of `remaining` and a 50 per-request cap), with a "X of 100 left this month" hint. Pass the chosen bounty and `gym_problem_id` on submit. Non-claimed problems behave exactly as today (no bounty UI).

- [ ] **Step 1: Widen the prop and add bounty state**

In `src/components/CallForHelp.tsx`, change the prop type and add imports + state:

```tsx
import { LifeBuoy, Users, Globe, Trophy } from 'lucide-react'
import { useMyBountyBudget } from '../hooks/useBountyBudget'
import { BOUNTY_BUDGET } from '../utils/bounty'
```

```tsx
export function CallForHelp({ problem }: { problem: Pick<Problem, 'id' | 'image_url' | 'beta_video_url' | 'gym_problem_id'> }) {
```

Add, alongside the other `useState` calls:

```tsx
  const [bounty, setBounty] = useState(0)
  const { data: budget } = useMyBountyBudget()
  const canBounty = !!problem.gym_problem_id
  const maxBounty = Math.min(50, budget?.remaining ?? BOUNTY_BUDGET)
```

- [ ] **Step 2: Pass the bounty on submit**

Change the `submit` function's `create.mutate(...)` first argument to include the bounty fields:

```tsx
    create.mutate(
      {
        problemId: problem.id,
        message: message.trim() || null,
        visibility,
        bounty: canBounty ? bounty : 0,
        gymProblemId: problem.gym_problem_id,
      },
      {
        onSuccess: () => { toast.success(bounty > 0 ? `Bounty of ${bounty} posted! 🏆` : 'Call for help posted! 🆘'); setOpen(false); setMessage(''); setBounty(0) },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
      },
    )
```

- [ ] **Step 3: Render the bounty stepper**

In the sheet, between the `<textarea>` and the submit button, add (renders only for shared-boulder problems):

```tsx
          {canBounty && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Trophy size={13} className="text-amber-500" /> Bounty (optional)
              </p>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setBounty(b => Math.max(0, b - 5))}
                  className="w-9 h-9 rounded-full border text-xl flex items-center justify-center"
                >−</button>
                <span className="text-lg font-semibold w-10 text-center">{bounty}</span>
                <button
                  type="button"
                  onClick={() => setBounty(b => Math.min(maxBounty, b + 5))}
                  className="w-9 h-9 rounded-full border text-xl flex items-center justify-center"
                >+</button>
                <span className="text-xs text-gray-400">{budget?.remaining ?? BOUNTY_BUDGET} of {BOUNTY_BUDGET} left this month</span>
              </div>
            </div>
          )}
```

- [ ] **Step 4: Pass `gym_problem_id` from the call site**

In `src/pages/SessionDetailPage.tsx`, the existing `<CallForHelp problem={problem} />` passes a full `problem`, which already includes `gym_problem_id` — no change needed. Confirm by reading the render line; if it passes a narrowed object, widen it to include `gym_problem_id`.

- [ ] **Step 5: Typecheck, lint, build**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: no type errors, no new lint errors (baseline 17), build succeeds.

- [ ] **Step 6: Manual verification**

With migrations applied: on a problem **claimed onto a shared boulder**, "Ask for beta" shows a Bounty stepper and "100 of 100 left". Post a bounty of 10; the budget hint drops to 90 on the next open. On a non-claimed problem, no bounty UI appears.

- [ ] **Step 7: Commit**

```bash
git add src/components/CallForHelp.tsx src/pages/SessionDetailPage.tsx
git commit -m "feat: stake a bounty from Ask-for-beta on shared-boulder problems"
```

---

### Task 5: Show the bounty on help requests

**Files:**
- Modify: `src/pages/HelpPage.tsx`

**Interfaces:**
- Consumes: `HelpRequest.bounty` / `bounty_awarded` (now selected via `select('*')`), `lucide-react` (`Trophy`).
- Produces: nothing.

**Design:** On each help-request card in the Help page, when `bounty > 0`, show a bounty badge — "🏆 N" (amber) for an open bounty, or "🏆 N awarded" (muted) once `bounty_awarded`. This is what makes a bounty visible to potential helpers.

- [ ] **Step 1: Add the badge**

In `src/pages/HelpPage.tsx`, import `Trophy` from `lucide-react` (extend the existing import). Find where each request card renders its meta row (search for where `request.message` or the grade/visibility chips render). Add, in that row:

```tsx
              {request.bounty > 0 && (
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  request.bounty_awarded ? 'bg-gray-100 text-gray-400' : 'bg-amber-100 text-amber-700'
                }`}>
                  <Trophy size={11} strokeWidth={2} /> {request.bounty}{request.bounty_awarded ? ' awarded' : ''}
                </span>
              )}
```

Use the exact request variable name in that scope (the card's `request`/`r`/`req` binding — match the surrounding code).

- [ ] **Step 2: Typecheck, lint, build**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: no type errors, no new lint errors (baseline 17), build succeeds.

- [ ] **Step 3: Manual verification**

With a bounty posted (Task 4): the request shows "🏆 10" on the Help page. After the asker marks a response helpful, the responder gains 10 `bounty_won` points (visible on the gym leaderboard / Crew page) and the badge reads "🏆 10 awarded".

- [ ] **Step 4: Commit**

```bash
git add src/pages/HelpPage.tsx
git commit -m "feat: show bounty badge on help requests"
```

---

## Self-Review

**Spec coverage (step 3b):**
- Monthly point budget to stake → Task 1 (RPC enforcement) + Task 2 (`BOUNTY_BUDGET`/`remainingBudget`) + Task 3 (`useMyBountyBudget`) ✓
- Posting a beta request on a gym_problem stakes a visible bounty → Task 1 (columns + RPC) + Task 4 (stepper) + Task 5 (badge) ✓
- Award bounty to the helpful response on send, as a `bounty_won` ledger row → Task 1 (`award_helpful_response`) ✓
- Request scoped to a shared boulder (`gym_problem_id` on help_requests) → Task 1 ✓
- helpful marks still write small `beta_points` rows → preserved + made idempotent in Task 1 ✓

**Tracked 3a follow-ups, now closed:**
- Toggle re-award of helpful points → idempotent via `beta_points.response_id` NOT EXISTS (Task 1) ✓
- Self-award (asker answering own request) → `new.user_id <> v_asker` guard on both inserts (Task 1) ✓
- Bounty self-staking abuse → bounded by the monthly budget (Task 1) ✓
- helpful gym key mismatch → `coalesce(gym_problems.gym, problems.gym)` (Task 1) ✓
- (Remaining, noted not fixed: uncapped `first_logger` farming — low value, deferred to a possible anti-gaming pass.)

**Placeholder scan:** No TBD/TODO/vague directives — every code step is complete. ✓

**Type consistency:** `HelpRequest` bounty fields (Task 2) are read by Tasks 4–5; `BOUNTY_BUDGET`/`remainingBudget` (Task 2) used by Tasks 3–4; `useMyBountyBudget` shape `{staked,remaining}` matches between Task 3 and Task 4; the RPC params `p_bounty`/`p_gym_problem_id` (Task 1) match the `.rpc(...)` call (Task 3); `useCreateHelpRequest` input `bounty`/`gymProblemId` match between Task 3 and Task 4. ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-20-gym-problems-step3b-bounties.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
