# Instagram Handle on Beta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a climber save their Instagram handle on `/profile`, and show it as a small glyph beside their name on the beta they post on a shared boulder.

**Architecture:** One nullable `profiles.instagram_handle` column guarded by a database check constraint; one pure util (`src/utils/instagram.ts`) that reduces anything a climber pastes to a bare handle and is the only place an Instagram URL is built; a save block on the profile page; and a presentational `<InstagramLink>` dropped into the existing `BetaThreadCard` author row, fed by the profiles select `useBoulderBeta` already issues.

**Tech Stack:** React 18 + TypeScript, Vite, React Query (array query keys), Supabase (Postgres + RLS), Tailwind (`sage`/`khaki` palettes), `lucide-react`, `react-hot-toast`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-10-profile-instagram-link-design.md`

## Global Constraints

- **Migration release gate.** Migration `093` is applied **by hand in the Supabase dashboard**, never by tooling from this repo. It **must be applied before the client is deployed** — Task 3 makes the boulder-beta query select `instagram_handle`, so shipping the client first breaks the **beta tab on the boulder page**.
- **Lint baseline is 16 problems (15 errors, 1 warning)** measured on branch `feature/profile-instagram-link` on 2026-09-10. New work must add **zero**. Re-measure with `npm run lint` if the branch has moved.
- **`noUnusedLocals` and `noUnusedParameters` are ON.** An unused local is a build-failing error that fails the Vercel deploy.
- **Only pure functions in `src/utils/` are tested.** There is no `@testing-library/react`; hooks, components and pages are verified by `npm run build` plus a manual pass. Do not add a component test framework.
- **Supabase errors are not `Error` instances.** `e instanceof Error` is always false on a `{ data, error }` throw — use `errorMessage(e, fallback)` from `src/utils/errors.ts`.
- **Copy rule.** The user-facing wording is *"Where your beta clips live — shown on beta you post."* — the handle is framed as where a climber's beta lives, never as a follow-me badge.
- **Handle rule** (client regex and DB constraint must stay identical): `^[A-Za-z0-9._]{1,30}$`.
- **Scope fence.** The glyph appears **only** on the beta author's name in `BetaThreadCard`. Not on replies, not in the home feed, not on the leaderboards, not in the session roster, friends list or user search. `src/lib/profiles.ts` is not touched.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/093_profile_instagram.sql` | **Create.** The column plus its format check constraint. |
| `src/utils/instagram.ts` | **Create.** Pure parse/normalise + the single URL builder. |
| `src/utils/instagram.test.ts` | **Create.** Vitest table for the parser. |
| `src/hooks/useProfile.ts` | **Modify.** `Profile.instagram_handle`; allow the key in `useUpdateProfile`. |
| `src/pages/ProfilePage.tsx` | **Modify.** The editor block below Default Gyms. |
| `src/hooks/useBoulderBeta.ts` | **Modify.** Select the column; `BetaThread.authorInstagram`. |
| `src/components/InstagramLink.tsx` | **Create.** The presentational glyph-link. |
| `src/components/BetaThreadCard.tsx` | **Modify.** One element in the author row. |

---

### Task 1: The pure handle parser

Everything downstream depends on this, and it is the only part of the feature that can be unit-tested. Build it first, TDD.

**Files:**
- Create: `src/utils/instagram.ts`
- Test: `src/utils/instagram.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type InstagramParse = { status: 'empty' } | { status: 'ok'; handle: string } | { status: 'invalid' }`
  - `parseInstagramHandle(input: string): InstagramParse`
  - `instagramUrl(handle: string): string`

- [ ] **Step 1: Write the failing test**

Create `src/utils/instagram.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseInstagramHandle, instagramUrl } from './instagram'

describe('parseInstagramHandle', () => {
  it('accepts a bare handle', () => {
    expect(parseInstagramHandle('nils')).toEqual({ status: 'ok', handle: 'nils' })
  })

  it('strips a leading @', () => {
    expect(parseInstagramHandle('@nils.climbs')).toEqual({ status: 'ok', handle: 'nils.climbs' })
  })

  it('trims surrounding whitespace', () => {
    expect(parseInstagramHandle('  @nils  ')).toEqual({ status: 'ok', handle: 'nils' })
  })

  it('reduces a pasted profile URL to the handle, in all the shapes people paste', () => {
    for (const input of [
      'instagram.com/nils',
      'www.instagram.com/nils',
      'https://instagram.com/nils',
      'https://www.instagram.com/nils/',
      'http://m.instagram.com/nils',
      'https://instagram.com/nils?hl=en',
      'https://www.instagram.com/nils/?utm_source=qr',
    ]) {
      expect(parseInstagramHandle(input)).toEqual({ status: 'ok', handle: 'nils' })
    }
  })

  it('preserves the capitalisation the climber typed', () => {
    expect(parseInstagramHandle('@NilsClimbs')).toEqual({ status: 'ok', handle: 'NilsClimbs' })
  })

  it('reads a cleared field as empty rather than invalid', () => {
    expect(parseInstagramHandle('')).toEqual({ status: 'empty' })
    expect(parseInstagramHandle('   ')).toEqual({ status: 'empty' })
    expect(parseInstagramHandle('@')).toEqual({ status: 'empty' })
  })

  it('rejects anything that is not a lone handle', () => {
    for (const input of [
      'nils/photos',
      'nils@x',
      'nils climbs',
      'instagram.com/p/abc123',
      'a'.repeat(31),
    ]) {
      expect(parseInstagramHandle(input)).toEqual({ status: 'invalid' })
    }
  })

  it('accepts a handle at the 30-character boundary', () => {
    const h = 'a'.repeat(30)
    expect(parseInstagramHandle(h)).toEqual({ status: 'ok', handle: h })
  })
})

describe('instagramUrl', () => {
  it('builds the profile URL from the handle alone', () => {
    expect(instagramUrl('nils.climbs')).toBe('https://instagram.com/nils.climbs')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/utils/instagram.test.ts`

Expected: FAIL — `Failed to resolve import "./instagram"`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/instagram.ts`:

```ts
/**
 * An Instagram handle as a climber typed it, reduced to one of three states.
 * `empty` and `invalid` stay apart on purpose: the caller has to tell "they
 * cleared the field" (save null) from "they mistyped" (say so, change nothing).
 */
export type InstagramParse =
  | { status: 'empty' }
  | { status: 'ok'; handle: string }
  | { status: 'invalid' }

/** Kept identical to the profiles.instagram_handle check constraint (093). */
const HANDLE = /^[A-Za-z0-9._]{1,30}$/

/**
 * Accepts what people actually paste — a bare handle, an @handle, or a copied
 * profile URL — and reduces it to the handle alone. It never returns a URL, so
 * a stored value can only ever be turned back into an instagram.com link.
 */
export function parseInstagramHandle(input: string): InstagramParse {
  const handle = input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^(?:www\.|m\.)?instagram\.com\//i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .replace(/^@/, '')
  if (handle === '') return { status: 'empty' }
  return HANDLE.test(handle) ? { status: 'ok', handle } : { status: 'invalid' }
}

/** The one place an Instagram URL is built. */
export function instagramUrl(handle: string): string {
  return `https://instagram.com/${handle}`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/instagram.test.ts`

Expected: PASS — 9 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/utils/instagram.ts src/utils/instagram.test.ts
git commit -m "Reduce anything a climber pastes to a bare Instagram handle"
```

---

### Task 2: Saving the handle

Deliverable: a climber can set, change and clear their handle on `/profile`, and it survives a reload. Nothing renders it to anyone else yet.

**Files:**
- Create: `supabase/migrations/093_profile_instagram.sql`
- Modify: `src/hooks/useProfile.ts` (the `Profile` interface; the `useUpdateProfile` key set)
- Modify: `src/pages/ProfilePage.tsx` (imports, state, effect, handler, and one block after the Default Gyms block)

**Interfaces:**
- Consumes: `parseInstagramHandle` from Task 1; `errorMessage` from `src/utils/errors.ts`.
- Produces: `Profile.instagram_handle: string | null`, readable by any component via `useProfile()`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/093_profile_instagram.sql`:

```sql
-- A climber's Instagram handle, shown beside their name on beta they post.
-- Stored as the bare handle, never a URL: the client builds the href from it
-- (src/utils/instagram.ts), so this column cannot point anywhere but Instagram.
alter table profiles add column if not exists instagram_handle text;

-- Instagram's own handle rule, and the real guard on this field — the client
-- regex in src/utils/instagram.ts is a courtesy, this is what a bypassed client
-- still has to satisfy. Kept identical to that regex.
alter table profiles drop constraint if exists profiles_instagram_handle_format;
alter table profiles add constraint profiles_instagram_handle_format
  check (instagram_handle is null or instagram_handle ~ '^[A-Za-z0-9._]{1,30}$');

-- No new RLS policy: profiles already carries "users can update own profile"
-- from migration 002, so a client update of this column lands rather than
-- silently no-opping. export_my_data (088) serialises the row with to_jsonb,
-- so the handle reaches the data export with no change there.
```

- [ ] **Step 2: Apply the migration by hand**

Open the Supabase dashboard → SQL editor, paste the file's contents, run it. Then confirm both the column and the constraint exist:

```sql
select column_name from information_schema.columns
 where table_name = 'profiles' and column_name = 'instagram_handle';
select conname from pg_constraint where conname = 'profiles_instagram_handle_format';
```

Expected: one row from each. Also confirm the constraint actually bites:

```sql
update profiles set instagram_handle = 'no spaces allowed' where id = auth.uid();
```

Expected: ERROR — `violates check constraint "profiles_instagram_handle_format"`.

- [ ] **Step 3: Add the field to the profile type and the update whitelist**

In `src/hooks/useProfile.ts`, add the field to the `Profile` interface immediately after `default_gyms`:

```ts
  default_gyms: string[]
  /** Bare handle, no @ and no URL — see src/utils/instagram.ts. */
  instagram_handle: string | null
  on_wall_at: string | null
```

and widen the `useUpdateProfile` key set:

```ts
    mutationFn: async (values: Partial<Pick<Profile, 'username' | 'avatar_url' | 'grade_preference' | 'default_gyms' | 'instagram_handle'>>) => {
```

- [ ] **Step 4: Add the editor to the profile page**

In `src/pages/ProfilePage.tsx`, add two imports next to the existing util imports:

```ts
import { parseInstagramHandle } from '../utils/instagram'
import { errorMessage } from '../utils/errors'
```

Add state beside the existing `gyms` state:

```ts
  const [instagram, setInstagram] = useState('')
```

Add an effect immediately after the existing `gyms` effect — **keep the eslint-disable comment**, the repo's `react-hooks/set-state-in-effect` rule flags this pattern and the baseline must not grow:

```ts
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setInstagram(profile?.instagram_handle ?? '') }, [profile?.instagram_handle])
```

Add the handler beside `handleSaveUsername`:

```ts
  const handleSaveInstagram = () => {
    const parsed = parseInstagramHandle(instagram)
    if (parsed.status === 'invalid') {
      toast.error("That doesn't look like an Instagram handle")
      return
    }
    const next = parsed.status === 'empty' ? null : parsed.handle
    // Blur fires on every exit from the field; only write when it changed.
    if (next === (profile?.instagram_handle ?? null)) return
    updateProfile.mutate({ instagram_handle: next }, {
      onSuccess: () => toast.success(next ? 'Instagram saved' : 'Instagram removed'),
      onError: (e: unknown) => toast.error(errorMessage(e, 'Could not save that handle')),
    })
  }
```

Then insert this block in the JSX **directly after the closing `</div>` of the Default Gyms block** (the one holding `<DefaultGymsEditor>`), still inside the surrounding `flex flex-col items-center` column:

```tsx
        <div className="w-full">
          <p className="text-xs text-gray-400 text-center mb-2 uppercase tracking-wider font-medium">Instagram</p>
          <div className="flex items-center gap-1.5 w-full border border-gray-200 rounded-xl px-3 py-2 bg-white">
            <span className="text-sm text-gray-400">@</span>
            <input
              value={instagram}
              onChange={e => setInstagram(e.target.value)}
              onBlur={handleSaveInstagram}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
              placeholder="your.handle"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 min-w-0 text-sm bg-transparent outline-none"
            />
          </div>
          <p className="text-[11px] text-gray-400 text-center mt-1.5">
            Where your beta clips live — shown on beta you post.
          </p>
        </div>
```

Enter blurs the field, and blur is the only save path — so there is exactly one place a write can start.

- [ ] **Step 5: Build and lint**

Run: `npm run build`

Expected: no TypeScript errors, `vite build` writes `dist/`.

Run: `npm run lint 2>&1 | tail -3`

Expected: `✖ 16 problems (15 errors, 1 warning)` — unchanged from the baseline.

- [ ] **Step 6: Manual pass at phone width**

In the running app (`npm run dev`, browser at ~390px wide), on `/profile`:

1. Type `@Nils.Climbs` into the Instagram field, tap outside → toast **"Instagram saved"**.
2. Reload the page → the field shows `Nils.Climbs` (the `@` stripped, capitals kept).
3. Paste `https://www.instagram.com/someone/?hl=en`, press Enter → toast **"Instagram saved"**; reload → field shows `someone`.
4. Type `not a handle`, tap outside → toast **"That doesn't look like an Instagram handle"**; reload → the previous value is still there.
5. Clear the field entirely, tap outside → toast **"Instagram removed"**; reload → still empty.
6. Set it back to your real handle before moving on — Task 3's manual pass needs it.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/093_profile_instagram.sql src/hooks/useProfile.ts src/pages/ProfilePage.tsx
git commit -m "Let a climber say where their beta clips live"
```

---

### Task 3: The glyph on the beta author

Deliverable: the handle reaches the boulder page and renders as a tappable glyph next to the author of each beta.

**Files:**
- Modify: `src/hooks/useBoulderBeta.ts` (the `BetaThread` interface; the `profileById` map type; the profiles `.select(...)`; the loop that fills the map; the `threads` mapping)
- Create: `src/components/InstagramLink.tsx`
- Modify: `src/components/BetaThreadCard.tsx` (one import, one element in the author row)

**Interfaces:**
- Consumes: `instagramUrl` from Task 1; `Profile.instagram_handle` from Task 2 (read here straight off the `profiles` table, not via `useProfile`).
- Produces: `BetaThread.authorInstagram: string | null`; `<InstagramLink handle={...} size={14} className="" />`.

- [ ] **Step 1: Carry the handle through the beta query**

In `src/hooks/useBoulderBeta.ts`, add the field to `BetaThread` directly after `authorAvatarUrl` — leave `BetaReply` alone, replies deliberately get no glyph:

```ts
  authorName: string | null
  authorAvatarUrl: string | null
  authorInstagram: string | null
  reactions: ReactionAgg[]
```

Widen the profile map's type and its select. Replace:

```ts
      const profileById = new Map<string, { username: string | null; avatar_url: string | null }>()
      if (allIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, username, avatar_url').in('id', allIds)
        for (const p of profs ?? []) {
          profileById.set(p.id as string, { username: p.username as string | null, avatar_url: p.avatar_url as string | null })
        }
      }
```

with:

```ts
      const profileById = new Map<string, { username: string | null; avatar_url: string | null; instagram_handle: string | null }>()
      if (allIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, username, avatar_url, instagram_handle').in('id', allIds)
        for (const p of profs ?? []) {
          profileById.set(p.id as string, {
            username: p.username as string | null,
            avatar_url: p.avatar_url as string | null,
            instagram_handle: p.instagram_handle as string | null,
          })
        }
      }
```

Then in the `threads` mapping, add one line after `authorAvatarUrl`:

```ts
        authorName: profileById.get(b.user_id)?.username ?? null,
        authorAvatarUrl: profileById.get(b.user_id)?.avatar_url ?? null,
        authorInstagram: profileById.get(b.user_id)?.instagram_handle ?? null,
```

`BetaThread` is built in exactly this one place, so no other literal needs the new field.

- [ ] **Step 2: Write the glyph component**

Create `src/components/InstagramLink.tsx`:

```tsx
import { Instagram } from 'lucide-react'
import { instagramUrl } from '../utils/instagram'

/**
 * The Instagram glyph shown after a beta author's name — you watched their
 * beta, this is where the rest of their clips live. Give it the bare handle
 * from their profile; it renders a link, or nothing.
 *
 * The href is built here from the handle and never stored, so this can only
 * ever point at instagram.com. Renders inline; safe to drop next to any name.
 */
export function InstagramLink({
  handle,
  size = 14,
  className = '',
}: { handle?: string | null; size?: number; className?: string }) {
  if (!handle) return null
  const label = `@${handle} on Instagram`
  return (
    <a
      href={instagramUrl(handle)}
      target="_blank"
      rel="noopener noreferrer"
      // The glyph can sit inside a tappable card; a tap on it is not a tap on that.
      onClick={e => e.stopPropagation()}
      title={label}
      aria-label={label}
      className={`inline-flex shrink-0 text-gray-400 hover:text-sage-700 ${className}`}
    >
      <Instagram size={size} strokeWidth={2} />
    </a>
  )
}
```

- [ ] **Step 3: Put it in the beta author row**

In `src/components/BetaThreadCard.tsx`, add the import after the `SetterBadge` import:

```ts
import { InstagramLink } from './InstagramLink'
```

and add one element directly after the `SetterBadge` in the author row:

```tsx
        <span className="text-sm font-semibold">{thread.authorName ?? 'Someone'}</span>
        <SetterBadge userId={thread.user_id} />
        <InstagramLink handle={thread.authorInstagram} />
```

That row already ends in a `<span className="flex-1" />` spacer, so nothing else reflows. Do **not** add one to the reply row further down the same file.

- [ ] **Step 4: Build and lint**

Run: `npm run build`

Expected: no TypeScript errors. If it complains that `authorInstagram` is missing on an object literal, a second `BetaThread` construction site has appeared since this plan was written — add the field there too.

Run: `npm run lint 2>&1 | tail -3`

Expected: `✖ 16 problems (15 errors, 1 warning)` — unchanged from the baseline.

- [ ] **Step 5: Run the whole test suite**

Run: `npx vitest run`

Expected: all suites pass, including `src/utils/instagram.test.ts`.

- [ ] **Step 6: Manual pass at phone width**

With your handle set from Task 2, at ~390px wide:

1. Open a shared boulder (`/gym-problems/:id`) where you have posted beta — or post some — and open the **Beta** tab.
2. The glyph sits after your name, after the wrench if you have the setter role.
3. Tap it → Instagram opens **in a new tab**, on your profile; the boulder page is still there behind it.
4. Confirm a beta from a climber with no handle shows **no** glyph and no gap.
5. Confirm replies under a beta show no glyph.
6. Clear your handle on `/profile`, return to the boulder → the glyph is gone.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useBoulderBeta.ts src/components/InstagramLink.tsx src/components/BetaThreadCard.tsx
git commit -m "Point at where a beta author's clips live"
```

---

## Release checklist

- [ ] Migration `093_profile_instagram.sql` applied in the Supabase dashboard, and both verification queries in Task 2 Step 2 return a row. **Do this before pushing** — the client selects the column, so an unapplied migration breaks the beta tab on the boulder page.
- [ ] `npx vitest run` green.
- [ ] `npm run build` green.
- [ ] `npm run lint` still at 16 problems.
- [ ] Both manual passes walked on a phone-width viewport.
- [ ] Merged to `main` (pushing `main` auto-deploys via Vercel — a push is a release).
