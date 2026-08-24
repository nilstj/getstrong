# Account Deletion and Data Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every climber a working "download my data" and "delete my account", the two rights the app currently doesn't honour at all.

**Architecture:** Two `security definer` Postgres functions do the work — `export_my_data()` walks `information_schema` to gather every row owned by `auth.uid()`, and `delete_my_account()` deletes the `auth.users` row and lets 34 existing cascades finish the job. The client deletes its own storage objects first (only possible since migration 087), then calls the RPC. No service-role key exists anywhere in this design.

**Tech Stack:** Postgres/plpgsql, Supabase JS v2, React Query mutations, Vitest for the pure utils.

**Spec:** `docs/superpowers/specs/2026-08-24-account-deletion-and-data-export-design.md`

## Global Constraints

- `noUnusedLocals` and `noUnusedParameters` are ON — an unused local is a build-failing error that fails the Vercel deploy.
- `npm run lint` must add **zero** new problems. Measure the baseline yourself first; it drifts.
- Only pure functions in `src/utils/` get tests. Hooks, components and pages are verified by `npm run build` plus a manual pass. Do not add `@testing-library/react`.
- Migrations are applied **by hand in the Supabase dashboard**, never by tooling from the repo.
- A `BottomSheet` rendered inside a heading inherits its font weight and is invalid markup — keep it a sibling.
- Copy rule: "log" is the private per-session action, "publish"/"create" is the shared one. Deletion copy must not say the app deletes published beta — it anonymises it.
- Existing patterns to follow: React Query with array query keys, hooks named `useX`, `react-hot-toast` for feedback, `lucide-react` icons, `sage`/`khaki` Tailwind palettes.

---

### Task 1: Migration 088 — the two RPCs

**Files:**
- Create: `supabase/migrations/088_account_deletion_and_export.sql`

**Interfaces:**
- Consumes: migration 087 (the FK fixes; without it `delete from auth.users` raises a not-null violation on `crews.created_by`)
- Produces: `public.export_my_data() returns jsonb` and `public.delete_my_account() returns void`, both executable by `authenticated` only

- [ ] **Step 1: Write the migration**

```sql
-- Two rights the app has never honoured: take my data, delete my account.
--
-- Both functions are `security definer` so they can reach past RLS (and, for
-- deletion, into auth.users), and both pin search_path so an unqualified name
-- can't be hijacked by a caller-controlled schema. Both raise on an anonymous
-- caller and are executable only by `authenticated`.

-- ── export ──────────────────────────────────────────────────────────────────
-- Table discovery rather than a hand-written list of 45 tables: this schema is
-- 88 migrations deep and gains tables constantly, and a stale export is a
-- wrong answer to a data request rather than a missing feature. The catch is
-- that 8 of 67 tables match none of the obvious owner columns, so `profiles`
-- (owner column is `id`) and `problem_tag_assignments` (owned only through
-- `problem_id`) are handled explicitly, `app_settings`, `grade_mappings` and
-- `gym_gradings` are deliberately excluded as global config, and the envelope
-- reports anything else it couldn't reach in `unmapped_tables`.

create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid   := auth.uid();
  v_owner    text[] := array[
    'user_id','created_by','creator_id','voter_id','recipient_id','actor_id',
    'requester_id','follower_id','following_id','invited_user','invited_by',
    'added_by','opened_by','partner_id','from_user_id','to_user_id'];
  v_handled  text[] := array['app_settings','grade_mappings','gym_gradings',
                             'profiles','problem_tag_assignments'];
  v_data     jsonb  := '{}'::jsonb;
  v_unmapped text[] := '{}';
  v_rows     jsonb;
  r          record;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  for r in
    select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public'
       and t.table_type = 'BASE TABLE'
       and c.column_name = any (v_owner)
     order by c.table_name, c.column_name
  loop
    -- %I quoting plus the bound $1 are what keep this from being a hole
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from %I t where t.%I = $1',
      r.table_name, r.column_name)
      into v_rows using v_uid;

    if jsonb_array_length(v_rows) > 0 then
      -- keyed by table.column, so both sides of `follows` survive
      v_data := jsonb_set(v_data,
        array[r.table_name || '.' || r.column_name], v_rows, true);
    end if;
  end loop;

  select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_rows
    from profiles p where p.id = v_uid;
  v_data := jsonb_set(v_data, array['profiles'], v_rows, true);

  select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into v_rows
    from problem_tag_assignments a
   where a.problem_id in (select id from problems where user_id = v_uid);
  v_data := jsonb_set(v_data, array['problem_tag_assignments'], v_rows, true);

  select coalesce(array_agg(t.table_name order by t.table_name), '{}')
    into v_unmapped
    from information_schema.tables t
   where t.table_schema = 'public'
     and t.table_type = 'BASE TABLE'
     and t.table_name <> all (v_handled)
     and not exists (
       select 1 from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = t.table_name
          and c.column_name = any (v_owner));

  return jsonb_build_object(
    'generated_at',    now(),
    'user_id',         v_uid,
    'data',            v_data,
    'unmapped_tables', v_unmapped
  );
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

-- ── deletion ────────────────────────────────────────────────────────────────
-- The auth.users delete IS the deletion: 34 `on delete cascade` FKs take the
-- owned rows, and the 9 `on delete set null` authorship columns anonymise the
-- shared ones, so published beta and boulders stay on the wall for the
-- climbers using them.
--
-- The storage sweep here is a backstop only. The client removes its own
-- objects through the storage API first, which is what actually deletes the
-- files; anything it missed loses its row here, so no public URL outlives the
-- account.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  delete from storage.objects
   where bucket_id in ('avatars', 'problem-images')
     and (storage.foldername(name))[1] = v_uid::text;

  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
```

- [ ] **Step 2: Read it back for the three things that would make it dangerous**

Confirm by eye, since there is no local database to run it against:
1. Every dynamic identifier goes through `%I`, and `v_uid` is passed as `$1` via `using` — never string-concatenated.
2. Both functions raise when `auth.uid()` is null, so an anonymous caller gets an error rather than everyone's rows.
3. `set search_path = public` is present on both.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/088_account_deletion_and_export.sql
git commit -m "Add export_my_data and delete_my_account RPCs"
```

- [ ] **Step 4: Apply in the Supabase dashboard and verify the deletion permission**

Run the migration in the dashboard SQL editor (which runs as `postgres`), then check the risky part — whether the function's owner may delete from `auth.users`:

```sql
select public.export_my_data() -> 'unmapped_tables';
```

Expected: `[]`, or a list of tables added since this plan was written.

`delete_my_account()` cannot be smoke-tested without destroying an account, so verify it with a throwaway registration rather than a real one.

Two tables in it are owned by roles other than `postgres` — `auth.users` by `supabase_auth_admin` and `storage.objects` by `supabase_storage_admin` — so **the permission is the one thing in this plan that cannot be confirmed by reading the code.** Check it before trusting the button:

```sql
select has_table_privilege('postgres', 'auth.users', 'delete')     as can_delete_users,
       has_table_privilege('postgres', 'storage.objects', 'delete') as can_delete_objects;
```

Expected: `true, true`. **If either is false,** the function will raise `permission denied` at the worst possible moment. Options in order of preference: grant the missing privilege to `postgres`; drop the storage sweep from the function and rely solely on the client's storage-API deletion (which runs as the user and needs no grant); or, only as a last resort, the Vercel function holding `SUPABASE_SERVICE_ROLE_KEY` that the spec rejected on security grounds. Do not paper over a failure by leaving the account half-deleted.

---

### Task 2: Pure utils, TDD

**Files:**
- Create: `src/utils/myData.ts`
- Test: `src/utils/__tests__/myData.test.ts`

**Interfaces:**
- Produces:
  - `interface ExportEnvelope { generated_at: string; user_id: string; data: Record<string, unknown[]>; unmapped_tables: string[] }`
  - `exportFilename(date: Date): string`
  - `interface ExportSummary { rowCount: number; tableCount: number; unmapped: string[] }`
  - `summariseExport(envelope: ExportEnvelope): ExportSummary`
  - `deletionConfirmationMatches(typed: string, username: string | null | undefined): boolean`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest'
import {
  exportFilename, summariseExport, deletionConfirmationMatches,
  type ExportEnvelope,
} from '../myData'

const envelope = (over: Partial<ExportEnvelope> = {}): ExportEnvelope => ({
  generated_at: '2026-08-24T10:00:00Z',
  user_id: 'u1',
  data: {},
  unmapped_tables: [],
  ...over,
})

describe('exportFilename', () => {
  it('names the file for the day it was generated', () => {
    expect(exportFilename(new Date(2026, 7, 24))).toBe('moresends-export-2026-08-24.json')
  })
})

describe('summariseExport', () => {
  it('counts rows across every section', () => {
    const s = summariseExport(envelope({
      data: { 'sessions.user_id': [{}, {}, {}], 'problems.user_id': [{}] },
    }))
    expect(s.rowCount).toBe(4)
    expect(s.tableCount).toBe(2)
  })

  it('reports an empty log as zero rather than throwing', () => {
    expect(summariseExport(envelope())).toEqual({ rowCount: 0, tableCount: 0, unmapped: [] })
  })

  it('passes through the tables the export could not reach', () => {
    expect(summariseExport(envelope({ unmapped_tables: ['new_table'] })).unmapped)
      .toEqual(['new_table'])
  })
})

describe('deletionConfirmationMatches', () => {
  it('accepts the username', () => {
    expect(deletionConfirmationMatches('nils', 'nils')).toBe(true)
  })

  it('forgives surrounding space and capitals', () => {
    expect(deletionConfirmationMatches('  NILS ', 'nils')).toBe(true)
  })

  it('rejects a near miss', () => {
    expect(deletionConfirmationMatches('nil', 'nils')).toBe(false)
  })

  it('rejects an empty confirmation', () => {
    expect(deletionConfirmationMatches('', 'nils')).toBe(false)
    expect(deletionConfirmationMatches('   ', 'nils')).toBe(false)
  })

  it('cannot be satisfied when there is no username to type', () => {
    expect(deletionConfirmationMatches('', null)).toBe(false)
    expect(deletionConfirmationMatches('anything', null)).toBe(false)
    expect(deletionConfirmationMatches('', undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/utils/__tests__/myData.test.ts`
Expected: FAIL — `Failed to resolve import "../myData"`.

- [ ] **Step 3: Write the minimal implementation**

```typescript
import { format } from 'date-fns'

/** What `export_my_data()` returns: one section per table.column that had rows. */
export interface ExportEnvelope {
  generated_at: string
  user_id: string
  data: Record<string, unknown[]>
  unmapped_tables: string[]
}

export interface ExportSummary {
  rowCount: number
  tableCount: number
  unmapped: string[]
}

export function exportFilename(date: Date): string {
  return `moresends-export-${format(date, 'yyyy-MM-dd')}.json`
}

export function summariseExport(envelope: ExportEnvelope): ExportSummary {
  const sections = Object.values(envelope.data ?? {}).filter(Array.isArray)
  return {
    rowCount: sections.reduce((n, rows) => n + rows.length, 0),
    tableCount: sections.length,
    unmapped: envelope.unmapped_tables ?? [],
  }
}

/**
 * Guards an irreversible action, so it fails closed: with no username to type
 * against, nothing matches -- including the empty string.
 */
export function deletionConfirmationMatches(
  typed: string,
  username: string | null | undefined,
): boolean {
  if (!username?.trim()) return false
  return typed.trim().toLowerCase() === username.trim().toLowerCase()
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/utils/__tests__/myData.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/myData.ts src/utils/__tests__/myData.test.ts
git commit -m "Add export filename, summary and deletion-confirmation utils"
```

---

### Task 3: The hooks

**Files:**
- Create: `src/hooks/useMyData.ts`

**Interfaces:**
- Consumes: `exportFilename`, `ExportEnvelope` from `src/utils/myData`
- Produces: `useExportMyData()` (mutation → `ExportEnvelope`), `downloadExport(envelope, now)`, `useDeleteMyAccount()` (mutation → void)

- [ ] **Step 1: Write the hooks**

```typescript
import { useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import { exportFilename, type ExportEnvelope } from '../utils/myData'

// Both buckets store objects under `<user id>/…`, which is what migration 087
// made enforceable and what makes a per-user sweep possible at all.
const BUCKETS = ['avatars', 'problem-images'] as const

export function useExportMyData() {
  return useMutation({
    mutationFn: async (): Promise<ExportEnvelope> => {
      const { data, error } = await supabase.rpc('export_my_data')
      if (error) throw error
      return data as ExportEnvelope
    },
  })
}

export function downloadExport(envelope: ExportEnvelope, now: Date): void {
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = exportFilename(now)
  a.click()
  URL.revokeObjectURL(url)
}

export function useDeleteMyAccount() {
  const { user } = useAuth()
  return useMutation({
    mutationFn: async () => {
      const uid = user?.id
      if (!uid) throw new Error('Not signed in')

      // Storage first, deliberately: the files themselves only go away through
      // the storage API, and a failure here leaves the account intact and
      // retryable. Doing it after the RPC would leave orphans with no session
      // left to delete them.
      for (const bucket of BUCKETS) {
        const { data: files, error: listError } = await supabase.storage.from(bucket).list(uid)
        if (listError) throw listError
        const paths = (files ?? []).map(f => `${uid}/${f.name}`)
        if (paths.length > 0) {
          const { error: removeError } = await supabase.storage.from(bucket).remove(paths)
          if (removeError) throw removeError
        }
      }

      const { error } = await supabase.rpc('delete_my_account')
      if (error) throw error
    },
  })
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exit 0. (No test file — per the repo constraint, hooks are covered by the build and a manual pass.)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useMyData.ts
git commit -m "Add export and account-deletion hooks"
```

---

### Task 4: The "Your data" section on the profile page

**Files:**
- Modify: `src/pages/ProfilePage.tsx`

**Interfaces:**
- Consumes: `useExportMyData`, `downloadExport`, `useDeleteMyAccount` from `src/hooks/useMyData`; `summariseExport`, `deletionConfirmationMatches` from `src/utils/myData`; `BottomSheet` from `src/components/BottomSheet`

- [ ] **Step 1: Add the imports**

Add to the existing import block at the top of the file. `Download` and `Trash2` join the existing `lucide-react` import; `useNavigate` joins the existing `react-router-dom` import.

```typescript
import { Link, useNavigate } from 'react-router-dom'
import { LogOut, Shield, BarChart2, Download, Trash2 } from 'lucide-react'
import { BottomSheet } from '../components/BottomSheet'
import { useExportMyData, downloadExport, useDeleteMyAccount } from '../hooks/useMyData'
import { summariseExport, deletionConfirmationMatches } from '../utils/myData'
```

- [ ] **Step 2: Add the state and handlers inside `ProfilePage`**

Place with the other `useState` calls and hook calls near the top of the component.

```typescript
  const navigate = useNavigate()
  const exportMyData = useExportMyData()
  const deleteAccount = useDeleteMyAccount()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  const handleExport = () => {
    exportMyData.mutate(undefined, {
      onSuccess: envelope => {
        const summary = summariseExport(envelope)
        downloadExport(envelope, new Date())
        toast.success(`${summary.rowCount} rows across ${summary.tableCount} tables`)
        if (summary.unmapped.length > 0) {
          // Surfaced rather than swallowed: this is the export telling you it
          // has a blind spot, which is the whole point of the field.
          toast(`Not yet covered by the export: ${summary.unmapped.join(', ')}`, { duration: 8000 })
        }
      },
      onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Export failed'),
    })
  }

  const handleDelete = () => {
    deleteAccount.mutate(undefined, {
      onSuccess: async () => {
        toast.success('Your account is gone. Thanks for the beta.')
        // The session is already invalid server-side; signOut still clears it
        // locally, and we leave either way.
        try { await supabase.auth.signOut() } catch { /* already gone */ }
        navigate('/login', { replace: true })
      },
      onError: (e: unknown) =>
        toast.error(e instanceof Error ? e.message : 'Could not delete the account'),
    })
  }
```

- [ ] **Step 3: Add the section markup immediately above the `{/* Log out */}` block**

```tsx
      {/* Your data */}
      <div>
        <h2 className="text-base font-semibold mb-2">Your data</h2>
        <div className="space-y-2">
          <button
            onClick={handleExport}
            disabled={exportMyData.isPending}
            className="w-full flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm hover:border-gray-300 transition-colors disabled:opacity-60"
          >
            <Download size={16} strokeWidth={1.75} />
            {exportMyData.isPending ? 'Gathering your data…' : 'Download my data'}
          </button>
          <button
            onClick={() => { setConfirmText(''); setDeleteOpen(true) }}
            className="w-full flex items-center gap-3 bg-white border border-red-200 text-red-600 rounded-2xl px-4 py-3 text-sm hover:border-red-300 transition-colors"
          >
            <Trash2 size={16} strokeWidth={1.75} />
            Delete my account
          </button>
        </div>
      </div>
```

- [ ] **Step 4: Add the confirmation sheet as a sibling, at the end of the returned fragment**

A `BottomSheet` inside a heading inherits its font weight and is invalid markup, so it goes at the top level of the fragment — not inside the section above.

```tsx
      <BottomSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete my account">
        <p className="text-sm text-gray-600 mb-3">
          This deletes your log, your sessions, your photos and your account. It cannot be undone.
        </p>
        <p className="text-sm text-gray-600 mb-4">
          Beta, boulders and variations you published stay on the wall for the climbers using
          them, with your name taken off.
        </p>
        <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="delete-confirm">
          Type <span className="font-bold">{profile?.username}</span> to confirm
        </label>
        <input
          id="delete-confirm"
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          autoComplete="off"
          className="w-full border rounded-xl px-3 py-2 text-sm mb-4"
        />
        <button
          onClick={handleDelete}
          disabled={!deletionConfirmationMatches(confirmText, profile?.username) || deleteAccount.isPending}
          className="w-full bg-red-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-40"
        >
          {deleteAccount.isPending ? 'Deleting…' : 'Delete my account for good'}
        </button>
      </BottomSheet>
```

- [ ] **Step 5: Build and lint**

Run: `npm run build && npm run lint`
Expected: build exit 0; lint problem count unchanged from the baseline measured before this task.

- [ ] **Step 6: Commit**

```bash
git add src/pages/ProfilePage.tsx
git commit -m "Offer data export and account deletion on the profile page"
```

---

### Task 5: Verification and release gate

**Files:** none

- [ ] **Step 1: Full check**

```bash
npm run build && npx vitest run && npm run lint
```

Expected: build exit 0; all tests pass including the 8 new ones; lint count equal to the baseline.

- [ ] **Step 2: Manual pass — needs a deployed environment**

There is no `.env` in the repo, so the app cannot boot locally (`supabaseUrl is required`). The manual pass therefore happens against a preview deploy, in this order:

1. Migration 088 applied (Task 1, Step 4).
2. *Download my data* returns a file; open it and confirm `profiles` has your row, `sessions.user_id` has your sessions, and `unmapped_tables` is `[]`.
3. Register a throwaway account, give it an avatar and one logged problem with a photo, then delete it. Confirm: the avatar URL 404s, the account cannot log in, and — if the throwaway had published a boulder — the boulder still exists with a null `created_by`.

- [ ] **Step 3: State the release gate in the PR description**

Migration 088 must be applied **before** the client that calls these RPCs deploys, or both buttons fail against a missing function. 087 must be applied before 088 is useful.

## Out of scope

Privacy policy, signup consent, the age gate, the `problems` visibility model and the Groq disclosure — the next pieces of work, tracked in the spec.
