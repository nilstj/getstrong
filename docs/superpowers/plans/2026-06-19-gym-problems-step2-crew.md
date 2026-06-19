# Gym Problems — Step 2 (Crew Membership + Crew Page + Send Notification) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver payoff B of the Crew Projects spec — a Crew page at `/gym-problems/:id` showing who is on a shared boulder right now with live states, send-rate stats, and a real-time "X sent the boulder" notification to crewmates.

**Architecture:** Membership and member state are **derived from `problems`**, not stored. A crew member is any user with a personal problem claimed onto the boulder (`problems.gym_problem_id`), which step 1 already wires up via `claim_gym_problem`. Each member's state is computed from their claimed problems (sent-first-try → flashed; sent → sent; else projecting). `problems`, `gym_problems`, and `profiles` are all readable by any authenticated user (migrations 015, 044, 002), so the crew is read with plain queries — no new table and no RLS-bypass RPC. A single new trigger fires the send notification.

**Tech Stack:** React 18 + TypeScript, Vite, `@tanstack/react-query`, Supabase (Postgres + RLS + triggers + realtime), Tailwind, `react-hot-toast`, `lucide-react`, `react-router-dom`, Vitest (jsdom).

## ⚠️ Deviation from the approved spec (flag for confirmation)

The spec's data model lists a **`gym_problem_members` table** with a stored `state` column. This plan **does not create it.** Rationale, following the three design decisions confirmed for step 2:
- **Membership = claimed problems.** Joining a crew already means `problems.gym_problem_id = <boulder>` (step 1). A separate membership row would duplicate that fact.
- **State auto-derived** (the chosen option, explicitly to avoid drift). A stored `state` column would reintroduce exactly the drift that choice rejected.
- **All source tables are publicly readable**, so the crew is computed at read time with ordinary queries.

Net: less schema, single source of truth, no sync logic. If you require the physical `gym_problem_members` table for a future step, say so before execution and this plan will add it instead of deriving.

## Global Constraints

- **No `gym_problem_members` table.** Crew membership and state are derived from `problems` (see deviation note above).
- **Member state derivation (exact rule):** given all of a user's problems claimed onto the boulder — `flashed` if any has `sent = true && attempts === 1`; else `sent` if any has `sent = true`; else `projecting`. Empty → `projecting`.
- **Stats shown:** crew count, send rate (sent-or-flashed ÷ total), flash count. Nothing else (no attempts sum, no grade spread).
- **Beta feed is OUT of scope** for step 2 (deferred follow-on). Do not build it.
- **Reuse step-1 utilities:** `daysUntil` from `src/utils/gymProblems.ts` for the countdown; the `GymProblem` type from `src/types`.
- **Migrations are numbered SQL applied manually via the Supabase SQL editor** — no CLI/local DB, no SQL test harness. A migration "passes" on clean apply + the verification query. Do not invent a SQL test harness.
- **Tests exist only for pure utilities** (`src/utils/__tests__/*.test.ts`, Vitest). Hooks/components/pages verified with `npx tsc -b` + `npm run lint` + `npm run build`. Apply TDD only to the pure helpers in Task 2.
- **Notification plumbing:** new rows are written only by `SECURITY DEFINER` triggers calling `public.create_notification(recipient, actor, type, entity_id, data)` (migration 037); `create_notification` already skips self-notifications. Client rendering lives in `src/components/AppBar.tsx` via the `ICONS` map, `describe()`, and `routeFor()`.
- **Naming/style:** React Query array keys, hooks named `useX`, `sage-700` accent, `lucide-react` icons, `react-hot-toast`. Follow existing patterns.
- **Out of scope (later steps):** `beta_points`/bounties/leaderboard (step 3), lifecycle cron / "X days left" notification / archival (step 4).

---

### Task 1: Migration 045 — `crew_send` notification trigger

**Files:**
- Create: `supabase/migrations/045_crew_send_notification.sql`

**Interfaces:**
- Consumes: `problems` (with `gym_problem_id` from migration 044), `gym_problems`, `public.create_notification` (migration 037).
- Produces (relied on by Task 5): notifications of `type = 'crew_send'`, `entity_id = <gym_problem_id>`, `data = { color, name, grade, flashed }`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/045_crew_send_notification.sql`:

```sql
-- Crew Projects step 2: notify crewmates when a member sends a shared boulder
-- ("Anna sent the Blue overhang"). Membership and crew state are DERIVED from
-- problems (a member = any user with a problem claimed onto the boulder), so
-- there is no gym_problem_members table — this trigger reads problems directly.

create or replace function public.notify_crew_send()
returns trigger as $$
declare
  v_boulder gym_problems;
  v_grade   text;
  v_flashed boolean;
  v_member  uuid;
begin
  -- Only when the problem is both claimed and sent, at the moment that
  -- combination first becomes true: either `sent` just flipped to true, or the
  -- problem was just claimed while already sent. If it was already
  -- claimed-and-sent, do nothing (avoids duplicate pings on unrelated edits).
  if new.gym_problem_id is null or new.sent is not true then
    return new;
  end if;
  if old.sent is not distinct from true
     and old.gym_problem_id is not distinct from new.gym_problem_id then
    return new;
  end if;

  select * into v_boulder from gym_problems where id = new.gym_problem_id;
  if not found then
    return new;
  end if;

  v_grade   := coalesce(new.grade_value_font, new.grade_value_vscale, v_boulder.community_grade);
  v_flashed := (new.attempts = 1);

  -- Notify every OTHER user with a problem on this boulder (the derived crew).
  for v_member in
    select distinct p.user_id
      from problems p
     where p.gym_problem_id = new.gym_problem_id
       and p.user_id <> new.user_id
  loop
    perform public.create_notification(
      v_member, new.user_id, 'crew_send', new.gym_problem_id,
      jsonb_build_object(
        'color',   v_boulder.color,
        'name',    v_boulder.name,
        'grade',   v_grade,
        'flashed', v_flashed
      )
    );
  end loop;

  return new;
end;
$$ language plpgsql security definer;

create trigger on_problem_crew_send
  after update on problems
  for each row execute procedure public.notify_crew_send();
```

- [ ] **Step 2: Self-review the SQL**

Read it back. Confirm: the early-return guard fires the notification both when `sent` flips true on a claimed problem AND when a sent problem is newly claimed, but NOT on unrelated edits to an already-claimed-and-sent problem (`old.sent is not distinct from true and old.gym_problem_id is not distinct from new.gym_problem_id`). Confirm the loop excludes `new.user_id` and uses `create_notification` (which also self-skips). Confirm `security definer`.

- [ ] **Step 3: Apply via the Supabase SQL editor and verify**

Apply `045_crew_send_notification.sql` in the dashboard. Then confirm the trigger and function exist:

```sql
select tgname from pg_trigger where tgname = 'on_problem_crew_send';
select proname from pg_proc where proname = 'notify_crew_send';
```
Expected: one trigger row, one function row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/045_crew_send_notification.sql
git commit -m "feat: notify crewmates when a member sends a shared boulder (migration 045)"
```

---

### Task 2: Crew types + pure derivation helpers (TDD)

**Files:**
- Modify: `src/types/index.ts` (append)
- Create: `src/utils/crew.ts`
- Test: `src/utils/__tests__/crew.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (relied on by Tasks 3–4):
  - `type CrewState = 'projecting' | 'sent' | 'flashed'`
  - `interface CrewMember { user_id: string; username: string | null; avatar_url: string | null; state: CrewState; joined_at: string }`
  - `interface CrewSummary { total: number; sent: number; flashed: number; sendRate: number }`
  - `interface CrewProblemRow { user_id: string; username: string | null; avatar_url: string | null; sent: boolean; attempts: number; created_at: string }`
  - `deriveMemberState(problems: { sent: boolean; attempts: number }[]): CrewState`
  - `buildCrew(rows: CrewProblemRow[]): CrewMember[]` — group by `user_id`, state via `deriveMemberState`, `joined_at` = earliest `created_at`, sorted by `joined_at` ascending.
  - `summarizeCrew(members: { state: CrewState }[]): CrewSummary`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/crew.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { deriveMemberState, buildCrew, summarizeCrew } from '../crew'

describe('deriveMemberState', () => {
  it('is projecting with no sends', () => {
    expect(deriveMemberState([{ sent: false, attempts: 4 }])).toBe('projecting')
  })
  it('is projecting when empty', () => {
    expect(deriveMemberState([])).toBe('projecting')
  })
  it('is sent when sent in more than one attempt', () => {
    expect(deriveMemberState([{ sent: true, attempts: 3 }])).toBe('sent')
  })
  it('is flashed when sent in exactly one attempt', () => {
    expect(deriveMemberState([{ sent: true, attempts: 1 }])).toBe('flashed')
  })
  it('takes the best outcome across multiple problems', () => {
    expect(deriveMemberState([
      { sent: false, attempts: 9 },
      { sent: true, attempts: 1 },
    ])).toBe('flashed')
    expect(deriveMemberState([
      { sent: true, attempts: 5 },
      { sent: false, attempts: 2 },
    ])).toBe('sent')
  })
})

describe('buildCrew', () => {
  const rows = [
    { user_id: 'b', username: 'Bo', avatar_url: null, sent: false, attempts: 2, created_at: '2026-06-12T10:00:00Z' },
    { user_id: 'a', username: 'Ann', avatar_url: 'x', sent: true, attempts: 1, created_at: '2026-06-11T09:00:00Z' },
    { user_id: 'a', username: 'Ann', avatar_url: 'x', sent: false, attempts: 4, created_at: '2026-06-10T09:00:00Z' },
  ]
  it('groups rows by user with earliest joined_at, sorted ascending', () => {
    const crew = buildCrew(rows)
    expect(crew.map(m => m.user_id)).toEqual(['a', 'b'])
    expect(crew[0]).toMatchObject({ user_id: 'a', username: 'Ann', state: 'flashed', joined_at: '2026-06-10T09:00:00Z' })
    expect(crew[1]).toMatchObject({ user_id: 'b', state: 'projecting', joined_at: '2026-06-12T10:00:00Z' })
  })
  it('returns empty for no rows', () => {
    expect(buildCrew([])).toEqual([])
  })
})

describe('summarizeCrew', () => {
  it('counts total, sends (incl. flashes), flashes, and send rate', () => {
    const s = summarizeCrew([
      { state: 'projecting' }, { state: 'sent' }, { state: 'flashed' },
    ])
    expect(s).toEqual({ total: 3, sent: 2, flashed: 1, sendRate: 2 / 3 })
  })
  it('is all-zero with a zero rate for an empty crew', () => {
    expect(summarizeCrew([])).toEqual({ total: 0, sent: 0, flashed: 0, sendRate: 0 })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/crew.test.ts`
Expected: FAIL — cannot resolve module `../crew`.

- [ ] **Step 3: Write the helpers**

Create `src/utils/crew.ts`:

```ts
import type { CrewState, CrewMember, CrewSummary, CrewProblemRow } from '../types'

export function deriveMemberState(problems: { sent: boolean; attempts: number }[]): CrewState {
  let sent = false
  for (const p of problems) {
    if (p.sent && p.attempts === 1) return 'flashed'
    if (p.sent) sent = true
  }
  return sent ? 'sent' : 'projecting'
}

export function buildCrew(rows: CrewProblemRow[]): CrewMember[] {
  const byUser = new Map<string, CrewProblemRow[]>()
  for (const r of rows) {
    const list = byUser.get(r.user_id)
    if (list) list.push(r)
    else byUser.set(r.user_id, [r])
  }

  const members: CrewMember[] = []
  for (const [user_id, list] of byUser) {
    const joined_at = list.reduce((min, r) => (r.created_at < min ? r.created_at : min), list[0].created_at)
    members.push({
      user_id,
      username: list[0].username,
      avatar_url: list[0].avatar_url,
      state: deriveMemberState(list),
      joined_at,
    })
  }
  members.sort((a, b) => (a.joined_at < b.joined_at ? -1 : a.joined_at > b.joined_at ? 1 : 0))
  return members
}

export function summarizeCrew(members: { state: CrewState }[]): CrewSummary {
  const total = members.length
  const flashed = members.filter(m => m.state === 'flashed').length
  const sent = members.filter(m => m.state === 'sent' || m.state === 'flashed').length
  return { total, sent, flashed, sendRate: total > 0 ? sent / total : 0 }
}
```

- [ ] **Step 4: Add the types**

Append to `src/types/index.ts`:

```ts
export type CrewState = 'projecting' | 'sent' | 'flashed'

export interface CrewMember {
  user_id: string
  username: string | null
  avatar_url: string | null
  state: CrewState
  joined_at: string
}

export interface CrewSummary {
  total: number
  sent: number
  flashed: number
  sendRate: number
}

export interface CrewProblemRow {
  user_id: string
  username: string | null
  avatar_url: string | null
  sent: boolean
  attempts: number
  created_at: string
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/crew.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/utils/crew.ts src/utils/__tests__/crew.test.ts
git commit -m "feat: add crew state-derivation helpers and types"
```

---

### Task 3: `useCrew` data hooks

**Files:**
- Create: `src/hooks/useCrew.ts`

**Interfaces:**
- Consumes: `supabase`, `buildCrew`/`summarizeCrew` from `src/utils/crew`, `GymProblem`/`CrewMember`/`CrewSummary`/`CrewProblemRow` types, `Profile` type from `src/hooks/useProfile`.
- Produces (relied on by Task 4):
  - `useGymProblem(id: string)` → query returning a single `GymProblem`.
  - `useCrew(gymProblemId: string)` → query returning `{ members: CrewMember[]; summary: CrewSummary }`.

- [ ] **Step 1: Write the hooks**

Create `src/hooks/useCrew.ts`. Profiles are fetched in a second query keyed by the distinct user ids (the codebase pattern — there is no FK embed between `problems` and `profiles`; see `useOnWall.ts` / `useFriendsActivity.ts`).

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { buildCrew, summarizeCrew } from '../utils/crew'
import type { GymProblem, CrewMember, CrewSummary, CrewProblemRow } from '../types'

export function useGymProblem(id: string) {
  return useQuery({
    queryKey: ['gym_problem', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gym_problems')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as GymProblem
    },
    enabled: !!id,
  })
}

export function useCrew(gymProblemId: string) {
  return useQuery({
    queryKey: ['crew', gymProblemId],
    queryFn: async (): Promise<{ members: CrewMember[]; summary: CrewSummary }> => {
      const { data: probs, error } = await supabase
        .from('problems')
        .select('user_id, sent, attempts, created_at')
        .eq('gym_problem_id', gymProblemId)
      if (error) throw error
      const problems = (probs ?? []) as { user_id: string; sent: boolean; attempts: number; created_at: string }[]

      const userIds = Array.from(new Set(problems.map(p => p.user_id)))
      const profileById = new Map<string, { username: string | null; avatar_url: string | null }>()
      if (userIds.length > 0) {
        const { data: profiles, error: pErr } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', userIds)
        if (pErr) throw pErr
        for (const pr of (profiles ?? []) as { id: string; username: string | null; avatar_url: string | null }[]) {
          profileById.set(pr.id, { username: pr.username, avatar_url: pr.avatar_url })
        }
      }

      const rows: CrewProblemRow[] = problems.map(p => ({
        user_id: p.user_id,
        username: profileById.get(p.user_id)?.username ?? null,
        avatar_url: profileById.get(p.user_id)?.avatar_url ?? null,
        sent: p.sent,
        attempts: p.attempts,
        created_at: p.created_at,
      }))

      const members = buildCrew(rows)
      return { members, summary: summarizeCrew(members) }
    },
    enabled: !!gymProblemId,
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: no errors. (Hooks are not unit-tested in this repo — the type checker is the gate.)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCrew.ts
git commit -m "feat: add useGymProblem and useCrew hooks (derived crew)"
```

---

### Task 4: Crew page + route + link from the matcher

**Files:**
- Create: `src/pages/CrewPage.tsx`
- Modify: `src/App.tsx` (add route)
- Modify: `src/components/GymProblemMatcher.tsx` (link the claimed-state indicator to the crew page)

**Interfaces:**
- Consumes: `useGymProblem`, `useCrew`, `daysUntil` from `src/utils/gymProblems`, `CrewState` type, `react-router-dom` (`useParams`, `Link`), `lucide-react`.
- Produces: a route `/gym-problems/:id`. No outputs other tasks depend on.

- [ ] **Step 1: Write the Crew page**

Create `src/pages/CrewPage.tsx`:

```tsx
import { useParams, Link } from 'react-router-dom'
import { Users, ArrowLeft } from 'lucide-react'
import { useGymProblem, useCrew } from '../hooks/useCrew'
import { daysUntil } from '../utils/gymProblems'
import type { CrewState } from '../types'

const STATE_LABEL: Record<CrewState, string> = {
  projecting: 'Projecting',
  sent: 'Sent',
  flashed: 'Flashed',
}
const STATE_CLASS: Record<CrewState, string> = {
  projecting: 'bg-gray-100 text-gray-600',
  sent: 'bg-sage-100 text-sage-700',
  flashed: 'bg-amber-100 text-amber-700',
}

export function CrewPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { data: boulder, isLoading: loadingBoulder } = useGymProblem(id)
  const { data: crew, isLoading: loadingCrew } = useCrew(id)

  if (loadingBoulder || loadingCrew) {
    return <div className="p-5 text-sm text-gray-400">Loading crew…</div>
  }
  if (!boulder) {
    return <div className="p-5 text-sm text-gray-400">This boulder no longer exists.</div>
  }

  const left = daysUntil(boulder.expires_at, new Date())
  const summary = crew?.summary
  const members = crew?.members ?? []
  const title = boulder.name || `${boulder.color ?? ''} ${boulder.wall_angle ?? ''}`.trim() || 'Shared boulder'

  return (
    <div className="pb-10">
      <div className="flex items-center gap-2 px-5 py-4">
        <Link to="/dashboard" className="text-gray-500"><ArrowLeft size={20} /></Link>
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      </div>

      {boulder.image_url && (
        <img src={boulder.image_url} alt={title} className="w-full max-h-72 object-cover" />
      )}

      <div className="px-5 mt-4 space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
          {boulder.community_grade && <span className="font-semibold">{boulder.community_grade}</span>}
          {boulder.gym && <span>{boulder.gym}</span>}
          <span className={left >= 0 ? 'text-sage-700 font-medium' : 'text-gray-400'}>
            {left >= 0 ? `${left} days left` : 'Stripped'}
          </span>
        </div>

        {summary && (
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1 font-semibold text-gray-700">
              <Users size={15} strokeWidth={2} /> {summary.total} {summary.total === 1 ? 'climber' : 'climbers'}
            </span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-600">{summary.sent} sent ({Math.round(summary.sendRate * 100)}%)</span>
            {summary.flashed > 0 && (
              <>
                <span className="text-gray-400">·</span>
                <span className="text-amber-600">{summary.flashed} flash{summary.flashed === 1 ? '' : 'es'}</span>
              </>
            )}
          </div>
        )}

        <div className="space-y-2">
          {members.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No one on this boulder yet.</p>
          ) : (
            members.map(m => (
              <div key={m.user_id} className="flex items-center gap-3 p-3 border rounded-xl">
                {m.avatar_url
                  ? <img src={m.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                  : <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-500">
                      {(m.username ?? '?').slice(0, 1).toUpperCase()}
                    </div>}
                <span className="flex-1 text-sm font-medium text-gray-800 truncate">{m.username ?? 'Someone'}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATE_CLASS[m.state]}`}>
                  {STATE_LABEL[m.state]}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Register the route**

In `src/App.tsx`: add the import next to the other page imports —

```tsx
import { CrewPage } from './pages/CrewPage'
```

and add this route inside the `<ProtectedRoute />` element block, alongside the other protected routes (e.g. right after the `/help` route):

```tsx
<Route path="/gym-problems/:id" element={<CrewPage />} />
```

- [ ] **Step 3: Link the matcher's claimed indicator to the crew page**

In `src/components/GymProblemMatcher.tsx`, the claimed branch currently renders a static `<span>`:

```tsx
  if (problem.gym_problem_id) {
    return (
      <span className="inline-flex items-center gap-1 mt-1.5 text-xs text-sage-700 font-medium">
        <Users size={13} strokeWidth={2} /> On a shared boulder
      </span>
    )
  }
```

Replace that `<span>...</span>` with a `Link` to the crew page (add `Link` to the existing `react-router-dom` import, or add the import if absent):

```tsx
  if (problem.gym_problem_id) {
    return (
      <Link
        to={`/gym-problems/${problem.gym_problem_id}`}
        className="inline-flex items-center gap-1 mt-1.5 text-xs text-sage-700 font-medium hover:underline"
      >
        <Users size={13} strokeWidth={2} /> View the crew
      </Link>
    )
  }
```

- [ ] **Step 4: Typecheck, lint, and build**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: no type errors, no new lint errors, build succeeds (a pre-existing vite chunk-size warning is fine).

- [ ] **Step 5: Manual verification**

With migrations 044 and 045 applied, run `npm run dev`. Claim a problem onto a boulder, then tap "View the crew" → the Crew page shows the photo, countdown, a stats row, and your avatar with a state badge. Marking the problem sent (attempts 1) flips your badge to "Flashed".

- [ ] **Step 6: Commit**

```bash
git add src/pages/CrewPage.tsx src/App.tsx src/components/GymProblemMatcher.tsx
git commit -m "feat: Crew page at /gym-problems/:id with live states and stats"
```

---

### Task 5: Render the `crew_send` notification

**Files:**
- Modify: `src/components/AppBar.tsx` (the `ICONS` map, `describe()`, and `routeFor()`)

**Interfaces:**
- Consumes: notifications of `type = 'crew_send'` with `data = { color, name, grade, flashed }` and `entity_id = <gym_problem_id>` (Task 1).
- Produces: nothing.

- [ ] **Step 1: Add the icon**

In `src/components/AppBar.tsx`, in the `ICONS` map (where `help_response: '🆘'` etc. are defined), add:

```tsx
  crew_send: '🧗',
```

- [ ] **Step 2: Add the description case**

In the `describe()` function's `switch (n.type)`, add a case alongside the other help cases:

```tsx
    case 'crew_send': {
      const what = d.name || [d.color, d.grade].filter(Boolean).join(' ') || 'the boulder'
      return { text: `${username} ${d.flashed === 'true' || d.flashed === true ? 'flashed' : 'sent'} ${what} 🧗` }
    }
```

(Note: `n.data` is read as `Record<string, string | undefined>` in `describe`, so a JSON boolean `flashed` may arrive as the string `"true"` or as a boolean depending on coercion — the check above handles both.)

- [ ] **Step 3: Add the route case**

In `routeFor()`'s `switch (n.type)`, add before the `default`:

```tsx
    case 'crew_send':
      return n.entity_id ? `/gym-problems/${n.entity_id}` : null
```

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc -b && npm run build`
Expected: no type errors, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/AppBar.tsx
git commit -m "feat: render crew_send notifications linking to the Crew page"
```

---

## Self-Review

**Spec coverage (step 2 scope):**
- Crew membership → derived from `problems` (deviation documented above); join already implemented by step 1's claim. ✓
- Crew states (projecting/sent/flashed) → `deriveMemberState` (Task 2) + display (Task 4). ✓
- Crew page `/gym-problems/:id` with photo, community grade, countdown, crew list → Task 4. ✓
- Aggregate stats (crew count, send rate, flash count) → `summarizeCrew` (Task 2) + display (Task 4). ✓
- "X sent the boulder" notification to crewmates → Task 1 trigger + Task 5 rendering. ✓
- Beta feed → explicitly DEFERRED (Global Constraints). ✓
- "X days left" notification → deferred to step 4 (lifecycle cron). Noted, not built. ✓
- `beta_points`/bounties/leaderboard → step 3, not built. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"write tests for the above" — every code step contains complete content. ✓

**Type consistency:** `CrewState`/`CrewMember`/`CrewSummary`/`CrewProblemRow` defined in Task 2 are imported unchanged in Tasks 2–4. Helper signatures (`deriveMemberState`, `buildCrew`, `summarizeCrew`) match across Tasks 2–3. `useGymProblem`/`useCrew` names/return shapes match between Task 3 (definition) and Task 4 (use). Notification `type='crew_send'`, `entity_id`, and `data` keys (`color`/`name`/`grade`/`flashed`) are identical in Task 1 (trigger) and Task 5 (rendering). ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-19-gym-problems-step2-crew.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
