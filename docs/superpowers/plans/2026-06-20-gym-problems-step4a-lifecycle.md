# Gym Problems — Step 4a (Lifecycle: Read-time Expiry + Strip) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a shared boulder's 1-month lifecycle real without any new infrastructure: expired or stripped boulders stop appearing as active (read-time, the spec's source of truth), and any crew member can mark a boulder "stripped" to archive it early and notify the crew.

**Architecture:** Effective active-ness is `status = 'active' AND not past expiry`, computed at read time by a pure helper (`isActiveBoulder`) applied in the discovery/matcher hooks — so correctness needs no nightly job. A new `SECURITY DEFINER` RPC `strip_gym_problem` lets a crew member archive a boulder early (sets `status='archived'`) and notifies the rest of the crew. The CrewPage gains a "Mark as stripped" control. The Vercel cron and the "X days left" notification are deferred to step 4b.

**Tech Stack:** React 18 + TypeScript, `@tanstack/react-query`, Supabase (Postgres + RLS + SECURITY DEFINER RPCs), Tailwind, `react-hot-toast`, `lucide-react`, Vitest (jsdom).

## Global Constraints

- **Effective active = `status = 'active'` AND `expires_at >= today` (UTC), inclusive of the expiry day.** This matches the CrewPage's existing `daysUntil(...) >= 0` "N days left" display. Computed read-time by `isActiveBoulder`; do NOT rely on a job for correctness.
- **Strip is a crew-member action.** `strip_gym_problem(p_id)` may be called by any user who has a problem claimed onto that boulder; it sets `status='archived'` and notifies the other crew members. Enforced server-side (the RPC is the only write path to `gym_problems.status`; there is no update RLS policy).
- **Archival preserves personal data.** Stripping only flips the shared boulder's `status`; personal `problems` rows (incl. sends) and the `beta_points` ledger are untouched.
- **New notification type `crew_stripped`** (entity_id = gym_problem_id, data `{name, color}`), rendered in `AppBar` like `crew_send`.
- **Out of scope (step 4b / later):** the Vercel cron, `run_crew_lifecycle`, the "X days left" notification, a dedicated archived-history view (archived boulders simply leave the active lists; their Crew page still loads by id and shows "Stripped").
- **Migrations are numbered SQL applied manually** (no CLI/local DB, no SQL test harness); make them re-runnable (`create or replace`). Verify by reading + the provided query.
- **Tests exist only for pure utilities.** Hooks/components verified via `npx tsc -b` + `npm run lint` + `npm run build`. TDD only for the pure helper in Task 2. Lint baseline 17 — introduce 0 new.
- **Naming/style:** React Query array keys, `useX` hooks, `sage-700` accent, `lucide-react` icons. Follow existing patterns.

---

### Task 1: Migration 048 — `strip_gym_problem` RPC + `crew_stripped` notification

**Files:**
- Create: `supabase/migrations/048_strip_gym_problem.sql`

**Interfaces:**
- Consumes: `gym_problems`, `problems`, `public.create_notification` (037).
- Produces (relied on by Task 3): `strip_gym_problem(p_gym_problem_id uuid) returns void` — archives a boulder if the caller is a crew member; notifies other crew members with `type='crew_stripped'`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/048_strip_gym_problem.sql`:

```sql
-- Crew Projects step 4a: community "this got stripped" action. Any crew member
-- (a user with a problem claimed onto the boulder) can archive it early. The
-- RPC is the only write path to gym_problems.status (no update RLS policy), and
-- it notifies the rest of the crew. Natural expiry is handled read-time in the
-- client (no job); this covers early archival.

create or replace function public.strip_gym_problem(p_gym_problem_id uuid)
returns void as $$
declare
  v_user_id uuid := auth.uid();
  v_boulder gym_problems;
  v_member  uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Caller must be a crew member: have a problem claimed onto this boulder.
  if not exists (
    select 1 from public.problems
    where gym_problem_id = p_gym_problem_id and user_id = v_user_id
  ) then
    raise exception 'Only a crew member can strip this boulder';
  end if;

  update public.gym_problems
     set status = 'archived'
   where id = p_gym_problem_id and status = 'active'
  returning * into v_boulder;

  if not found then
    return;  -- already archived (or gone); nothing to do
  end if;

  -- Notify the rest of the crew that their project is gone.
  for v_member in
    select distinct p.user_id
      from public.problems p
     where p.gym_problem_id = p_gym_problem_id
       and p.user_id <> v_user_id
  loop
    perform public.create_notification(
      v_member, v_user_id, 'crew_stripped', p_gym_problem_id,
      jsonb_build_object('name', v_boulder.name, 'color', v_boulder.color)
    );
  end loop;
end;
$$ language plpgsql security definer;
```

- [ ] **Step 2: Self-review the SQL**

Confirm: `security definer`; the crew-membership check via `problems` before any write; the `update ... where status='active' returning into` + `if not found then return` makes a double-strip a safe no-op (and avoids re-notifying); the notify loop excludes the actor (`p.user_id <> v_user_id`) and uses `create_notification` (which also self-skips).

- [ ] **Step 3: Apply via the Supabase SQL editor and verify**

Apply `048_strip_gym_problem.sql`, then:

```sql
select proname from pg_proc where proname = 'strip_gym_problem';
```
Expected: one row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/048_strip_gym_problem.sql
git commit -m "feat: strip_gym_problem RPC — community early-archive + notify (migration 048)"
```

---

### Task 2: `isActiveBoulder` helper (TDD)

**Files:**
- Modify: `src/utils/gymProblems.ts` (add the helper)
- Test: `src/utils/__tests__/gymProblems.test.ts` (append cases)

**Interfaces:**
- Consumes: `daysUntil` (already in `src/utils/gymProblems.ts`).
- Produces (relied on by Task 3): `isActiveBoulder(gp: { status: string; expires_at: string }, now: Date): boolean` — true iff `status === 'active'` and `daysUntil(expires_at, now) >= 0`.

- [ ] **Step 1: Add failing tests**

Append to `src/utils/__tests__/gymProblems.test.ts`:

```ts
import { isActiveBoulder } from '../gymProblems'

describe('isActiveBoulder', () => {
  const now = new Date('2026-06-20T10:00:00Z')
  it('is active when status active and expiry is in the future', () => {
    expect(isActiveBoulder({ status: 'active', expires_at: '2026-06-28' }, now)).toBe(true)
  })
  it('is active on the expiry day itself (inclusive)', () => {
    expect(isActiveBoulder({ status: 'active', expires_at: '2026-06-20' }, now)).toBe(true)
  })
  it('is inactive once past expiry', () => {
    expect(isActiveBoulder({ status: 'active', expires_at: '2026-06-19' }, now)).toBe(false)
  })
  it('is inactive when archived regardless of date', () => {
    expect(isActiveBoulder({ status: 'archived', expires_at: '2026-06-28' }, now)).toBe(false)
  })
})
```

(Add the `import` to the existing import group at the top of the test file if it imports named helpers from `../gymProblems`; otherwise the new `import` line shown is fine.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/gymProblems.test.ts`
Expected: FAIL — `isActiveBoulder` is not exported.

- [ ] **Step 3: Add the helper**

Append to `src/utils/gymProblems.ts`:

```ts
// A shared boulder counts as active only while it is status-active AND not past
// its expiry (inclusive of the expiry day, matching the "N days left" display).
export function isActiveBoulder(
  gp: { status: string; expires_at: string },
  now: Date,
): boolean {
  return gp.status === 'active' && daysUntil(gp.expires_at, now) >= 0
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/gymProblems.test.ts`
Expected: PASS — all cases (existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/utils/gymProblems.ts src/utils/__tests__/gymProblems.test.ts
git commit -m "feat: add isActiveBoulder read-time expiry helper"
```

---

### Task 3: Apply expiry filter + `useStripGymProblem` hook

**Files:**
- Modify: `src/hooks/useGymProblems.ts` (matcher query filter + new strip mutation)
- Modify: `src/hooks/useDiscoverBoulders.ts` (filter candidates by `isActiveBoulder`)

**Interfaces:**
- Consumes: `isActiveBoulder` from `src/utils/gymProblems`, `supabase`.
- Produces (relied on by Task 4): `useStripGymProblem()` → mutation taking `gymProblemId: string`, calls `strip_gym_problem`, invalidates crew/boulder/discovery queries.

- [ ] **Step 1: Filter matches by active-ness**

In `src/hooks/useGymProblems.ts`, `useMatchingGymProblems` currently ends its `queryFn` with:

```ts
      return (data as GymProblem[]).filter(gp => gymProblemMatches(gp, criteria))
```

Change the import to include `isActiveBoulder` and apply it (drop expired boulders from suggestions):

```ts
import { gymProblemMatches, isActiveBoulder } from '../utils/gymProblems'
```
```ts
      const now = new Date()
      return (data as GymProblem[]).filter(gp => gymProblemMatches(gp, criteria) && isActiveBoulder(gp, now))
```

- [ ] **Step 2: Add the strip mutation**

In `src/hooks/useGymProblems.ts`, add (it already imports `useMutation`, `useQueryClient`, `supabase`):

```ts
export function useStripGymProblem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (gymProblemId: string) => {
      const { error } = await supabase.rpc('strip_gym_problem', { p_gym_problem_id: gymProblemId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym_problem'] })
      queryClient.invalidateQueries({ queryKey: ['gym_problems'] })
      queryClient.invalidateQueries({ queryKey: ['crew'] })
      queryClient.invalidateQueries({ queryKey: ['discover_boulders'] })
    },
  })
}
```

- [ ] **Step 3: Filter discovery candidates by active-ness**

In `src/hooks/useDiscoverBoulders.ts`, import the helper and apply it when collecting candidate boulders so expired-but-not-yet-archived boulders drop out of "your crews" and "in your gym":

```ts
import { boulderTitle, countMembersByBoulder } from '../utils/boulders'
import { isActiveBoulder } from '../utils/gymProblems'
```

The hook builds a `boulders` Map from two queries. After the `const list = Array.from(boulders.values())` line, filter the list:

```ts
      const now = new Date()
      const activeList = list.filter(b => isActiveBoulder(b, now))
      if (activeList.length === 0) return { yours: [], discover: [] }
```

Then use `activeList` everywhere the code currently uses `list` below that point (the `ids` map, the `summaries` map). (Replace the subsequent `list.map(...)` / `list` references with `activeList`.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGymProblems.ts src/hooks/useDiscoverBoulders.ts
git commit -m "feat: hide expired boulders read-time + useStripGymProblem hook"
```

---

### Task 4: CrewPage strip control + `crew_stripped` notification rendering

**Files:**
- Modify: `src/pages/CrewPage.tsx` (strip button)
- Modify: `src/components/AppBar.tsx` (`crew_stripped` rendering)

**Interfaces:**
- Consumes: `useStripGymProblem`, `useAuth`, `useCrew`/`useGymProblem` (already used by CrewPage), `react-hot-toast`, `lucide-react`.
- Produces: nothing.

- [ ] **Step 1: Add the strip control to CrewPage**

In `src/pages/CrewPage.tsx`, add imports (note `useStripGymProblem` is exported from `useGymProblems.ts`, per Task 3):

```tsx
import toast from 'react-hot-toast'
import { useStripGymProblem } from '../hooks/useGymProblems'
```

Inside the component, after the existing hooks (before the early returns), add:

```tsx
  const { user } = useAuth()
  const strip = useStripGymProblem()
```

(`useAuth` may already be imported for the leaderboard section — if so, don't duplicate the import or the call; reuse the existing `user`.)

The component already computes `members` and `left` after the `!boulder` guard. Determine if the viewer is a crew member and the boulder is still active, and render a strip button in the meta area (just after the countdown/stats, before the crew list). Add:

```tsx
        {boulder.status === 'active' && left >= 0 && members.some(m => m.user_id === user?.id) && (
          <button
            onClick={() => {
              if (!confirm('Mark this boulder as stripped? It will be archived for everyone.')) return
              strip.mutate(boulder.id, {
                onSuccess: () => toast.success('Marked as stripped'),
                onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
              })
            }}
            disabled={strip.isPending}
            className="text-xs text-gray-400 hover:text-red-600 underline disabled:opacity-50"
          >
            This got stripped
          </button>
        )}
```

If the boulder is archived (`boulder.status !== 'active'` or `left < 0`), the existing countdown already shows "Stripped"/expired, so no button is shown — correct.

- [ ] **Step 2: Render the `crew_stripped` notification**

In `src/components/AppBar.tsx`:

Add to the `ICONS` map (next to `crew_send`):

```tsx
  crew_stripped: '🧹',
```

Add a `describe()` case (next to `crew_send`):

```tsx
    case 'crew_stripped': {
      const what = d.name || d.color || 'a boulder'
      return { text: `${username} marked ${what} as stripped — it's archived` }
    }
```

Add a `routeFor()` case (next to `crew_send`):

```tsx
    case 'crew_stripped':
      return n.entity_id ? `/gym-problems/${n.entity_id}` : null
```

If `NotificationType` is a string-literal union in `src/types/index.ts`, add `'crew_stripped'` to it (the `crew_send` addition set the precedent — match it).

- [ ] **Step 3: Typecheck, lint, build**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: no type errors, no new lint errors (baseline 17), build succeeds.

- [ ] **Step 4: Manual verification**

With migrations applied, on a Crew page where you're a member and the boulder is active: a "This got stripped" link appears. Tapping it (confirm) archives the boulder — it disappears from the Dashboard "Crews" and matcher suggestions, the countdown shows "Stripped", and other crew members get a "🧹 … marked … as stripped" notification linking back to the page.

- [ ] **Step 5: Commit**

```bash
git add src/pages/CrewPage.tsx src/components/AppBar.tsx
git commit -m "feat: 'this got stripped' control on Crew page + crew_stripped notification"
```

---

## Self-Review

**Spec coverage (step 4a scope):**
- Effective status derived from `expires_at` at read time (no job for correctness) → Task 2 (`isActiveBoulder`) + Task 3 (applied in matcher + discovery) ✓
- Community "this got stripped" archives early → Task 1 (`strip_gym_problem`) + Task 3 (hook) + Task 4 (button) ✓
- Archival closes the crew project (drops from active lists) → Task 3 ✓
- Personal problems/sends preserved → strip only flips `gym_problems.status` (Task 1) ✓
- Stripping notifies the crew → Task 1 (`crew_stripped`) + Task 4 (rendering) ✓
- Deferred to step 4b (documented): Vercel cron, `run_crew_lifecycle`, "X days left" notification, history view. ✓

**Placeholder scan:** No TBD/TODO/vague directives. ✓

**Type consistency:** `isActiveBoulder(gp, now)` signature matches between Task 2 (definition) and Task 3 (use in both hooks). `useStripGymProblem()` taking `gymProblemId: string` matches between Task 3 (definition, in `useGymProblems.ts`) and Task 4 (use). RPC param `p_gym_problem_id` (Task 1) matches the `.rpc(...)` call (Task 3). `crew_stripped` type + `entity_id` + data keys (`name`,`color`) identical between Task 1 (RPC) and Task 4 (rendering). ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-20-gym-problems-step4a-lifecycle.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
