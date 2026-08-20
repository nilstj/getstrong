# Shared Sessions (core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a session into something several climbers share — one roster, one boulder list, each climber's own status against it.

**Architecture:** A `session_groups` row is the shared evening; each person's existing `sessions` row points at it with `group_id`, so personal logs stay personal. The group owns an explicit boulder list (`session_group_boulders`) and each climber's `problems` row references a list entry via `group_boulder_id` — so a boulder you never touched costs you no row, and your status is derived: no row = not logged, `sent = false` = project, `sent = true` = sent. Every write that touches another user's data goes through a `SECURITY DEFINER` RPC.

**Tech Stack:** React 19 + TypeScript, Vite, React Query (array query keys), Supabase (Postgres + RLS + `SECURITY DEFINER` RPCs), Tailwind (`sage`/`khaki`), `lucide-react`, `react-hot-toast`, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-shared-sessions-design.md` — this plan is **step 1 minus joining from the feed**, which is its own plan.

**Not in this plan:** joining from the friends feed (`session_join_requests`, `join_session`, `request_to_join_session`, `approve_join_request`, the feed card affordance) and everything in the spec's step 2 (re-anchoring the awards).

## Global Constraints

- **Branch:** `feature/shared-sessions`. Do not push to `main`.
- **Release gate:** migration `080_shared_sessions.sql` is applied **by hand in the Supabase dashboard** and must be applied **before** the client that reads it is deployed. Pushing `main` is a release. Migration **079 is already applied in production** — do not modify it.
- **A solo session must behave exactly as it does today.** No group, `group_id` null, `group_boulder_id` null, and the session view renders as it always has. Any change visible on a solo session is a defect.
- **Never write another user's `sessions` or `problems` rows** except to set `group_id`, and only inside a `SECURITY DEFINER` RPC.
- **Do not widen the read policies on `sessions`.** It is owner-only apart from migration 032's shared-wisdom case. The roster comes from an RPC that returns ids only — not session rows, which carry personal `notes` and `wisdom`.
- **A database constraint beats a check-then-write.** Uniqueness and one-per-person rules are primary keys or unique indexes.
- **No `beta_points`** anywhere in this feature.
- **Build:** `npm run build` = `tsc -b && vite build`, `noUnusedLocals`/`noUnusedParameters` ON — an unused local is a build-failing error.
- **Lint baseline is 16 problems (15 errors, 1 warning).** New work must add zero. Re-measure before starting; it drifts.
- **Tests:** only pure functions in `src/utils/` are unit-tested. There is no `@testing-library/react`. Note **both** conventions exist: `src/utils/x.test.ts` and `src/utils/__tests__/x.test.ts` — search with `find src/utils -name '*<name>*test*'`.
- **Patterns:** array query keys; hooks named `useX`; **no FK embed to `profiles`** — use `profilesByIds` from `src/lib/profiles.ts`; `BottomSheet` for modals, never nested inside a heading; `react-hot-toast` for feedback.
- **Vocabulary:** a **problem** is a climb you logged; a **gym problem / shared boulder** is published to a gym at `/gym-problems/:id`. A **project** is a problem with `sent = false` — it is not a new column, and it must not be confused with the existing Crew Projects feature or `useSharedProjects`.
- **Hit targets** in new mobile UI: at least 44px.
- **Outdoor is out of scope:** every read of `problems` filters `.is('crag', null)`.

---

## File Structure

| File | Responsibility |
|---|---|
| Create `supabase/migrations/080_shared_sessions.sql` | Four tables/columns, RLS, and six RPCs. The whole server contract. |
| Create `src/utils/sessionGroups.ts` | Pure logic: `boulderRows`, `sessionProjectSummary`, `groupRoster`. |
| Create `src/utils/__tests__/sessionGroups.test.ts` | Tests for the above. |
| Create `src/hooks/useSessionGroup.ts` | Every query and mutation for groups, invites and the boulder list. |
| Modify `src/components/ProblemForm.tsx` | Allow 0 tries; label an unsent problem a project. |
| Create `src/components/SessionRoster.tsx` | The "Who was there" section plus its add-people `BottomSheet`. |
| Create `src/components/SessionBoulderList.tsx` | The shared boulder list with per-person status and inline controls. |
| Modify `src/pages/SessionDetailPage.tsx` | Mount both sections when the session has a group. |
| Modify `src/pages/SessionsPage.tsx` | The pending-invite card at the top of the list. |

---

## Task 1: Migration 080 — schema, RLS and RPCs

> **AMENDED AFTER REVIEW — do not re-execute this task from the SQL below.**
> `supabase/migrations/080_shared_sessions.sql` as committed is the source of truth.
> Review found the SQL here guards ownership with `v_owner <> auth.uid()`, which does
> not fire when `auth.uid()` is NULL, letting an unauthenticated caller stamp
> `group_id` onto a stranger's session. It also lacked a unique index on
> `(group_id, user_id)`, so two concurrent accepts double-joined a climber, and
> `add_group_boulder`'s comment described an `on conflict` path the code did not have.
> If you need to re-derive this migration, read the committed file, not this.

**Files:**
- Create: `supabase/migrations/080_shared_sessions.sql`

**Interfaces:**
- Consumes: `sessions (id, user_id, date, location)` and `problems` from migration 001; `gym_problems` from 044; `crews`, `crew_members`, `is_crew_member` from 062.
- Produces: tables `session_groups`, `session_group_invites`, `session_group_boulders`; columns `sessions.group_id`, `problems.group_boulder_id`; RPCs `create_session_group(uuid)`, `invite_to_session_group(uuid, uuid)`, `accept_session_group(uuid)`, `decline_session_group(uuid)`, `add_group_boulder(uuid, uuid, text, text, text, text, text, text, text, text)`, `session_group_roster(uuid)`; helper `is_session_group_member(uuid)`.

- [ ] **Step 1: Write the migration**

```sql
-- Shared sessions: one real-world evening that several personal sessions point at.
--
-- Your `sessions` row stays yours. The group holds the date, the gym, who is in it,
-- and an explicit boulder list. Each climber's `problems` row attaches to a list
-- entry via group_boulder_id, so a boulder nobody logged costs nobody a row and
-- "your status" is derived: no row = not logged, sent = false = project, sent = true
-- = sent. There is no status column and none is wanted.
--
-- The list is an explicit table rather than a union of everyone's problems, because
-- deduping boulders that are not linked to a published gym boulder would need
-- (grade, colour, hold colour) signature matching — the same guessing that made the
-- awards feature fail on its first day in production.
--
-- Nothing here awards beta_points.

-- ── Tables ───────────────────────────────────────────────────────────────────
create table if not exists session_groups (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  gym text not null,
  crew_id uuid references crews(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table sessions add column if not exists group_id uuid references session_groups(id) on delete set null;
create index if not exists sessions_group_idx on sessions (group_id);

create table if not exists session_group_invites (
  group_id uuid not null references session_groups(id) on delete cascade,
  invited_user uuid not null references auth.users(id) on delete cascade,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, invited_user)
);
create index if not exists session_group_invites_user_idx on session_group_invites (invited_user);

-- The shared list: what was on the wall that evening.
create table if not exists session_group_boulders (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references session_groups(id) on delete cascade,
  gym_problem_id uuid references gym_problems(id) on delete set null,
  grade_system text not null check (grade_system in ('v_scale', 'font', 'color')),
  grade_value text,
  grade_value_font text,
  grade_value_vscale text,
  color text,
  hold_color text,
  image_url text,
  beta_video_url text,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists session_group_boulders_group_idx on session_group_boulders (group_id, created_at);

-- One list entry per published boulder: two climbers cannot create rival rows for
-- the same gym problem. Boulders with no gym_problem_id are added deliberately from
-- the list UI, so duplicates there are a user's choice, not a failed heuristic.
create unique index if not exists session_group_boulders_gym_problem_idx
  on session_group_boulders (group_id, gym_problem_id)
  where gym_problem_id is not null;

alter table problems add column if not exists group_boulder_id uuid references session_group_boulders(id) on delete set null;
create index if not exists problems_group_boulder_idx on problems (group_boulder_id);

alter table session_groups          enable row level security;
alter table session_group_invites   enable row level security;
alter table session_group_boulders  enable row level security;

-- ── Membership helper ────────────────────────────────────────────────────────
-- SECURITY DEFINER so a policy can ask "is the caller in this group?" without
-- needing to read other users' sessions rows directly.
--
-- Do NOT revoke execute on this from anon/authenticated: it is referenced inside
-- the RLS policy bodies below, and a policy expression is evaluated as part of the
-- querying role's own query, so the caller needs EXECUTE on it. Revoking would
-- deny every read of the three tables.
create or replace function public.is_session_group_member(p_group uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from sessions s where s.group_id = p_group and s.user_id = auth.uid()
  );
$$;

-- ── SELECT policies ──────────────────────────────────────────────────────────
drop policy if exists "session groups readable by members and invitees" on session_groups;
create policy "session groups readable by members and invitees" on session_groups for select using (
  is_session_group_member(id)
  or exists (select 1 from session_group_invites i where i.group_id = session_groups.id and i.invited_user = auth.uid())
);

drop policy if exists "group invites readable by invitee or members" on session_group_invites;
create policy "group invites readable by invitee or members" on session_group_invites for select
  using (invited_user = auth.uid() or is_session_group_member(group_id));

drop policy if exists "group boulders readable by members" on session_group_boulders;
create policy "group boulders readable by members" on session_group_boulders for select
  using (is_session_group_member(group_id));

-- No INSERT/UPDATE/DELETE policies on any of the three: every write goes through
-- the SECURITY DEFINER functions below, which is what keeps a client from writing
-- another user's rows.

-- ── Creating a group from your own session ───────────────────────────────────
-- Idempotent: a session that already belongs to a group returns that group.
create or replace function public.create_session_group(p_session uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_date date; v_gym text; v_owner uuid;
begin
  select s.user_id, s.date, nullif(trim(s.location), ''), s.group_id
    into v_owner, v_date, v_gym, v_id
    from sessions s where s.id = p_session;
  if v_owner is null then raise exception 'No such session'; end if;
  if v_owner <> auth.uid() then raise exception 'Only the session owner can share it'; end if;
  if v_id is not null then return v_id; end if;
  if v_gym is null then raise exception 'A shared session needs a gym'; end if;

  insert into session_groups (date, gym, created_by) values (v_date, v_gym, auth.uid())
    returning id into v_id;
  update sessions set group_id = v_id where id = p_session;
  return v_id;
end; $$;

-- ── Invites ──────────────────────────────────────────────────────────────────
create or replace function public.invite_to_session_group(p_group uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_session_group_member(p_group) then
    raise exception 'Only people in the session can invite';
  end if;
  if exists (select 1 from sessions where group_id = p_group and user_id = p_user) then
    return;  -- already in
  end if;
  insert into session_group_invites (group_id, invited_user, invited_by)
    values (p_group, p_user, auth.uid())
    on conflict (group_id, invited_user) do nothing;
end; $$;

-- Accepting creates ONLY the caller's own session row. No problems are created:
-- the boulder list is shared, so there is nothing to copy.
create or replace function public.accept_session_group(p_group uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_session uuid; v_date date; v_gym text;
begin
  if not exists (select 1 from session_group_invites where group_id = p_group and invited_user = auth.uid()) then
    raise exception 'No invite to that session';
  end if;
  select date, gym into v_date, v_gym from session_groups where id = p_group;

  -- Merging with a session you already logged is out of scope, so refuse
  -- distinguishably rather than silently creating a duplicate evening.
  if exists (
    select 1 from sessions
     where user_id = auth.uid() and date = v_date and trim(location) = v_gym and group_id is null
  ) then
    raise exception 'ALREADY_LOGGED: you already logged a session that day at that gym';
  end if;

  insert into sessions (user_id, date, location, group_id)
    values (auth.uid(), v_date, v_gym, p_group)
    returning id into v_session;
  delete from session_group_invites where group_id = p_group and invited_user = auth.uid();
  return v_session;
end; $$;

create or replace function public.decline_session_group(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from session_group_invites where group_id = p_group and invited_user = auth.uid();
end; $$;

-- ── The shared boulder list ──────────────────────────────────────────────────
-- Returns the list entry's id, creating it unless this gym problem is already on
-- the list. The unique index is the guard; the on-conflict path is how we return
-- the existing id rather than failing.
create or replace function public.add_group_boulder(
  p_group uuid,
  p_gym_problem_id uuid,
  p_grade_system text,
  p_grade_value text,
  p_grade_value_font text,
  p_grade_value_vscale text,
  p_color text,
  p_hold_color text,
  p_image_url text,
  p_beta_video_url text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_session_group_member(p_group) then
    raise exception 'Only people in the session can add boulders';
  end if;

  if p_gym_problem_id is not null then
    select id into v_id from session_group_boulders
     where group_id = p_group and gym_problem_id = p_gym_problem_id;
    if v_id is not null then return v_id; end if;
  end if;

  insert into session_group_boulders (
    group_id, gym_problem_id, grade_system, grade_value, grade_value_font,
    grade_value_vscale, color, hold_color, image_url, beta_video_url, added_by
  ) values (
    p_group, p_gym_problem_id, p_grade_system, p_grade_value, p_grade_value_font,
    p_grade_value_vscale, p_color, p_hold_color, p_image_url, p_beta_video_url, auth.uid()
  ) returning id into v_id;
  return v_id;
end; $$;

-- ── Roster ───────────────────────────────────────────────────────────────────
-- Ids only. Deliberately NOT a read policy on `sessions`: a session row carries
-- personal `notes` and `wisdom`, and a groupmate has no business reading those.
create or replace function public.session_group_roster(p_group uuid)
returns table (user_id uuid, session_id uuid)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_session_group_member(p_group) then raise exception 'Not your session'; end if;
  return query
    select s.user_id, s.id from sessions s where s.group_id = p_group order by s.created_at;
end; $$;
```

- [ ] **Step 2: Check the guards are constraints, not code**

Run: `grep -n "primary key\|unique index\|check (" supabase/migrations/080_shared_sessions.sql`
Expected: one invite per person is `primary key (group_id, invited_user)`; one list entry per published boulder is the partial `unique index ... where gym_problem_id is not null`; `grade_system` is a `check`. If any of these is instead a `select` then `insert` in plpgsql, fix it — this codebase rejects check-then-write.

- [ ] **Step 3: Check no write policy exists on the three new tables**

Run: `grep -n "create policy" supabase/migrations/080_shared_sessions.sql`
Expected: exactly three, all `for select`. Zero `for insert`, `for update` or `for delete`. Paste the output into your report.

- [ ] **Step 4: Check `sessions` read policies were not widened**

Run: `grep -n "on sessions" supabase/migrations/080_shared_sessions.sql`
Expected: no `create policy` line targets `sessions`. The roster is an RPC precisely so this stays true.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/080_shared_sessions.sql
git commit -m "Add shared session groups, invites and the shared boulder list (migration 080)"
```

- [ ] **Step 6: Apply the migration by hand**

Paste the file into the Supabase dashboard SQL editor and run it. **This is the release gate** — no later task's client code may be deployed before it succeeds. Then confirm:

```sql
select count(*) from session_groups;
select count(*) from session_group_boulders;
```
Expected: both succeed, returning 0.

---

## Task 2: Pure logic (TDD)

**Files:**
- Create: `src/utils/sessionGroups.ts`
- Test: `src/utils/__tests__/sessionGroups.test.ts`

**Interfaces:**
- Produces:
  - `type BoulderStatus = 'none' | 'project' | 'sent'`
  - `interface GroupBoulder { id: string; gym_problem_id: string | null; grade_system: string; grade_value: string | null; grade_value_font: string | null; color: string | null; hold_color: string | null; image_url: string | null; beta_video_url: string | null; created_at: string }`
  - `interface MyEntry { id: string; group_boulder_id: string | null; attempts: number; sent: boolean }`
  - `interface BoulderRow { boulder: GroupBoulder; entryId: string | null; status: BoulderStatus; attempts: number }`
  - `boulderRows(boulders: GroupBoulder[], mine: MyEntry[]): BoulderRow[]`
  - `sessionProjectSummary(rows: BoulderRow[]): { projects: number; sent: number; untouched: number; label: string }`
  - `groupRoster(members: { user_id: string }[], invites: { invited_user: string }[]): { userId: string; pending: boolean }[]`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/sessionGroups.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { boulderRows, sessionProjectSummary, groupRoster } from '../sessionGroups'
import type { GroupBoulder, MyEntry } from '../sessionGroups'

const boulder = (id: string, createdAt: string): GroupBoulder => ({
  id,
  gym_problem_id: null,
  grade_system: 'font',
  grade_value: '6A',
  grade_value_font: '6A',
  color: null,
  hold_color: 'blue',
  image_url: null,
  beta_video_url: null,
  created_at: createdAt,
})
const entry = (boulderId: string | null, attempts: number, sent: boolean): MyEntry =>
  ({ id: 'e-' + boulderId, group_boulder_id: boulderId, attempts, sent })

describe('boulderRows', () => {
  it('is empty when the list is empty', () => {
    expect(boulderRows([], [])).toEqual([])
  })

  it('marks a boulder with no entry of mine as not logged', () => {
    const rows = boulderRows([boulder('b1', '2026-08-18T18:00:00+00:00')], [])
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('none')
    expect(rows[0].entryId).toBeNull()
    expect(rows[0].attempts).toBe(0)
  })

  it('marks an unsent entry as a project and keeps its try count', () => {
    const rows = boulderRows([boulder('b1', '2026-08-18T18:00:00+00:00')], [entry('b1', 3, false)])
    expect(rows[0].status).toBe('project')
    expect(rows[0].attempts).toBe(3)
    expect(rows[0].entryId).toBe('e-b1')
  })

  it('marks a sent entry as sent', () => {
    const rows = boulderRows([boulder('b1', '2026-08-18T18:00:00+00:00')], [entry('b1', 4, true)])
    expect(rows[0].status).toBe('sent')
  })

  it('counts a zero-try project as a project, not as untouched', () => {
    const rows = boulderRows([boulder('b1', '2026-08-18T18:00:00+00:00')], [entry('b1', 0, false)])
    expect(rows[0].status).toBe('project')
    expect(rows[0].attempts).toBe(0)
  })

  it('ignores entries that belong to another boulder', () => {
    const rows = boulderRows([boulder('b1', '2026-08-18T18:00:00+00:00')], [entry('b2', 5, true)])
    expect(rows[0].status).toBe('none')
  })

  it('ignores my problems that are not on the list at all', () => {
    const rows = boulderRows([boulder('b1', '2026-08-18T18:00:00+00:00')], [entry(null, 2, true)])
    expect(rows[0].status).toBe('none')
  })

  it('orders rows oldest-first by the list entry, not by my entries', () => {
    const rows = boulderRows(
      [boulder('b2', '2026-08-18T19:00:00+00:00'), boulder('b1', '2026-08-18T18:00:00+00:00')],
      [entry('b2', 1, false)],
    )
    expect(rows.map(r => r.boulder.id)).toEqual(['b1', 'b2'])
  })
})

describe('sessionProjectSummary', () => {
  const rows = (...statuses: ('none' | 'project' | 'sent')[]) =>
    statuses.map((status, i) => ({
      boulder: boulder('b' + i, '2026-08-18T18:0' + i + ':00+00:00'),
      entryId: status === 'none' ? null : 'e' + i,
      status,
      attempts: status === 'none' ? 0 : 1,
    }))

  it('is all zeroes for an empty list', () => {
    expect(sessionProjectSummary([])).toEqual({ projects: 0, sent: 0, untouched: 0, label: 'No boulders yet' })
  })

  it('counts each status', () => {
    const r = sessionProjectSummary(rows('project', 'project', 'sent', 'none'))
    expect(r.projects).toBe(2)
    expect(r.sent).toBe(1)
    expect(r.untouched).toBe(1)
  })

  it('omits a zero group from the label', () => {
    expect(sessionProjectSummary(rows('sent', 'sent')).label).toBe('2 sent')
  })

  it('joins the groups it does have', () => {
    expect(sessionProjectSummary(rows('project', 'sent', 'none')).label).toBe('1 project · 1 sent · 1 untouched')
  })

  it('singularises one project', () => {
    expect(sessionProjectSummary(rows('project')).label).toBe('1 project')
  })
})

describe('groupRoster', () => {
  it('is empty with nobody', () => {
    expect(groupRoster([], [])).toEqual([])
  })

  it('puts accepted members before pending invitees', () => {
    const r = groupRoster([{ user_id: 'a' }, { user_id: 'b' }], [{ invited_user: 'c' }])
    expect(r).toEqual([
      { userId: 'a', pending: false },
      { userId: 'b', pending: false },
      { userId: 'c', pending: true },
    ])
  })

  it('drops an invite for someone who already accepted, so nobody appears twice', () => {
    const r = groupRoster([{ user_id: 'a' }], [{ invited_user: 'a' }])
    expect(r).toEqual([{ userId: 'a', pending: false }])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/sessionGroups.test.ts`
Expected: FAIL — `Failed to resolve import "../sessionGroups"`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/sessionGroups.ts`:

```ts
/** Where a climber stands on one boulder of a shared session. */
export type BoulderStatus = 'none' | 'project' | 'sent'

/** One entry on a session group's shared boulder list. */
export interface GroupBoulder {
  id: string
  gym_problem_id: string | null
  grade_system: string
  grade_value: string | null
  grade_value_font: string | null
  color: string | null
  hold_color: string | null
  image_url: string | null
  beta_video_url: string | null
  created_at: string
}

/** The caller's own problem row, reduced to what the join needs. */
export interface MyEntry {
  id: string
  group_boulder_id: string | null
  attempts: number
  sent: boolean
}

export interface BoulderRow {
  boulder: GroupBoulder
  entryId: string | null
  status: BoulderStatus
  attempts: number
}

/**
 * Join the group's boulder list to the caller's own entries.
 *
 * Status is derived, never stored: no entry means the boulder is on the wall but
 * not in your log and costs you nothing; an unsent entry is a project whether or
 * not it has tries; a sent entry is a send. Ordering follows the list, so rows do
 * not move as you log.
 */
export function boulderRows(boulders: GroupBoulder[], mine: MyEntry[]): BoulderRow[] {
  const byBoulder = new Map<string, MyEntry>()
  for (const e of mine) {
    if (e.group_boulder_id) byBoulder.set(e.group_boulder_id, e)
  }
  return [...boulders]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(boulder => {
      const e = byBoulder.get(boulder.id)
      return {
        boulder,
        entryId: e?.id ?? null,
        status: e ? (e.sent ? 'sent' : 'project') : 'none',
        attempts: e?.attempts ?? 0,
      }
    })
}

/** The "1 project · 2 sent · 1 untouched" line. Zero groups are omitted. */
export function sessionProjectSummary(rows: BoulderRow[]): {
  projects: number
  sent: number
  untouched: number
  label: string
} {
  const projects = rows.filter(r => r.status === 'project').length
  const sent = rows.filter(r => r.status === 'sent').length
  const untouched = rows.filter(r => r.status === 'none').length
  const parts: string[] = []
  if (projects > 0) parts.push(`${projects} ${projects === 1 ? 'project' : 'projects'}`)
  if (sent > 0) parts.push(`${sent} sent`)
  if (untouched > 0) parts.push(`${untouched} untouched`)
  return { projects, sent, untouched, label: parts.length > 0 ? parts.join(' · ') : 'No boulders yet' }
}

/**
 * Accepted members first, then people still to accept. An invite for someone who
 * has already accepted is dropped, so a race between accepting and a stale invite
 * list cannot show the same climber twice.
 */
export function groupRoster(
  members: { user_id: string }[],
  invites: { invited_user: string }[],
): { userId: string; pending: boolean }[] {
  const accepted = new Set(members.map(m => m.user_id))
  return [
    ...members.map(m => ({ userId: m.user_id, pending: false })),
    ...invites.filter(i => !accepted.has(i.invited_user)).map(i => ({ userId: i.invited_user, pending: true })),
  ]
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/sessionGroups.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Run the whole suite and the build**

Run: `npx vitest run && npm run build`
Expected: all tests pass (195 existing + 16 new = 211); build clean.

- [ ] **Step 6: Commit**

```bash
git add src/utils/sessionGroups.ts src/utils/__tests__/sessionGroups.test.ts
git commit -m "Add shared-session boulder join, summary and roster logic"
```

---

## Task 3: Hooks

**Files:**
- Create: `src/hooks/useSessionGroup.ts`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts`; `useAuth()` from `src/providers/AuthProvider.tsx` (returns `{ user }`); `profilesByIds` from `src/lib/profiles.ts`; the RPCs from Task 1; `GroupBoulder`, `MyEntry` from `src/utils/sessionGroups.ts`.
- Produces: `SessionGroup`, `GroupMember`, `PendingInvite` types; hooks `useSessionGroupRow`, `useGroupRoster`, `useGroupInvites`, `useGroupBoulders`, `useMyGroupInvites`, `useCreateSessionGroup`, `useInviteToSessionGroup`, `useAcceptSessionGroup`, `useDeclineSessionGroup`, `useAddGroupBoulder`.

- [ ] **Step 1: Write the hooks file**

Create `src/hooks/useSessionGroup.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import { profilesByIds } from '../lib/profiles'
import type { GroupBoulder } from '../utils/sessionGroups'

export interface SessionGroup {
  id: string
  date: string
  gym: string
  crew_id: string | null
  created_by: string | null
}

export interface GroupMember {
  user_id: string
  session_id: string
  username: string | null
  avatar_url: string | null
}

export interface PendingInvite {
  invited_user: string
  username: string | null
  avatar_url: string | null
}

/** The group a session belongs to, or null for a solo session. */
export function useSessionGroupRow(groupId: string | null) {
  return useQuery({
    queryKey: ['session_group', groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<SessionGroup | null> => {
      const { data, error } = await supabase
        .from('session_groups')
        .select('id, date, gym, crew_id, created_by')
        .eq('id', groupId)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as SessionGroup | null
    },
  })
}

/** Who has accepted. Ids come from the RPC; names from a second profiles query. */
export function useGroupRoster(groupId: string | null) {
  return useQuery({
    queryKey: ['session_group_roster', groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<GroupMember[]> => {
      const { data, error } = await supabase.rpc('session_group_roster', { p_group: groupId })
      if (error) throw error
      const rows = (data ?? []) as { user_id: string; session_id: string }[]
      const byId = await profilesByIds(rows.map(r => r.user_id))
      return rows.map(r => ({
        ...r,
        username: byId.get(r.user_id)?.username ?? null,
        avatar_url: byId.get(r.user_id)?.avatar_url ?? null,
      }))
    },
  })
}

/** Who has been asked but not yet accepted. */
export function useGroupInvites(groupId: string | null) {
  return useQuery({
    queryKey: ['session_group_invites', groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<PendingInvite[]> => {
      const { data, error } = await supabase
        .from('session_group_invites')
        .select('invited_user')
        .eq('group_id', groupId)
      if (error) throw error
      const rows = (data ?? []) as { invited_user: string }[]
      const byId = await profilesByIds(rows.map(r => r.invited_user))
      return rows.map(r => ({
        ...r,
        username: byId.get(r.invited_user)?.username ?? null,
        avatar_url: byId.get(r.invited_user)?.avatar_url ?? null,
      }))
    },
  })
}

/** The shared boulder list. */
export function useGroupBoulders(groupId: string | null) {
  return useQuery({
    queryKey: ['session_group_boulders', groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<GroupBoulder[]> => {
      const { data, error } = await supabase
        .from('session_group_boulders')
        .select('id, gym_problem_id, grade_system, grade_value, grade_value_font, color, hold_color, image_url, beta_video_url, created_at')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as GroupBoulder[]
    },
  })
}

/** Sessions I have been invited to and not yet accepted. */
export function useMyGroupInvites() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my_session_group_invites', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<{ group: SessionGroup; invited_by: string | null }[]> => {
      const { data, error } = await supabase
        .from('session_group_invites')
        .select('invited_by, session_groups(id, date, gym, crew_id, created_by)')
        .eq('invited_user', user!.id)
      if (error) throw error
      const rows = (data ?? []) as { invited_by: string | null; session_groups: SessionGroup | null }[]
      return rows
        .filter(r => !!r.session_groups)
        .map(r => ({ group: r.session_groups as SessionGroup, invited_by: r.invited_by }))
    },
  })
}

export function useCreateSessionGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { sessionId: string }): Promise<string> => {
      const { data, error } = await supabase.rpc('create_session_group', { p_session: v.sessionId })
      if (error) throw error
      return data as string
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['sessions', v.sessionId] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}

export function useInviteToSessionGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { groupId: string; userId: string }) => {
      const { error } = await supabase.rpc('invite_to_session_group', { p_group: v.groupId, p_user: v.userId })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['session_group_invites', v.groupId] }),
  })
}

export function useAcceptSessionGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { groupId: string }): Promise<string> => {
      const { data, error } = await supabase.rpc('accept_session_group', { p_group: v.groupId })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my_session_group_invites'] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}

export function useDeclineSessionGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { groupId: string }) => {
      const { error } = await supabase.rpc('decline_session_group', { p_group: v.groupId })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my_session_group_invites'] }),
  })
}

/** Puts a boulder on the group's list, returning the list entry's id. */
export function useAddGroupBoulder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      groupId: string
      gymProblemId: string | null
      gradeSystem: string
      gradeValue: string | null
      gradeValueFont: string | null
      gradeValueVscale: string | null
      color: string | null
      holdColor: string | null
      imageUrl: string | null
      betaVideoUrl: string | null
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('add_group_boulder', {
        p_group: v.groupId,
        p_gym_problem_id: v.gymProblemId,
        p_grade_system: v.gradeSystem,
        p_grade_value: v.gradeValue,
        p_grade_value_font: v.gradeValueFont,
        p_grade_value_vscale: v.gradeValueVscale,
        p_color: v.color,
        p_hold_color: v.holdColor,
        p_image_url: v.imageUrl,
        p_beta_video_url: v.betaVideoUrl,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['session_group_boulders', v.groupId] }),
  })
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: clean. If `tsc` flags an unused import, remove it — `noUnusedLocals` is on.

- [ ] **Step 3: Confirm no FK embed to `profiles`**

Run: `grep -n "profiles(" src/hooks/useSessionGroup.ts`
Expected: no matches. (The `session_groups(...)` embed in `useMyGroupInvites` is a different table and is fine — the house rule is specifically about embedding `profiles`.)

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSessionGroup.ts
git commit -m "Add shared session group queries and mutations"
```

---

## Task 4: Let a problem have zero tries

**Files:**
- Modify: `src/components/ProblemForm.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: no new exports. Behaviour change only.

A boulder you have put on your list but not yet tried is a project with **0 tries**. `ProblemForm` currently floors the stepper at 1 and defaults a missing value to 1, so opening such a problem silently credits a try nobody took.

- [ ] **Step 1: Relax the stepper floor**

In `src/components/ProblemForm.tsx`, find the Tries stepper's decrement handler:

```tsx
            onClick={() => setValue('attempts', Math.max(1, attempts - 1))}
```

Change the floor to 0:

```tsx
            onClick={() => setValue('attempts', Math.max(0, attempts - 1))}
```

- [ ] **Step 2: Keep the default for a genuinely new problem**

Leave `attempts: existing?.attempts ?? 1` exactly as it is. A problem you are logging by hand starts at one try; only a boulder taken off a shared list starts at zero, and that path sets `attempts` explicitly rather than relying on the form default. Do not change it.

- [ ] **Step 3: Verify no other floor exists**

Run: `grep -rn "Math.max(1, attempts\|attempts < 1\|attempts >= 1" src/`
Expected: no matches.

- [ ] **Step 4: Verify build, lint and tests**

Run: `npm run build && npx vitest run && npm run lint 2>&1 | tail -3`
Expected: build clean; 211 tests pass; lint reports **16 problems**.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProblemForm.tsx
git commit -m "Allow a problem to have zero tries"
```

---

## Task 5: The roster section and the add-people sheet

**Files:**
- Create: `src/components/SessionRoster.tsx`
- Modify: `src/pages/SessionDetailPage.tsx`

**Interfaces:**
- Consumes: `useSessionGroupRow`, `useGroupRoster`, `useGroupInvites`, `useCreateSessionGroup`, `useInviteToSessionGroup` from Task 3; `groupRoster` from Task 2; `useFollowing` from `src/hooks/useFollows.ts`; `BottomSheet`.
- Produces: `SessionRoster({ sessionId, groupId, isOwner }: { sessionId: string; groupId: string | null; isOwner: boolean })`.

Layout follows artboard 3 ("Who was there") of the mockup. Copy exactly as given.

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react'
import { Plus, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { BottomSheet } from './BottomSheet'
import { useFollowing } from '../hooks/useFollows'
import { useProfile } from '../hooks/useProfile'
import { groupRoster } from '../utils/sessionGroups'
import {
  useGroupRoster, useGroupInvites, useCreateSessionGroup, useInviteToSessionGroup,
} from '../hooks/useSessionGroup'

/**
 * Who was at a session. A solo session has no group yet, so the only thing shown
 * is the affordance that creates one — which is what makes a session shareable.
 */
export function SessionRoster({
  sessionId, groupId, isOwner,
}: { sessionId: string; groupId: string | null; isOwner: boolean }) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(groupId)
  const { data: members = [] } = useGroupRoster(pendingGroupId)
  const { data: invites = [] } = useGroupInvites(pendingGroupId)
  const createGroup = useCreateSessionGroup()

  const rows = groupRoster(members, invites)
  const nameOf = (userId: string) =>
    members.find(m => m.user_id === userId)?.username ??
    invites.find(i => i.invited_user === userId)?.username ?? null
  const avatarOf = (userId: string) =>
    members.find(m => m.user_id === userId)?.avatar_url ??
    invites.find(i => i.invited_user === userId)?.avatar_url ?? null

  const openSheet = () => {
    if (pendingGroupId) { setSheetOpen(true); return }
    createGroup.mutate({ sessionId }, {
      onSuccess: id => { setPendingGroupId(id); setSheetOpen(true) },
      onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not share this session'),
    })
  }

  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Who was there</h2>
      <div className="bg-gray-50 rounded-2xl p-3">
        <div className="flex items-start gap-3 flex-wrap">
          {rows.map(r => (
            <div key={r.userId} className="flex flex-col items-center gap-1.5 w-14">
              <span className={`relative w-11 h-11 rounded-full grid place-items-center text-[15px] font-semibold overflow-hidden ${
                r.pending ? 'bg-gray-100 text-gray-400' : 'bg-sage-100 text-sage-700'
              }`}>
                {avatarOf(r.userId)
                  ? <img src={avatarOf(r.userId)!} alt="" className="w-full h-full object-cover" />
                  : (nameOf(r.userId) ?? '?').slice(0, 1).toUpperCase()}
                {r.pending && (
                  <span className="absolute -right-0.5 -bottom-0.5 w-[18px] h-[18px] rounded-full bg-white border border-gray-200 text-gray-400 grid place-items-center">
                    <Clock size={11} strokeWidth={2.5} />
                  </span>
                )}
              </span>
              <span className={`text-[11px] font-semibold text-center truncate max-w-full ${r.pending ? 'text-gray-400' : 'text-gray-800'}`}>
                {nameOf(r.userId) ?? 'Someone'}
              </span>
              {r.pending && <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">Asked</span>}
            </div>
          ))}

          {isOwner && (
            <button
              type="button"
              onClick={openSheet}
              disabled={createGroup.isPending}
              className="flex flex-col items-center gap-1.5 w-14 disabled:opacity-50"
            >
              <span className="w-11 h-11 rounded-full border border-dashed border-gray-300 grid place-items-center text-gray-400">
                <Plus size={18} strokeWidth={2} />
              </span>
              <span className="text-[11px] font-semibold text-gray-400">Add</span>
            </button>
          )}
        </div>

        {rows.some(r => r.pending) && (
          <p className="text-[11px] text-gray-400 mt-2.5">
            Faded climbers haven't accepted yet. Everyone else logs their own climbs here.
          </p>
        )}
      </div>

      {pendingGroupId && (
        <AddPeopleSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          groupId={pendingGroupId}
          alreadyIn={new Set([...members.map(m => m.user_id), ...invites.map(i => i.invited_user)])}
        />
      )}
    </div>
  )
}

function AddPeopleSheet({
  open, onClose, groupId, alreadyIn,
}: { open: boolean; onClose: () => void; groupId: string; alreadyIn: Set<string> }) {
  const { data: following = [] } = useFollowing()
  const invite = useInviteToSessionGroup()
  const candidates = following.filter(f => !alreadyIn.has(f.following_id))

  return (
    <BottomSheet open={open} onClose={onClose} title="Who was there?">
      <div className="space-y-4">
        <p className="text-xs text-gray-500 leading-relaxed">
          They get the session in their own log to accept, sharing this boulder list.
          Their tries and sends stay their own, and nothing counts toward their stats
          until they accept.
        </p>
        {candidates.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Everyone you follow is already here.</p>
        ) : (
          <div className="space-y-2">
            {candidates.map(f => (
              <CandidateRow
                key={f.following_id}
                userId={f.following_id}
                onInvite={() => invite.mutate(
                  { groupId, userId: f.following_id },
                  {
                    onSuccess: () => toast.success('Asked them'),
                    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not ask'),
                  },
                )}
              />
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  )
}

function CandidateRow({ userId, onInvite }: { userId: string; onInvite: () => void }) {
  const { data: profile } = useProfile(userId)
  return (
    <div className="flex items-center gap-3 bg-gray-50 rounded-2xl p-3 min-h-14">
      <span className="w-9 h-9 rounded-full bg-sage-100 grid place-items-center text-sm font-semibold text-sage-700 overflow-hidden flex-shrink-0">
        {profile?.avatar_url
          ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
          : profile?.username?.[0]?.toUpperCase() ?? '?'}
      </span>
      <span className="flex-1 text-sm font-medium text-gray-800 truncate">{profile?.username ?? '…'}</span>
      <button
        type="button"
        onClick={onInvite}
        className="min-h-11 px-4 rounded-full bg-sage-700 text-white text-sm font-semibold"
      >
        Ask
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Mount it on the session page**

In `src/pages/SessionDetailPage.tsx`, add the import beside the other component imports:

```tsx
import { SessionRoster } from '../components/SessionRoster'
```

Then insert it directly after the session header block (the `<div className="flex items-start justify-between">…</div>` that holds the gym name, date and partner controls) and before the `{problems.length > 0 && (` block:

```tsx
      {!planned && (
        <SessionRoster
          sessionId={id!}
          groupId={session.group_id ?? null}
          isOwner={session.user_id === user?.id}
        />
      )}
```

Read the surrounding JSX first so the insertion sits at the same nesting level as its siblings. The page already has `session`, `id`, `user` and `planned` in scope — do not introduce new ones.

- [ ] **Step 3: Add `group_id` to the Session type**

In `src/types/index.ts`, add one field to the existing `Session` interface, after `wisdom_shared`:

```ts
  group_id: string | null
```

- [ ] **Step 4: Verify build, lint and tests**

Run: `npm run build && npx vitest run && npm run lint 2>&1 | tail -3`
Expected: build clean; 211 tests pass; lint **16 problems**.

- [ ] **Step 5: Verify a `BottomSheet` is not inside a heading**

Run: `grep -n "BottomSheet\|<h2" src/components/SessionRoster.tsx`
Expected: the `BottomSheet` is a sibling of the section, never inside the `<h2>` — a `BottomSheet` in a heading inherits its font weight and is invalid markup.

- [ ] **Step 6: Commit**

```bash
git add src/components/SessionRoster.tsx src/pages/SessionDetailPage.tsx src/types/index.ts
git commit -m "Show who was at a session and let the owner add people"
```

---

## Task 6: The shared boulder list

**AMENDED AFTER REVIEW — do not re-execute this task from the code below.**
The committed files are the source of truth. Review found the write buttons were
not disabled while the mutation was in flight and nothing enforced one entry per
climber per shared boulder, so a double-tap created a second `problems` row that
`boulderRows` hides but the climber's stats still count. It also found the insert
left `grade_value_vscale` null, unlike `useAddProblem` which computes both scales.

**Files:**
- Create: `src/components/SessionBoulderList.tsx`
- Modify: `src/pages/SessionDetailPage.tsx`

**Interfaces:**
- Consumes: `useGroupBoulders` from Task 3; `boulderRows`, `sessionProjectSummary` from Task 2; `useSessionProblems` from `src/hooks/useProblems.ts`; `useUpdateProblem` from the same file; `HoldGraphic` from `src/components/Chip.tsx`.
- Produces: `SessionBoulderList({ sessionId, groupId }: { sessionId: string; groupId: string })`.

Layout follows artboard 2 of the mockup. The three states are `Not logged`, `Project` and `Sent`, and the status chip colours are: not logged `bg-gray-100 text-gray-400`, project `bg-khaki-100 text-khaki-700`, sent `bg-sage-50 text-sage-800`.

- [ ] **Step 1: Add the mutation this section needs**

In `src/hooks/useSessionGroup.ts`, append a mutation that creates or updates the caller's entry for one list boulder. It is here rather than in `useProblems.ts` because it is specific to the shared-list flow.

```ts
/**
 * Create or update my own entry for one boulder on the group's list. Creating is
 * what turns "on the wall" into "on my list": a first try makes it a project at
 * one attempt, and marking it sent from untouched records a single try, because a
 * send with zero attempts is not a thing.
 */
export function useSetMyBoulderEntry() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (v: {
      sessionId: string
      groupId: string
      groupBoulderId: string
      entryId: string | null
      attempts: number
      sent: boolean
      boulder: GroupBoulder
    }) => {
      if (v.entryId) {
        const { error } = await supabase
          .from('problems')
          .update({ attempts: v.attempts, sent: v.sent })
          .eq('id', v.entryId)
        if (error) throw error
        return
      }
      const { error } = await supabase.from('problems').insert({
        session_id: v.sessionId,
        user_id: user!.id,
        group_boulder_id: v.groupBoulderId,
        // Carried from the list entry, not assumed: a colour-graded gym stores
        // 'color' here, and hardcoding 'font' would violate the check constraint.
        grade_system: v.boulder.grade_system,
        grade_value: v.boulder.grade_value,
        grade_value_font: v.boulder.grade_value_font,
        color: v.boulder.color,
        hold_color: v.boulder.hold_color,
        image_url: v.boulder.image_url,
        beta_video_url: v.boulder.beta_video_url,
        gym_problem_id: v.boulder.gym_problem_id,
        attempts: v.attempts,
        sent: v.sent,
      })
      if (error) throw error
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['problems', v.sessionId] })
      qc.invalidateQueries({ queryKey: ['session_group_boulders', v.groupId] })
    },
  })
}
```

- [ ] **Step 2: Write the component**

```tsx
import { Plus, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { HoldGraphic } from './Chip'
import { useSessionProblems } from '../hooks/useProblems'
import { useGroupBoulders, useSetMyBoulderEntry } from '../hooks/useSessionGroup'
import { boulderRows, sessionProjectSummary } from '../utils/sessionGroups'
import type { BoulderStatus } from '../utils/sessionGroups'

const CHIP: Record<BoulderStatus, { label: string; className: string }> = {
  none:    { label: 'Not logged', className: 'bg-gray-100 text-gray-400' },
  project: { label: 'Project',    className: 'bg-khaki-100 text-khaki-700' },
  sent:    { label: 'Sent',       className: 'bg-sage-50 text-sage-800' },
}

/**
 * The group's shared boulder list, joined to the caller's own entries. A boulder
 * with no entry of yours is on the wall but not in your log, and costs you no row.
 */
export function SessionBoulderList({ sessionId, groupId }: { sessionId: string; groupId: string }) {
  const { data: boulders = [] } = useGroupBoulders(groupId)
  const { data: problems = [] } = useSessionProblems(sessionId)
  const setEntry = useSetMyBoulderEntry()

  const rows = boulderRows(
    boulders,
    problems.map(p => ({ id: p.id, group_boulder_id: p.group_boulder_id, attempts: p.attempts, sent: p.sent })),
  )
  const summary = sessionProjectSummary(rows)

  if (boulders.length === 0) return null

  const save = (
    row: (typeof rows)[number],
    next: { attempts: number; sent: boolean },
  ) => {
    setEntry.mutate(
      {
        sessionId, groupId,
        groupBoulderId: row.boulder.id,
        entryId: row.entryId,
        boulder: row.boulder,
        ...next,
      },
      { onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not save') },
    )
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-base font-semibold">Boulders ({boulders.length})</h2>
        <span className="text-xs font-semibold text-gray-400 tabular-nums">{summary.label}</span>
      </div>

      <div className="space-y-2">
        {rows.map(row => {
          const chip = CHIP[row.status]
          return (
            <div
              key={row.boulder.id}
              className={`rounded-2xl p-3 border ${row.status === 'none' ? 'bg-white border-dashed border-gray-300' : 'bg-gray-50 border-gray-100'}`}
            >
              <div className="flex items-start gap-2.5">
                <div className="w-14 h-14 rounded-xl bg-gray-100 grid place-items-center flex-shrink-0">
                  {row.boulder.image_url
                    ? <img src={row.boulder.image_url} alt="" className="w-full h-full object-cover rounded-xl" />
                    : <HoldGraphic color={row.boulder.hold_color} size={36} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {row.boulder.grade_value && (
                      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold tracking-tight bg-sage-700 text-white">
                        {row.boulder.grade_value}
                      </span>
                    )}
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${chip.className}`}>
                      {chip.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">
                    {row.attempts === 0 ? 'no tries logged' : `${row.attempts} ${row.attempts === 1 ? 'try' : 'tries'}`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-2.5">
                <button
                  type="button"
                  onClick={() => save(row, { attempts: row.attempts + 1, sent: row.status === 'sent' })}
                  className="flex-1 min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-white border border-gray-200 text-gray-600 text-sm font-semibold"
                >
                  <Plus size={15} strokeWidth={2.25} />
                  {row.attempts === 0 ? 'Add a try' : `${row.attempts} ${row.attempts === 1 ? 'try' : 'tries'}`}
                </button>
                <button
                  type="button"
                  onClick={() => save(row, {
                    attempts: row.attempts === 0 ? 1 : row.attempts,
                    sent: row.status !== 'sent',
                  })}
                  aria-pressed={row.status === 'sent'}
                  className={`min-h-11 min-w-11 px-3.5 inline-flex items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold ${
                    row.status === 'sent'
                      ? 'bg-sage-50 border-sage-300 text-sage-800'
                      : 'bg-white border-gray-200 text-gray-400'
                  }`}
                >
                  <Check size={16} strokeWidth={2.5} />
                  Sent
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Mount it on the session page**

In `src/pages/SessionDetailPage.tsx`, add the import:

```tsx
import { SessionBoulderList } from '../components/SessionBoulderList'
```

Then insert it directly after the `SessionRoster` from Task 5 and **before** the existing `{problems.length > 0 && (` Problems block:

```tsx
      {session.group_id && <SessionBoulderList sessionId={id!} groupId={session.group_id} />}
```

The existing Problems block stays exactly as it is. A grouped session shows both: the shared list with your status, and your own problem rows below with their full detail and editing. Do not delete or restructure the Problems block — that is not this plan's job.

- [ ] **Step 4: Verify a solo session is untouched**

Run: `grep -n "session.group_id" src/pages/SessionDetailPage.tsx`
Expected: both new sections are guarded on `session.group_id` (the roster additionally renders for the owner so they can create a group). A session with `group_id` null must render exactly as it did before this branch.

- [ ] **Step 5: Verify build, lint and tests**

Run: `npm run build && npx vitest run && npm run lint 2>&1 | tail -3`
Expected: build clean; 211 tests pass; lint **16 problems**.

- [ ] **Step 6: Commit**

```bash
git add src/components/SessionBoulderList.tsx src/hooks/useSessionGroup.ts src/pages/SessionDetailPage.tsx
git commit -m "Show the shared boulder list with each climber's own status"
```

---

## Task 7: The pending-invite card

**Files:**
- Modify: `src/pages/SessionsPage.tsx`

**Interfaces:**
- Consumes: `useMyGroupInvites`, `useAcceptSessionGroup`, `useDeclineSessionGroup` from Task 3. Nothing else — do not import `useProfile`, the card shows no avatars.
- Produces: no new exports.

Layout and copy follow artboard 1 of the mockup.

- [ ] **Step 1: Add the card**

In `src/pages/SessionsPage.tsx`, add the imports:

```tsx
import { Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { useMyGroupInvites, useAcceptSessionGroup, useDeclineSessionGroup } from '../hooks/useSessionGroup'
```

(If the page already imports `useNavigate` or `toast`, do not import them twice — `noUnusedLocals` and the linter will both object.)

Then add this component at the bottom of the file:

```tsx
/** Sessions someone added you to, waiting for you to say you were there. */
function PendingSessionInvites() {
  const { data: invites = [] } = useMyGroupInvites()
  const accept = useAcceptSessionGroup()
  const decline = useDeclineSessionGroup()
  const navigate = useNavigate()

  if (invites.length === 0) return null

  return (
    <div className="space-y-2">
      {invites.map(({ group }) => (
        <div key={group.id} className="bg-white border border-sage-200 rounded-2xl p-3.5">
          <p className="text-sm font-bold leading-snug">You were added to a session</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Accept if you were there · {group.date} · {group.gym}
          </p>
          <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
            The session's boulder list is already there. Nothing lands in your log until you log it.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => accept.mutate({ groupId: group.id }, {
                onSuccess: sessionId => { toast.success('Added to your log'); navigate(`/sessions/${sessionId}`) },
                onError: (e: unknown) => {
                  const msg = e instanceof Error ? e.message : ''
                  toast.error(msg.includes('ALREADY_LOGGED')
                    ? 'You already logged a session that day at that gym'
                    : 'Could not accept')
                },
              })}
              disabled={accept.isPending}
              className="flex-1 min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-sage-700 text-white text-[15px] font-semibold disabled:opacity-50"
            >
              <Check size={16} strokeWidth={2.5} />
              Accept
            </button>
            <button
              type="button"
              onClick={() => decline.mutate({ groupId: group.id }, { onError: () => toast.error('Failed') })}
              className="min-h-11 px-4 rounded-xl border border-gray-200 bg-white text-gray-500 text-[15px] font-semibold"
            >
              Wasn't me
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Render it at the top of the list**

Mount `<PendingSessionInvites />` as the first child inside the page's main content container, above the sessions list and below the page heading. Read the file first and match the sibling nesting level and spacing.

- [ ] **Step 3: Verify the ALREADY_LOGGED path is handled**

Run: `grep -n "ALREADY_LOGGED" src/pages/SessionsPage.tsx supabase/migrations/080_shared_sessions.sql`
Expected: raised in the migration, matched in the page. Merging is out of scope, so the interim behaviour is this explicit message rather than a silent duplicate session.

- [ ] **Step 4: Verify build, lint and tests**

Run: `npm run build && npx vitest run && npm run lint 2>&1 | tail -3`
Expected: build clean; 211 tests pass; lint **16 problems**.

- [ ] **Step 5: Commit**

```bash
git add src/pages/SessionsPage.tsx
git commit -m "Show sessions you were added to, waiting to be accepted"
```

---

## Task 8: Verification pass

**Files:** none changed unless a defect is found.

- [ ] **Step 1: Confirm the migration is applied**

In the Supabase dashboard: `select count(*) from session_group_boulders;`
Expected: succeeds. If it errors, migration 080 was never applied and nothing below will work.

- [ ] **Step 2: Full automated check**

Run: `npm run build && npx vitest run && npm run lint 2>&1 | tail -3`
Expected: build clean, 211 tests pass, lint **16 problems** — the same baseline this branch started from. Any increase is yours to fix.

- [ ] **Step 3: Confirm the write policies really are absent**

In the Supabase dashboard, as an ordinary authenticated user (not the service role):

```sql
insert into session_group_boulders (group_id, grade_system) values (gen_random_uuid(), 'font');
```
Expected: refused by row-level security. Every write must go through the RPCs.

- [ ] **Step 4: Manual pass on a phone-width viewport (375px)**

Run `npm run dev`, then walk this list. Hooks, components and pages have no automated coverage in this project, so this pass *is* the test.

- [ ] **A solo session looks exactly as it did before.** Open an existing session with no group: no boulder-list section, the Problems block unchanged, and only the "Add" affordance in the roster.
- [ ] Tap Add on your own session → a group is created and the sheet opens. Ask someone.
- [ ] As that person, open `/sessions` → the invite card is at the top with the date and gym.
- [ ] Tap **Accept** → you land on a new session at the right date and gym, and **your log has no problems in it**.
- [ ] The boulder list shows every boulder the other person logged, each as `Not logged`.
- [ ] Tap `Add a try` on one → it becomes `Project · 1 try`. Reload; it persists.
- [ ] Tap `Sent` on an untouched one → it becomes `Sent` with 1 try, not 0.
- [ ] Tap `Sent` again → back to `Project`, try count kept.
- [ ] Open that problem in the normal Problems block and set tries to 0 with the stepper — it must reach 0, not stop at 1.
- [ ] Both climbers' rosters show each other, and a pending invitee shows faded with "Asked".
- [ ] Accept an invite for a day you already logged at that gym → the "already logged a session that day" message appears and no second session is created.
- [ ] Nothing anywhere claims you sent something you did not.

- [ ] **Step 5: Confirm no points were minted**

Run: `grep -rn "beta_points" supabase/migrations/080_shared_sessions.sql src/hooks/useSessionGroup.ts src/components/SessionRoster.tsx src/components/SessionBoulderList.tsx src/utils/sessionGroups.ts`
Expected: no matches.

- [ ] **Step 6: Commit any fixes and finish the branch**

```bash
git add -A
git commit -m "Fix defects found in the shared sessions manual pass"
```

Then use the `superpowers:finishing-a-development-branch` skill. **Do not push before migration 080 is applied in Supabase** — a push to `main` is a release.

---

## Task 9: Put a boulder on the shared list from the UI

**Files:**
- Modify: `src/components/SessionBoulderList.tsx`
- Modify: `src/pages/SessionDetailPage.tsx`

**Interfaces:**
- Consumes: `useAddGroupBoulder`, `useSetMyBoulderEntry` from Task 3; `GymBoulderPicker` from `src/components/GymBoulderPicker.tsx` (`{ gym, onPick }`, where `onPick: (gp: GymProblem) => void`); `boulderToPrefill` from `src/utils/boulderPrefill.ts`; `vScaleToFont`, `fontToVScale` from `src/utils/grades.ts`; `BottomSheet`.
- Produces: `SessionBoulderList` gains a required `gym: string` prop.

Without this, `useAddGroupBoulder` exists but nothing calls it: a climber who accepts an invite can log against boulders other people added, but cannot put one of their own on the list. This closes that.

- [ ] **Step 1: Give the list its gym and an add control**

In `src/components/SessionBoulderList.tsx`, widen the props and add the sheet state. Change the signature to:

```tsx
export function SessionBoulderList({
  sessionId, groupId, gym,
}: { sessionId: string; groupId: string; gym: string }) {
```

Add these imports at the top of the file:

```tsx
import { useState } from 'react'
import { BottomSheet } from './BottomSheet'
import { GymBoulderPicker } from './GymBoulderPicker'
import { boulderToPrefill } from '../utils/boulderPrefill'
import { fontToVScale, vScaleToFont } from '../utils/grades'
import { useAddGroupBoulder } from '../hooks/useSessionGroup'
import type { GymProblem } from '../types'
```

Then inside the component, above the existing `if (boulders.length === 0) return null`, add:

```tsx
  const [pickerOpen, setPickerOpen] = useState(false)
  const addBoulder = useAddGroupBoulder()
```

**Delete the `if (boulders.length === 0) return null` line.** An empty list must still render, because otherwise the only control that can fill it is unreachable — the section now shows the add control plus an empty line.

- [ ] **Step 2: Normalise the grade once, in one place**

A picked shared boulder carries a single `community_grade` string, but `problems` and `session_group_boulders` both store a font value and a V-scale value. Add this helper at the bottom of `src/components/SessionBoulderList.tsx`, so the two writes cannot disagree:

```tsx
/**
 * A shared boulder has one community grade; the list and the problem rows each
 * store both scales. `useUpdateProblem` already normalises this way when a grade is
 * edited, so deriving both here keeps the shared list consistent with the rest of
 * the app rather than storing a half-populated grade.
 */
function normaliseGrade(grade: string | null): {
  gradeValue: string | null
  gradeValueFont: string | null
  gradeValueVscale: string | null
} {
  if (!grade) return { gradeValue: null, gradeValueFont: null, gradeValueVscale: null }
  const asFont = vScaleToFont(grade)
  if (asFont) return { gradeValue: grade, gradeValueFont: asFont, gradeValueVscale: grade }
  return { gradeValue: grade, gradeValueFont: grade, gradeValueVscale: fontToVScale(grade) }
}
```

If `vScaleToFont` and `fontToVScale` do not have exactly these signatures (`(g: string) => string | null`), read `src/utils/grades.ts` and adapt the calls — do **not** invent a second normalisation scheme, and do not silently store only one scale.

- [ ] **Step 3: Add the control and its sheet**

Append this inside the component's returned markup, directly after the closing `</div>` of the rows list and before the component's outermost closing `</div>`:

```tsx
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="w-full min-h-12 mt-2 inline-flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-gray-300 text-gray-600 text-sm font-semibold"
      >
        <Plus size={16} strokeWidth={2.25} />
        Add a boulder to the session
      </button>

      <BottomSheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Add a boulder">
        <p className="text-xs text-gray-500 mb-3 leading-relaxed">
          Puts it on the session's list for everyone, and on yours as a project.
        </p>
        <GymBoulderPicker
          gym={gym}
          onPick={(gp: GymProblem) => {
            const prefill = boulderToPrefill(gp)
            const grade = normaliseGrade(prefill.grade_value)
            addBoulder.mutate(
              {
                groupId,
                gymProblemId: gp.id,
                gradeSystem: 'font',
                gradeValue: grade.gradeValue,
                gradeValueFont: grade.gradeValueFont,
                gradeValueVscale: grade.gradeValueVscale,
                color: prefill.color,
                holdColor: prefill.hold_color,
                imageUrl: prefill.image_url,
                betaVideoUrl: prefill.beta_video_url,
              },
              {
                onSuccess: () => { setPickerOpen(false); toast.success('On the list') },
                onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not add it'),
              },
            )
          }}
        />
      </BottomSheet>
```

Note the boulder is added to the **group's list only**. It does not create your entry: `add_group_boulder` is idempotent on `(group_id, gym_problem_id)`, so tapping a boulder someone already added is harmless, and you then log your own tries with the row's existing controls like any other boulder. That keeps one path for "my status" instead of two.

- [ ] **Step 4: Pass the gym in**

In `src/pages/SessionDetailPage.tsx`, update the mount from Task 6 to pass the session's location:

```tsx
      {session.group_id && (
        <SessionBoulderList sessionId={id!} groupId={session.group_id} gym={session.location} />
      )}
```

- [ ] **Step 5: Verify build, lint and tests**

Run: `npm run build && npx vitest run && npm run lint 2>&1 | tail -3`
Expected: build clean; 211 tests pass; lint **16 problems**.

- [ ] **Step 6: Verify the empty-list path is reachable**

Run: `grep -n "boulders.length === 0" src/components/SessionBoulderList.tsx`
Expected: no early `return null` on an empty list — otherwise a brand-new group can never get its first boulder.

- [ ] **Step 7: Commit**

```bash
git add src/components/SessionBoulderList.tsx src/pages/SessionDetailPage.tsx
git commit -m "Let anyone in a shared session put a boulder on its list"
```


---

## Self-Review

**Spec coverage (step 1 minus join-from-feed):**

| Spec requirement | Task |
|---|---|
| `session_groups`, `sessions.group_id` | 1 |
| Group created lazily, only by the session owner | 1 (`create_session_group`), 5 (the Add affordance) |
| `session_group_invites`, invite / accept / decline | 1, 3, 7 |
| Accepting creates only your session row, no problems | 1 (`accept_session_group`), 8 Step 4 |
| `session_group_boulders`, one entry per published boulder | 1 (partial unique index) |
| `problems.group_boulder_id` | 1 |
| Status derived: none / project / sent | 2 (`boulderRows`), 6 (the chips) |
| `attempts = 0` reachable | 4, 8 Step 4 |
| Roster without widening `sessions` reads | 1 (`session_group_roster` RPC), 5 |
| Add a boulder to the group's list | 1 (`add_group_boulder`), 3 (`useAddGroupBoulder`), 9 (the picker UI) |
| Every cross-user write is `SECURITY DEFINER` | 1, 8 Step 3 |
| Solo sessions unchanged | 6 Step 4, 8 Step 4 |
| `ALREADY_LOGGED` instead of a duplicate session | 1, 7 |
| No `beta_points` | 8 Step 5 |
| Release gate on 080 | 1 Step 6, 8 Step 1, 8 Step 6 |

**Gap found in the first draft and now closed:** `useAddGroupBoulder` was built in Task 3 with no screen calling it, which meant a climber could log against boulders others added but never put one of their own on the list. **Task 9** closes it with the gym-boulder picker, and also removes the empty-list early return that would otherwise have made a brand-new group's first boulder unreachable.

**Placeholder scan:** every code step carries complete code; no TBD, no "similar to Task N", no "add error handling" — each mutation names its own `onError`.

**Type consistency:** `GroupBoulder`, `MyEntry`, `BoulderRow`, `BoulderStatus` are declared once in `src/utils/sessionGroups.ts` and imported by the hooks and both components. The RPC names and parameter names in Task 3 (`create_session_group`/`p_session`, `invite_to_session_group`/`p_group`,`p_user`, `accept_session_group`/`p_group`, `decline_session_group`/`p_group`, `add_group_boulder`/`p_group`,`p_gym_problem_id`,`p_grade_system`,`p_grade_value`,`p_grade_value_font`,`p_grade_value_vscale`,`p_color`,`p_hold_color`,`p_image_url`,`p_beta_video_url`, `session_group_roster`/`p_group`) match Task 1's definitions exactly. `Session.group_id` is added in Task 5 Step 3 and read in Tasks 5 and 6.
