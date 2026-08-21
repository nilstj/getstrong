# Join a Session from the Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a climber add themselves to a friend's session from the friends feed — directly if they share a crew, by request the owner approves otherwise.

**Architecture:** A crewmate's tap runs `join_session`, which creates the group if the session has none, stamps `group_id` on the owner's session and creates the joiner's own session. Anyone else's tap writes a `session_join_requests` row and nothing else — a pending request must not create a group, because creating one writes to the owner's session row, which is the owner's decision. Approval runs the same join path.

**Tech Stack:** React 19 + TypeScript, Vite, React Query (array query keys), Supabase (Postgres + RLS + `SECURITY DEFINER` RPCs), Tailwind (`sage`/`khaki`), `lucide-react`, `react-hot-toast`, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-shared-sessions-design.md`, section "1b. Joining from the friends feed".

**Depends on:** `docs/superpowers/plans/2026-08-19-shared-sessions-core.md` must be complete and **migration 080 applied**. This plan's migration is **082**, and it calls `create_session_group`'s logic, `session_groups`, `session_group_invites` and `is_session_group_member` from 080.

## Global Constraints

- **Branch:** `feature/shared-sessions`. Do not push to `main`.
- **Release gate:** migration `082_join_session.sql` is applied **by hand in the Supabase dashboard**, after 080, and before the client that reads it is deployed. Pushing `main` is a release.
- **Migration numbering:** 079 (awards) and 080 (shared sessions) exist; this is **082**. The spec's step 2 (awards on groups) therefore becomes **083** — update the spec's migration section as part of Task 1.
- **The only column this feature may write on another user's row is `sessions.group_id`**, and only inside a `SECURITY DEFINER` function. Never their climbs, notes, wisdom, duration or intensity.
- **Do not widen the read policies on `sessions`.** The feed's session card is derived from the friend's world-readable `problems` rows precisely because `sessions` is owner-only; keep it that way.
- **Joining closes when the verdict opens.** A join is refused once the session's award round has `unlocked_at` set. That column arrives in step 2, so guard on it defensively: if the column does not exist yet the check is inert, but write the guard now so step 2 turns it on rather than having to find this code again.
- **A database constraint beats a check-then-write.** One pending request per person per session is a primary key.
- **No `beta_points`** anywhere in this feature.
- **Build:** `npm run build` = `tsc -b && vite build`, `noUnusedLocals`/`noUnusedParameters` ON — an unused local is a build-failing error.
- **Lint baseline is 16 problems (15 errors, 1 warning).** New work must add zero. Re-measure before starting.
- **Tests:** only pure functions in `src/utils/` are unit-tested; there is no `@testing-library/react`. Both file conventions exist — search with `find src/utils -name '*<name>*test*'`.
- **Patterns:** array query keys; hooks named `useX`; **no FK embed to `profiles`** — use `profilesByIds` from `src/lib/profiles.ts`; `BottomSheet` for modals, never inside a heading; `react-hot-toast` for feedback.
- **Hit targets** in new mobile UI: at least 44px.

---

## File Structure

| File | Responsibility |
|---|---|
| Create `supabase/migrations/082_join_session.sql` | `session_join_requests`, three RPCs, one policy. |
| Create `src/utils/joinEligibility.ts` | Pure logic: which join affordance a feed card should show. |
| Create `src/utils/__tests__/joinEligibility.test.ts` | Tests for the above. |
| Modify `src/hooks/useSessionGroup.ts` | `useJoinSession`, `useRequestToJoinSession`, `useSessionJoinRequests`, `useApproveJoinRequest`, `useSharedCrewUsers`. |
| Modify `src/components/FriendSessionCard.tsx` | Restructure so an action button can live outside the card-wide `<Link>`, and render it. |
| Modify `src/pages/SessionDetailPage.tsx` | The owner's pending-request rows. |

---

## Task 1: Migration 082 — requests and the join paths

**Files:**
- Create: `supabase/migrations/082_join_session.sql`
- Modify: `docs/superpowers/specs/2026-08-19-shared-sessions-design.md`

**Interfaces:**
- Consumes: `sessions`, `session_groups`, `session_group_invites`, `is_session_group_member(uuid)` from migration 080; `crew_members`, `is_crew_member` from 062; `crew_award_rounds` from 079.
- Produces: table `session_join_requests`; RPCs `join_session(uuid)`, `request_to_join_session(uuid)`, `approve_join_request(uuid, uuid)`, `decline_join_request(uuid, uuid)`, `shares_crew_with(uuid)`.

- [ ] **Step 1: Write the migration**

```sql
-- Joining a friend's session from the feed.
--
-- Two paths, because consent runs the other way here from an invite. An invite is
-- the group asking you in; a join is you asking to come in, and on a follow-based
-- social graph anyone who follows you could otherwise attach themselves to your
-- evening and vote in its awards. So: a crewmate joins directly, and everyone else
-- files a request the owner approves.
--
-- Requests are keyed on the SESSION, not the group, because a session in the feed
-- may have no group yet and a pending request must not create one — creating a group
-- stamps group_id onto the owner's session row, which is the owner's call.
--
-- Nothing here awards beta_points.

create table if not exists session_join_requests (
  session_id uuid not null references sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
create index if not exists session_join_requests_user_idx on session_join_requests (user_id);

alter table session_join_requests enable row level security;

-- The requester sees their own; the session owner sees requests on their session.
-- `sessions` stays owner-only, so this sub-select is the owner's own row.
drop policy if exists "join requests readable by requester or session owner" on session_join_requests;
create policy "join requests readable by requester or session owner" on session_join_requests for select
  using (
    user_id = auth.uid()
    or exists (select 1 from sessions s where s.id = session_id and s.user_id = auth.uid())
  );

-- No write policies: both directions go through the functions below.

-- ── Shared-crew test ─────────────────────────────────────────────────────────
-- Whether the caller and p_user belong to at least one crew together. SECURITY
-- DEFINER because crew_members is readable only to fellow members, and the caller
-- may need to ask about someone in a crew they are not both in.
--
-- Referenced from a policy? No — only from the functions below, so it is safe to
-- keep out of client reach. It is NOT revoked here only because the join UI needs
-- it to decide which affordance to show; see shares_crew_with's grant note.
create or replace function public.shares_crew_with(p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
      from crew_members a
      join crew_members b on b.crew_id = a.crew_id
     where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

-- ── Guard: a revealed verdict closes the roster ───────────────────────────────
-- Adding a participant to a round whose result people have already read is wrong.
-- `unlocked_at` arrives with the awards-on-groups migration (083); until then this
-- returns false and the guard is inert, which is deliberate.
create or replace function public.session_group_verdict_is_out(p_group uuid)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare v_out boolean := false;
begin
  begin
    execute 'select exists (select 1 from crew_award_rounds where group_id = $1 and unlocked_at is not null)'
      into v_out using p_group;
  exception when undefined_column or undefined_table then
    v_out := false;
  end;
  return coalesce(v_out, false);
end; $$;

-- ── Direct join (crewmates) ──────────────────────────────────────────────────
-- Creates the group if the session has none, stamps group_id on the OWNER's session
-- row — the only column this feature ever writes on someone else's row — and
-- creates the caller's own session in the group.
create or replace function public.join_session(p_session uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_date date; v_gym text; v_group uuid; v_session uuid;
begin
  select s.user_id, s.date, nullif(trim(s.location), ''), s.group_id
    into v_owner, v_date, v_gym, v_group
    from sessions s where s.id = p_session;
  if v_owner is null then raise exception 'No such session'; end if;
  if v_owner = auth.uid() then raise exception 'That is already your session'; end if;
  if v_gym is null then raise exception 'That session has no gym to share'; end if;
  if not shares_crew_with(v_owner) then
    raise exception 'NEEDS_APPROVAL: ask to join instead';
  end if;
  if v_group is not null and session_group_verdict_is_out(v_group) then
    raise exception 'VERDICT_OUT: the awards for that session are already in';
  end if;
  if exists (select 1 from sessions where user_id = auth.uid() and date = v_date and trim(location) = v_gym) then
    raise exception 'ALREADY_LOGGED: you already logged a session that day at that gym';
  end if;

  if v_group is null then
    insert into session_groups (date, gym, created_by) values (v_date, v_gym, v_owner)
      returning id into v_group;
    update sessions set group_id = v_group where id = p_session;
  end if;

  insert into sessions (user_id, date, location, group_id)
    values (auth.uid(), v_date, v_gym, v_group)
    returning id into v_session;
  delete from session_join_requests where session_id = p_session and user_id = auth.uid();
  return v_session;
end; $$;

-- ── Request, and approval ────────────────────────────────────────────────────
create or replace function public.request_to_join_session(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_group uuid;
begin
  select s.user_id, s.group_id into v_owner, v_group from sessions s where s.id = p_session;
  if v_owner is null then raise exception 'No such session'; end if;
  if v_owner = auth.uid() then raise exception 'That is already your session'; end if;
  if v_group is not null and session_group_verdict_is_out(v_group) then
    raise exception 'VERDICT_OUT: the awards for that session are already in';
  end if;
  if v_group is not null and exists (select 1 from sessions where group_id = v_group and user_id = auth.uid()) then
    return;  -- already in
  end if;
  insert into session_join_requests (session_id, user_id) values (p_session, auth.uid())
    on conflict (session_id, user_id) do nothing;
end; $$;

-- The owner approves. Runs the same join, so there is one code path for "someone
-- joined": the group gets created here if it still does not exist.
create or replace function public.approve_join_request(p_session uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_date date; v_gym text; v_group uuid;
begin
  select s.user_id, s.date, nullif(trim(s.location), ''), s.group_id
    into v_owner, v_date, v_gym, v_group
    from sessions s where s.id = p_session;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Only the session owner can approve';
  end if;
  if not exists (select 1 from session_join_requests where session_id = p_session and user_id = p_user) then
    raise exception 'No such request';
  end if;
  if v_gym is null then raise exception 'That session has no gym to share'; end if;

  if v_group is null then
    insert into session_groups (date, gym, created_by) values (v_date, v_gym, v_owner)
      returning id into v_group;
    update sessions set group_id = v_group where id = p_session;
  end if;

  -- The approved climber may already have logged that evening themselves; leaving
  -- their existing session alone and adding a second one is the out-of-scope merge
  -- case, so attach the one they have rather than duplicating it.
  if exists (select 1 from sessions where user_id = p_user and date = v_date and trim(location) = v_gym and group_id is null) then
    update sessions set group_id = v_group
     where user_id = p_user and date = v_date and trim(location) = v_gym and group_id is null;
  elsif not exists (select 1 from sessions where user_id = p_user and group_id = v_group) then
    insert into sessions (user_id, date, location, group_id) values (p_user, v_date, v_gym, v_group);
  end if;

  delete from session_join_requests where session_id = p_session and user_id = p_user;
end; $$;

create or replace function public.decline_join_request(p_session uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from sessions s where s.id = p_session and s.user_id = auth.uid()) then
    raise exception 'Only the session owner can decline';
  end if;
  delete from session_join_requests where session_id = p_session and user_id = p_user;
end; $$;

-- shares_crew_with stays client-callable on purpose: the feed needs it to choose
-- between "Join" and "Ask to join" before the user taps anything. It leaks only one
-- boolean about the caller's own crew overlap, which the caller could compute from
-- their own crew rosters anyway.
```

- [x] **Step 2: Note the renumbering in the spec — ALREADY DONE, skip**

This was completed out-of-band when migration 081 (the session-invite notification) took that number. The spec already says **083** for the awards migration and this plan already says **082**. Verify and move on:

Run: `grep -n "082\|083" docs/superpowers/specs/2026-08-19-shared-sessions-design.md`
Expected: step 2's awards migration is 083; no stale 082 in the spec.

- [ ] **Step 3: Check the guards are constraints, and the write policies are absent**

Run: `grep -n "primary key\|create policy" supabase/migrations/082_join_session.sql`
Expected: one pending request per person is `primary key (session_id, user_id)`; exactly one policy, `for select`. Zero insert/update/delete policies. Paste the output.

- [ ] **Step 4: Check nothing widens `sessions` reads**

Run: `grep -n "policy.*on sessions\|on sessions for" supabase/migrations/082_join_session.sql`
Expected: no matches. The feed card stays derived from `problems`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/082_join_session.sql docs/superpowers/specs/2026-08-19-shared-sessions-design.md
git commit -m "Add joining a session directly or by request (migration 082)"
```

- [ ] **Step 6: Apply the migration by hand**

Paste into the Supabase dashboard SQL editor and run, **after 080**. Then confirm:

```sql
select count(*) from session_join_requests;
select public.session_group_verdict_is_out(gen_random_uuid());
```
Expected: 0, and `false` — the second proves the forward-compatible guard is inert rather than erroring before migration 083 adds `unlocked_at`.

---

## Task 2: Which affordance to show (TDD)

**Files:**
- Create: `src/utils/joinEligibility.ts`
- Test: `src/utils/__tests__/joinEligibility.test.ts`

**Interfaces:**
- Produces:
  - `type JoinAffordance = 'none' | 'join' | 'ask' | 'pending' | 'joined'`
  - `joinAffordance(input: { isMine: boolean; alreadyIn: boolean; requested: boolean; sharesCrew: boolean; verdictOut: boolean }): JoinAffordance`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/joinEligibility.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { joinAffordance } from '../joinEligibility'

const base = { isMine: false, alreadyIn: false, requested: false, sharesCrew: false, verdictOut: false }

describe('joinAffordance', () => {
  it('offers nothing on my own session', () => {
    expect(joinAffordance({ ...base, isMine: true })).toBe('none')
  })

  it('offers nothing once the verdict is out', () => {
    expect(joinAffordance({ ...base, sharesCrew: true, verdictOut: true })).toBe('none')
  })

  it('says joined when I am already in the session', () => {
    expect(joinAffordance({ ...base, alreadyIn: true })).toBe('joined')
  })

  it('says joined even if a stale request row is still around', () => {
    expect(joinAffordance({ ...base, alreadyIn: true, requested: true })).toBe('joined')
  })

  it('shows my request as pending', () => {
    expect(joinAffordance({ ...base, requested: true })).toBe('pending')
  })

  it('lets a crewmate join directly', () => {
    expect(joinAffordance({ ...base, sharesCrew: true })).toBe('join')
  })

  it('makes everyone else ask', () => {
    expect(joinAffordance(base)).toBe('ask')
  })

  it('prefers joined over every other signal', () => {
    expect(joinAffordance({ isMine: false, alreadyIn: true, requested: true, sharesCrew: true, verdictOut: false })).toBe('joined')
  })

  it('lets my own session win over being already in it, since both mean no action', () => {
    expect(joinAffordance({ ...base, isMine: true, alreadyIn: true })).toBe('none')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/joinEligibility.test.ts`
Expected: FAIL — `Failed to resolve import "../joinEligibility"`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/joinEligibility.ts`:

```ts
/** What a friend's session card should offer the viewer. */
export type JoinAffordance = 'none' | 'join' | 'ask' | 'pending' | 'joined'

/**
 * Which join affordance a session card shows.
 *
 * Order matters and encodes the product rules: your own session offers nothing;
 * a session whose awards verdict is already out has a closed roster, because
 * adding a participant after people have read the result is wrong; being in the
 * session beats a leftover request row; a crewmate joins directly because they were
 * plausibly there, and everyone else asks, so nobody on a follow-based graph can
 * attach themselves to your evening uninvited.
 *
 * The server enforces all of this too — this only decides which control to draw.
 */
export function joinAffordance(input: {
  isMine: boolean
  alreadyIn: boolean
  requested: boolean
  sharesCrew: boolean
  verdictOut: boolean
}): JoinAffordance {
  if (input.isMine) return 'none'
  if (input.alreadyIn) return 'joined'
  if (input.verdictOut) return 'none'
  if (input.requested) return 'pending'
  return input.sharesCrew ? 'join' : 'ask'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/joinEligibility.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Run the whole suite and the build**

Run: `npx vitest run && npm run build`
Expected: 245 tests pass (236 on main, plus 9); build clean.

- [ ] **Step 6: Commit**

```bash
git add src/utils/joinEligibility.ts src/utils/__tests__/joinEligibility.test.ts
git commit -m "Add the rule for which join affordance a session card shows"
```

---

## Task 3: Hooks

**Files:**
- Modify: `src/hooks/useSessionGroup.ts`

**Interfaces:**
- Consumes: `supabase`, `useAuth`, `profilesByIds`; the RPCs from Task 1.
- Produces: `useSharedCrewUsers()`, `useMyJoinRequests()`, `useSessionJoinRequests(sessionId)`, `useJoinSession()`, `useRequestToJoinSession()`, `useApproveJoinRequest()`, `useDeclineJoinRequest()`; type `JoinRequest`.

- [ ] **Step 1: Append the hooks**

Add to the end of `src/hooks/useSessionGroup.ts`:

```ts
export interface JoinRequest {
  session_id: string
  user_id: string
  username: string | null
  avatar_url: string | null
}

/**
 * The set of user ids the caller shares a crew with. Fetched once and reused for
 * every card in the feed, rather than one `shares_crew_with` call per card.
 */
export function useSharedCrewUsers() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['shared_crew_users', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Set<string>> => {
      const { data: mine, error } = await supabase
        .from('crew_members')
        .select('crew_id')
        .eq('user_id', user!.id)
      if (error) throw error
      const crewIds = (mine ?? []).map(r => r.crew_id as string)
      if (crewIds.length === 0) return new Set()
      const { data: peers, error: pErr } = await supabase
        .from('crew_members')
        .select('user_id')
        .in('crew_id', crewIds)
      if (pErr) throw pErr
      const set = new Set((peers ?? []).map(r => r.user_id as string))
      set.delete(user!.id)
      return set
    },
  })
}

/** Sessions I have asked to join and not yet been approved for. */
export function useMyJoinRequests() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my_join_requests', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('session_join_requests')
        .select('session_id')
        .eq('user_id', user!.id)
      if (error) throw error
      return new Set((data ?? []).map(r => r.session_id as string))
    },
  })
}

/** People asking to join one of my sessions. */
export function useSessionJoinRequests(sessionId: string | null) {
  return useQuery({
    queryKey: ['session_join_requests', sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<JoinRequest[]> => {
      const { data, error } = await supabase
        .from('session_join_requests')
        .select('session_id, user_id')
        .eq('session_id', sessionId)
      if (error) throw error
      const rows = (data ?? []) as { session_id: string; user_id: string }[]
      const byId = await profilesByIds(rows.map(r => r.user_id))
      return rows.map(r => ({
        ...r,
        username: byId.get(r.user_id)?.username ?? null,
        avatar_url: byId.get(r.user_id)?.avatar_url ?? null,
      }))
    },
  })
}

export function useJoinSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { sessionId: string }): Promise<string> => {
      const { data, error } = await supabase.rpc('join_session', { p_session: v.sessionId })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] })
      qc.invalidateQueries({ queryKey: ['friends_feed'] })
    },
  })
}

export function useRequestToJoinSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { sessionId: string }) => {
      const { error } = await supabase.rpc('request_to_join_session', { p_session: v.sessionId })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my_join_requests'] }),
  })
}

export function useApproveJoinRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { sessionId: string; userId: string }) => {
      const { error } = await supabase.rpc('approve_join_request', { p_session: v.sessionId, p_user: v.userId })
      if (error) throw error
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['session_join_requests', v.sessionId] })
      qc.invalidateQueries({ queryKey: ['session_group_roster'] })
      qc.invalidateQueries({ queryKey: ['sessions', v.sessionId] })
    },
  })
}

export function useDeclineJoinRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { sessionId: string; userId: string }) => {
      const { error } = await supabase.rpc('decline_join_request', { p_session: v.sessionId, p_user: v.userId })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['session_join_requests', v.sessionId] }),
  })
}
```

- [ ] **Step 2: Verify the feed query key you invalidate is the real one**

Run: `grep -rn "queryKey: \['friends_feed'\|queryKey: \['friends" src/hooks/useFriendsFeed.ts`
Expected: a match showing the actual key. If the key differs from `['friends_feed']`, change the `onSuccess` in `useJoinSession` to the real one — invalidating a key nothing uses leaves the feed showing a stale "Join" button after a successful join.

- [ ] **Step 3: Verify it compiles and no `profiles` embed crept in**

Run: `npm run build && grep -n "profiles(" src/hooks/useSessionGroup.ts`
Expected: build clean; no `profiles(` match.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSessionGroup.ts
git commit -m "Add join, request and approval queries and mutations"
```

---

## Task 4: The join affordance on the feed card

**Files:**
- Modify: `src/components/FriendSessionCard.tsx`

**Interfaces:**
- Consumes: `joinAffordance` from Task 2; `useSharedCrewUsers`, `useMyJoinRequests`, `useJoinSession`, `useRequestToJoinSession` from Task 3.
- Produces: `FriendSessionCard` gains an optional `showJoin?: boolean` prop, default `false`, so existing call sites keep their current behaviour until they opt in.

**The structural problem you must solve first:** the whole card is currently one `<Link to={to}>` wrapping everything (it opens at the `<Link` on line 22 and closes on line 71). A `<button>` inside an `<a>` is invalid HTML, and a tap on it would also navigate. So the card has to be restructured: an outer `<div>` that carries the card's border and background, the existing content as a `<Link>` inside it, and the join button as a **sibling** of that link.

- [ ] **Step 1: Restructure the card**

In `src/components/FriendSessionCard.tsx`:

1. Change the outermost element from `<Link to={to} className="block bg-white rounded-2xl border border-gray-100 overflow-hidden hover:border-sage-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500">` to a plain `<div>` carrying the same classes minus the focus-ring ones:

```tsx
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden transition-colors">
```

2. Wrap everything that was inside it — up to but not including the new footer you add in Step 2 — in a `<Link>` that keeps the interactive styling:

```tsx
      <Link to={to}
        className="block hover:bg-gray-50/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500">
```

3. Close that `</Link>` where the old one closed, and close the new `</div>` at the very end.

Do not change any of the card's inner markup, spacing or copy — only the wrapper.

- [ ] **Step 2: Add the join footer**

Add the props and the footer. Change the signature to:

```tsx
export function FriendSessionCard({
  session, to, showJoin = false,
}: { session: FriendSession; to: string; showJoin?: boolean }) {
```

Add these imports:

```tsx
import toast from 'react-hot-toast'
import { UserPlus, Check, Clock } from 'lucide-react'
import { useAuth } from '../providers/AuthProvider'
import { joinAffordance } from '../utils/joinEligibility'
import {
  useSharedCrewUsers, useMyJoinRequests, useJoinSession, useRequestToJoinSession,
} from '../hooks/useSessionGroup'
```

Inside the component, above the `return`:

```tsx
  const { user } = useAuth()
  const { data: crewPeers } = useSharedCrewUsers()
  const { data: myRequests } = useMyJoinRequests()
  const join = useJoinSession()
  const ask = useRequestToJoinSession()

  // `verdictOut` is always false until the awards move onto session groups; the
  // server refuses the join either way, so the button is never a lie.
  const affordance = joinAffordance({
    isMine: session.userId === user?.id,
    alreadyIn: false,
    requested: myRequests?.has(session.sessionId) ?? false,
    sharesCrew: crewPeers?.has(session.userId) ?? false,
    verdictOut: false,
  })

  const onJoinError = (e: unknown) => {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('ALREADY_LOGGED')) { toast.error('You already logged a session that day at that gym'); return }
    if (msg.includes('VERDICT_OUT')) { toast.error('The awards for that session are already in'); return }
    if (msg.includes('NEEDS_APPROVAL')) { toast.error('Ask to join instead'); return }
    toast.error(msg || 'Could not join')
  }
```

Then, as the last child of the outer `<div>` and a **sibling** of the `</Link>`:

```tsx
      {showJoin && affordance !== 'none' && (
        <div className="px-3.5 pb-3 pt-0.5">
          {affordance === 'joined' && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sage-700">
              <Check size={14} strokeWidth={2.5} /> You were there
            </span>
          )}
          {affordance === 'pending' && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400">
              <Clock size={14} strokeWidth={2.25} /> Asked to join
            </span>
          )}
          {affordance === 'join' && (
            <button
              type="button"
              onClick={() => join.mutate({ sessionId: session.sessionId }, {
                onSuccess: () => toast.success('Added to your log'),
                onError: onJoinError,
              })}
              disabled={join.isPending}
              className="min-h-11 w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-sage-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              <UserPlus size={15} strokeWidth={2.25} /> I was there too
            </button>
          )}
          {affordance === 'ask' && (
            <button
              type="button"
              onClick={() => ask.mutate({ sessionId: session.sessionId }, {
                onSuccess: () => toast.success('Asked to join'),
                onError: onJoinError,
              })}
              disabled={ask.isPending}
              className="min-h-11 w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-semibold disabled:opacity-50"
            >
              <UserPlus size={15} strokeWidth={2.25} /> Ask to join
            </button>
          )}
        </div>
      )}
```

- [ ] **Step 3: Turn it on in the home feed only**

In `src/pages/DashboardPage.tsx`, add `showJoin` to the `FriendSessionCard` there:

```tsx
                showJoin
```

Leave the `FriendSessionCard` in `src/pages/CrewGroupPage.tsx` alone: the crew feed shows sessions you can reach other ways, and adding a second join surface is not this plan's job.

- [ ] **Step 4: Verify no button sits inside an anchor**

Run: `grep -n "<Link\|</Link>\|<button" src/components/FriendSessionCard.tsx`
Expected: every `<button` line is **outside** the `<Link>`/`</Link>` range. A button inside an anchor is invalid HTML and would navigate on tap — read the line numbers and confirm, and say so in your report.

- [ ] **Step 5: Verify build, lint and tests**

Run: `npm run build && npx vitest run && npm run lint 2>&1 | tail -3`
Expected: build clean; 245 tests pass; lint **16 problems**.

- [ ] **Step 6: Commit**

```bash
git add src/components/FriendSessionCard.tsx src/pages/DashboardPage.tsx
git commit -m "Let you add yourself to a friend's session from the feed"
```

---

## Task 5: The owner's pending requests

**Files:**
- Modify: `src/pages/SessionDetailPage.tsx`

**Interfaces:**
- Consumes: `useSessionJoinRequests`, `useApproveJoinRequest`, `useDeclineJoinRequest` from Task 3.
- Produces: no new exports.

- [ ] **Step 1: Add the requests block**

In `src/pages/SessionDetailPage.tsx`, add the imports:

```tsx
import { useSessionJoinRequests, useApproveJoinRequest, useDeclineJoinRequest } from '../hooks/useSessionGroup'
```

Add this component at the bottom of the file:

```tsx
/** People asking to join this session. Only the owner ever sees these. */
function JoinRequests({ sessionId }: { sessionId: string }) {
  const { data: requests = [] } = useSessionJoinRequests(sessionId)
  const approve = useApproveJoinRequest()
  const decline = useDeclineJoinRequest()

  if (requests.length === 0) return null

  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Asking to join</h2>
      <div className="space-y-2">
        {requests.map(r => (
          <div key={r.user_id} className="flex items-center gap-3 bg-white border border-sage-200 rounded-2xl p-3">
            <span className="w-9 h-9 rounded-full bg-sage-100 grid place-items-center text-sm font-semibold text-sage-700 overflow-hidden flex-shrink-0">
              {r.avatar_url
                ? <img src={r.avatar_url} alt="" className="w-full h-full object-cover" />
                : (r.username ?? '?').slice(0, 1).toUpperCase()}
            </span>
            <span className="flex-1 text-sm font-medium text-gray-800 truncate">{r.username ?? 'Someone'}</span>
            <button
              type="button"
              onClick={() => approve.mutate({ sessionId, userId: r.user_id }, {
                onSuccess: () => toast.success('They’re in'),
                onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not approve'),
              })}
              className="min-h-11 px-4 rounded-full bg-sage-700 text-white text-sm font-semibold"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => decline.mutate({ sessionId, userId: r.user_id }, { onError: () => toast.error('Failed') })}
              className="min-h-11 px-3 text-sm font-semibold text-gray-400"
            >
              No
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Mount it for the owner only**

Mount it directly above the `SessionRoster` from the core plan's Task 5:

```tsx
      {!planned && session.user_id === user?.id && <JoinRequests sessionId={id!} />}
```

`toast` is already imported in this file; do not import it twice.

- [ ] **Step 3: Verify build, lint and tests**

Run: `npm run build && npx vitest run && npm run lint 2>&1 | tail -3`
Expected: build clean; 245 tests pass; lint **16 problems**.

- [ ] **Step 4: Commit**

```bash
git add src/pages/SessionDetailPage.tsx
git commit -m "Let a session owner approve people asking to join"
```

---

## Task 6: Verification pass

**Files:** none changed unless a defect is found.

- [ ] **Step 1: Confirm both migrations are applied**

In the Supabase dashboard:

```sql
select count(*) from session_group_boulders;   -- 080
select count(*) from session_join_requests;    -- 082
```
Expected: both succeed.

- [ ] **Step 2: Full automated check**

Run: `npm run build && npx vitest run && npm run lint 2>&1 | tail -3`
Expected: build clean, 245 tests pass, lint **16 problems** — the branch baseline. Any increase is yours to fix.

- [ ] **Step 3: Confirm the write policies really are absent**

As an ordinary authenticated user in the dashboard:

```sql
insert into session_join_requests (session_id, user_id) values (gen_random_uuid(), auth.uid());
```
Expected: refused by row-level security.

- [ ] **Step 4: Manual pass on a phone-width viewport (375px)**

Run `npm run dev`. Hooks, components and pages have no automated coverage, so this pass *is* the test.

- [ ] A friend's session in the home feed shows a join control; **your own session shows none**.
- [ ] Tapping the card's body still navigates to the session — the button did not break the link.
- [ ] As a **crewmate** of the session owner, the control reads "I was there too". Tap it: you get your own session at that date and gym, the owner's session is now grouped, and both of you appear in each other's roster.
- [ ] As someone who shares **no crew** with the owner, the control reads "Ask to join". Tap it: it becomes "Asked to join" and no session is created for you.
- [ ] As the owner, that request appears under "Asking to join". Tap **Yes**: they join, and the request disappears.
- [ ] Tap **No** on another request: it disappears and no session is created.
- [ ] Ask to join a session on a day you already logged at that gym, then have the owner approve: **your existing session is attached to the group** rather than a second one being created. Check your sessions list has no duplicate.
- [ ] The crew feed on `/crews/:crewId` shows session cards with **no** join control — only the home feed opted in.
- [ ] Nothing anywhere claims you climbed something you did not.
- [ ] After a crewmate join, the shared boulder list shows the owner's boulders **and the owner's own status against them** — this alone catches the back-fill bug.
- [ ] The owner's session page still shows its own "Problems (n)" list after someone joins and stamps `group_id` on it.
- [ ] After a request (before approval), the owner's session still has `group_id` null — the plan's stated key invariant, currently never observed.
- [ ] Tap the control on a session you are already in — it must read as joined, not offer to join.
- [ ] A crewmate who already logged that evening at that gym joins — their existing session is attached, not duplicated.
- [ ] A friend's session whose problems carry a gym but whose location is blank — no join control.
- [ ] Both notifications arrive and route correctly.
- [ ] Withdraw a request, then have the owner try to approve it.
- [ ] On a 375px viewport with a request pending, Yes and No are both ≥44px.

- [ ] **Step 5: Confirm no points were minted**

Run: `grep -rn "beta_points" supabase/migrations/082_join_session.sql src/utils/joinEligibility.ts src/components/FriendSessionCard.tsx`
Expected: no matches.

- [ ] **Step 6: Commit any fixes and finish the branch**

```bash
git add -A
git commit -m "Fix defects found in the join-from-feed manual pass"
```

Then use the `superpowers:finishing-a-development-branch` skill. **Do not push before 080 and 082 are both applied in Supabase** — a push to `main` is a release.

---

## Self-Review

**Spec coverage (section 1b):**

| Spec requirement | Task |
|---|---|
| Crewmates join directly | 1 (`join_session` + `shares_crew_with`), 2, 4 |
| Everyone else's tap becomes a request | 1 (`request_to_join_session`), 2, 4 |
| Owner approves with one tap, same join path | 1 (`approve_join_request`), 5 |
| Requests keyed on the session, not the group | 1 (`session_join_requests` PK) |
| A pending request creates no group | 1 (`request_to_join_session` writes only its own row) |
| `group_id` is the only column written on the owner's row | 1, 6 Step 3 |
| Joining refused once the verdict is out | 1 (`session_group_verdict_is_out`), 2 (`verdictOut`) |
| `sessions` read policies not widened | 1 Step 4 |
| Feed card keeps working as a link | 4 Step 4 |
| No `beta_points` | 6 Step 5 |
| Release gate on 082, after 080 | 1 Step 6, 6 Step 1, 6 Step 6 |

**Two things this plan does that the spec did not ask for, both deliberate:**

1. **`approve_join_request` attaches an existing same-day session** instead of creating a second one. The spec defers merging, but here the owner is approving a specific person for a specific evening, so a duplicate would be an obvious bug. It is a single `update … set group_id`, which is exactly the "attaching proves as simple as it looks" case the spec anticipated.
2. **`session_group_verdict_is_out` is written before the column it reads exists**, catching `undefined_column`/`undefined_table` so it returns `false` under migration 082 and starts working the moment 083 adds `unlocked_at`. The alternative — leaving the guard out and remembering to add it later — is how a rule gets lost. Task 1 Step 6 verifies it is inert rather than broken.

**Placeholder scan:** every code step carries complete code; no TBD, no "similar to Task N". Task 3 Step 2 and Task 1 Step 2 are explicit verify-then-adapt steps with the exact command and the exact thing to change, not vague instructions.

**Type consistency:** `JoinAffordance` and `joinAffordance` are declared once in `src/utils/joinEligibility.ts`. `JoinRequest` is declared once in `src/hooks/useSessionGroup.ts`. RPC names and parameter names in Task 3 (`join_session`/`p_session`, `request_to_join_session`/`p_session`, `approve_join_request`/`p_session`,`p_user`, `decline_join_request`/`p_session`,`p_user`) match Task 1 exactly. `FriendSessionCard`'s new `showJoin` prop is optional and defaults false, so `CrewGroupPage`'s existing call site compiles untouched.
