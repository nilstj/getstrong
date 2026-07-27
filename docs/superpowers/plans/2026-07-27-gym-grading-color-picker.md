# Gym Grading Color Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text gym-grading-colour field with a per-gym colour picker (visualised as a tape rectangle), let admins/setters rank each gym's colours and assign points, and surface a per-gym "grade score" leaderboard.

**Architecture:** A new `gym_gradings` table (keyed by the free-text `gym` string) stores, per (gym, colour): a difficulty `rank` and `points`. Writes go through a SECURITY DEFINER RPC gated on `is_admin OR is_setter`. The problem form's gym-colour input becomes a swatch picker driven by that gym's configured colours. Grade score is **derived on the fly** — problems are already readable by all authenticated users (migration `015`), so the leaderboard is computed client-side by a pure helper that mirrors the existing `buildLeaderboard`, with no award ledger.

**Tech Stack:** React 19, TypeScript, react-hook-form, @tanstack/react-query, Supabase (Postgres + RLS + plpgsql RPCs), Tailwind, Vitest.

## Global Constraints

- `npm run build` runs `tsc -b` with `noUnusedLocals` — **no unused imports or locals**, or the build fails.
- Lint baseline is 17 pre-existing problems — **add no new lint errors** (`npm run lint`).
- Migrations are **applied manually in the Supabase dashboard**; a deploy gates on applying them first. Number new migrations continuing from the current highest (`070_delete_gym_problem.sql` → next is `071`).
- Only **pure utils** are unit-tested (Vitest). Components, hooks, and SQL are verified by `npm run build` + manual check.
- Stored colour value is the colour **name** from `HOLD_COLORS` (e.g. `"Blue"`), matching `hold_color`. `colorHex()` already falls back for legacy free-text values.
- Follow existing patterns: hooks in `src/hooks`, pure utils in `src/utils` (+ `__tests__`), types in `src/types/index.ts`.

---

## File Structure

**Create:**
- `supabase/migrations/071_gym_gradings.sql` — table, RLS select policy, `save_gym_gradings` RPC.
- `src/hooks/useGymGradings.ts` — read config for a gym + save mutation.
- `src/utils/gradeLeaderboard.ts` — pure `pointsForColor` + `buildGradeLeaderboard`.
- `src/utils/__tests__/gradeLeaderboard.test.ts` — unit tests.
- `src/hooks/useGradeLeaderboard.ts` — per-gym grade-score leaderboard query.
- `src/pages/GymGradingPage.tsx` — admin/setter config editor.

**Modify:**
- `src/types/index.ts` — add `GymGrading` interface.
- `src/components/Chip.tsx` — add `TapeDot` + `TapeGraphic`.
- `src/components/ProblemForm.tsx` — replace free-text gym-colour input with the picker.
- `src/pages/GymGradingPage.tsx` route in `src/App.tsx`; link in `src/pages/ProfilePage.tsx`.
- `src/pages/CrewPage.tsx` — render grade-score leaderboard + swap gym-grade text for a tape swatch.
- `src/pages/SessionDetailPage.tsx` — swap gym-grade text for a tape swatch.
- `src/components/GymBoulderPicker.tsx` — add a tape swatch before the colour label.

---

## Task 1: `gym_gradings` table + RPC (migration)

**Files:**
- Create: `supabase/migrations/071_gym_gradings.sql`

**Interfaces:**
- Produces: table `gym_gradings(id, gym, color_name, rank int, points int, created_at, updated_at)` with `unique(gym, color_name)`; RPC `save_gym_gradings(p_gym text, p_rows jsonb)` where each element of `p_rows` is `{ "color_name": text, "rank": int, "points": int }`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/071_gym_gradings.sql`:

```sql
-- Per-gym grading colours. A "gym" is a free-text string (there is no gyms
-- table), so config is keyed by that string. Each row is one colour the gym
-- uses: `rank` orders colours easiest -> hardest (max rank = hardest), `points`
-- is what a climber earns for sending a problem of this colour. Colour names
-- come from HOLD_COLORS (src/utils/holdColors.ts).
create table if not exists gym_gradings (
  id          uuid primary key default gen_random_uuid(),
  gym         text not null,
  color_name  text not null,
  rank        int  not null,
  points      int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (gym, color_name)
);

alter table gym_gradings enable row level security;

-- Everyone signed in can read grading config (needed by the picker + leaderboard).
create policy "gym_gradings readable by authenticated users"
  on gym_gradings for select
  using (auth.role() = 'authenticated');

-- No direct writes: the whole colour set for a gym is saved atomically via this
-- RPC, gated on is_admin OR is_setter (same check as set_boulder_setter_intention,
-- migration 061). Delete-then-insert inside the function is transactional.
create or replace function public.save_gym_gradings(p_gym text, p_rows jsonb)
returns void as $$
declare
  v_gym text := nullif(trim(coalesce(p_gym, '')), '');
begin
  if v_gym is null then
    raise exception 'gym is required';
  end if;
  if not exists (
    select 1 from profiles
    where id = auth.uid() and (is_admin = true or is_setter = true)
  ) then
    raise exception 'Only admins or setters can edit gym gradings';
  end if;

  delete from gym_gradings where gym = v_gym;

  insert into gym_gradings (gym, color_name, rank, points)
  select v_gym,
         elem->>'color_name',
         (elem->>'rank')::int,
         coalesce((elem->>'points')::int, 0)
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as elem
  where nullif(trim(coalesce(elem->>'color_name', '')), '') is not null;
end;
$$ language plpgsql security definer;
```

- [ ] **Step 2: Verify it parses (dry check)**

Run: `grep -c "create or replace function" supabase/migrations/071_gym_gradings.sql`
Expected: `1`

- [ ] **Step 3: Apply in the Supabase dashboard**

Paste the migration into the Supabase SQL editor and run it. Confirm the `gym_gradings` table and `save_gym_gradings` function appear. (Per repo workflow, migrations are applied manually.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/071_gym_gradings.sql
git commit -m "feat: gym_gradings table + save_gym_gradings RPC"
```

---

## Task 2: `GymGrading` type + tape renderers

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/components/Chip.tsx`

**Interfaces:**
- Produces: `interface GymGrading { gym: string; color_name: string; rank: number; points: number }`; `TapeDot({ color, size? })` and `TapeGraphic({ color, size? })` React components.

- [ ] **Step 1: Add the `GymGrading` type**

In `src/types/index.ts`, add after the `GradeMapping` interface (line 54):

```ts
export interface GymGrading {
  gym: string
  color_name: string
  rank: number
  points: number
}
```

- [ ] **Step 2: Add tape renderers to `Chip.tsx`**

In `src/components/Chip.tsx`, add after `HoldGraphic` (after line 59):

```tsx
export function TapeDot({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-block rounded-sm border border-black/25 flex-shrink-0"
      style={{ width: size * 1.6, height: size * 0.72, backgroundColor: colorHex(color) }}
      title={color}
    />
  )
}

/**
 * A strip of climbing tape tinted with a gym's grading colour — the gym-grade
 * analogue of HoldGraphic. Used in the grade-colour picker and as a swatch
 * wherever a problem's gym grading colour is shown.
 */
export function TapeGraphic({ color, size = 40 }: { color?: string | null; size?: number }) {
  const hex = colorHex(color)
  const outline = '#1c1c1c'
  const w = Math.round(size * 1.7)
  const h = Math.round(size * 0.8)
  return (
    <svg width={w} height={h} viewBox="0 0 68 32" role="img" aria-label={color ? `${color} tape` : 'tape'} className="flex-shrink-0">
      <rect x="3" y="3" width="62" height="26" rx="4" fill={hex} stroke={outline} strokeWidth="3" strokeLinejoin="round" />
    </svg>
  )
}
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: build succeeds (no TS errors). `TapeDot`/`TapeGraphic` are exported but not yet imported anywhere — that is fine (exports are not "unused locals").

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/components/Chip.tsx
git commit -m "feat: GymGrading type and tape swatch renderers"
```

---

## Task 3: `useGymGradings` read + save hooks

**Files:**
- Create: `src/hooks/useGymGradings.ts`

**Interfaces:**
- Consumes: `GymGrading` (Task 2); `supabase` client; `save_gym_gradings` RPC (Task 1).
- Produces: `useGymGradings(gym: string | null | undefined): UseQueryResult<GymGrading[]>` (ordered by `rank` asc); `useSaveGymGradings()` mutation taking `{ gym: string; rows: { color_name: string; rank: number; points: number }[] }`.

- [ ] **Step 1: Write the hooks**

Create `src/hooks/useGymGradings.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { GymGrading } from '../types'

export function useGymGradings(gym: string | null | undefined) {
  return useQuery({
    queryKey: ['gym_gradings', gym],
    queryFn: async (): Promise<GymGrading[]> => {
      const { data, error } = await supabase
        .from('gym_gradings')
        .select('gym, color_name, rank, points')
        .eq('gym', gym!)
        .order('rank', { ascending: true })
      if (error) throw error
      return (data ?? []) as GymGrading[]
    },
    enabled: !!gym,
  })
}

export function useSaveGymGradings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ gym, rows }: { gym: string; rows: { color_name: string; rank: number; points: number }[] }) => {
      const { error } = await supabase.rpc('save_gym_gradings', { p_gym: gym, p_rows: rows })
      if (error) throw error
    },
    onSuccess: (_, { gym }) => {
      queryClient.invalidateQueries({ queryKey: ['gym_gradings', gym] })
    },
  })
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: build succeeds. (Hooks are exported; unused-until-consumed is fine.)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useGymGradings.ts
git commit -m "feat: useGymGradings read + save hooks"
```

---

## Task 4: ProblemForm gym-grade colour picker

**Files:**
- Modify: `src/components/ProblemForm.tsx`

**Interfaces:**
- Consumes: `useGymGradings` (Task 3), `TapeGraphic` (Task 2).
- Produces: no new exports; `color` form field now holds a `HOLD_COLORS` name chosen from the gym's configured colours.

- [ ] **Step 1: Add imports and watched values**

In `src/components/ProblemForm.tsx`, update the `Chip` import (line 7) and add the hook import (after line 8):

```tsx
import { HoldGraphic, TapeGraphic } from './Chip'
import { useProblemTagDefinitions } from '../hooks/useProblemTags'
import { useGymGradings } from '../hooks/useGymGradings'
```

Then, next to the other `watch` calls (after line 98 `const holdColor = watch('hold_color')`), add:

```tsx
  const color = watch('color')
  const gym = watch('gym')
  const { data: gymGradings = [] } = useGymGradings(gym)
```

- [ ] **Step 2: Replace the free-text gym-colour block**

Replace the whole block at lines 228-237 (the `Gym grading color (optional)` `<div>`) with:

```tsx
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Gym grading color (optional)</label>
            <input type="hidden" {...register('color')} />
            {!gym ? (
              <p className="text-xs text-gray-400">Enter a gym below to pick its grading colours.</p>
            ) : gymGradings.length === 0 ? (
              <p className="text-xs text-gray-400">No grading colours set for {gym} yet.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {gymGradings.map(g => {
                  const selected = color?.toLowerCase() === g.color_name.toLowerCase()
                  return (
                    <button
                      key={g.color_name}
                      type="button"
                      onClick={() => setValue('color', selected ? '' : g.color_name)}
                      title={`${g.color_name} · ${g.points} pts`}
                      aria-label={g.color_name}
                      aria-pressed={selected}
                      className={`grid place-items-center rounded-lg p-1 transition ${selected ? 'ring-2 ring-sage-600 bg-sage-50' : 'hover:bg-gray-100'}`}
                    >
                      <TapeGraphic color={g.color_name} size={26} />
                    </button>
                  )
                })}
              </div>
            )}
            {color && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm text-gray-600">{color} grade</span>
                <button type="button" onClick={() => setValue('color', '')} className="text-xs text-gray-400 hover:text-gray-600 ml-1">Clear</button>
              </div>
            )}
          </div>
```

Note: an edited problem whose legacy `color` is free text not in the palette keeps its value (hidden input + readout) with no swatch highlighted — the value is preserved, not lost.

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: build succeeds. Confirm no unused import remains (the old block used no imports we removed).

- [ ] **Step 4: Manual check**

Run: `npm run dev`, open the add-problem form. With no gym typed → hint shown. Type a gym that has config → tape swatches appear; clicking one selects it (ring) and shows "<Colour> grade" with Clear. Confirm the picker updates when you change the Gym field below.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProblemForm.tsx
git commit -m "feat: gym grading colour picker in ProblemForm"
```

---

## Task 5: Gym grading admin/setter page

**Files:**
- Create: `src/pages/GymGradingPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/ProfilePage.tsx`

**Interfaces:**
- Consumes: `useProfile`, `useGymSuggestions`, `useGymGradings` + `useSaveGymGradings` (Task 3), `HOLD_COLORS`, `TapeGraphic` (Task 2).
- Produces: route `/gym-grading`; a link in ProfilePage shown to admins and setters.

Rationale: `AdminPage` hard-gates on `is_admin` (returns "Not authorized" otherwise), so setters can't reach it. This grading editor lives on its own route gated on `is_admin OR is_setter`.

- [ ] **Step 1: Create the page**

Create `src/pages/GymGradingPage.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ArrowUp, ArrowDown, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useProfile } from '../hooks/useProfile'
import { useGymSuggestions } from '../hooks/useGymSuggestions'
import { useGymGradings, useSaveGymGradings } from '../hooks/useGymGradings'
import { HOLD_COLORS } from '../utils/holdColors'
import { TapeGraphic } from '../components/Chip'

interface Row { color_name: string; points: number }

export function GymGradingPage() {
  const navigate = useNavigate()
  const { data: profile, isLoading } = useProfile()
  const { data: gyms = [] } = useGymSuggestions()
  const [gym, setGym] = useState('')
  const { data: existing = [] } = useGymGradings(gym || null)
  const save = useSaveGymGradings()

  // Ordered easiest -> hardest. rank is the array index on save.
  const [rows, setRows] = useState<Row[]>([])
  useEffect(() => {
    setRows(existing.map(g => ({ color_name: g.color_name, points: g.points })))
  }, [existing])

  if (isLoading) return <div className="p-4 text-gray-500">Loading...</div>
  if (!profile?.is_admin && !profile?.is_setter) return <div className="p-4 text-red-500">Not authorized.</div>

  const used = new Set(rows.map(r => r.color_name))
  const available = HOLD_COLORS.filter(c => !used.has(c.name))

  const addColor = (name: string) => setRows(prev => [...prev, { color_name: name, points: 0 }])
  const removeColor = (name: string) => setRows(prev => prev.filter(r => r.color_name !== name))
  const setPoints = (name: string, points: number) =>
    setRows(prev => prev.map(r => (r.color_name === name ? { ...r, points } : r)))
  const move = (idx: number, dir: -1 | 1) => setRows(prev => {
    const next = [...prev]
    const j = idx + dir
    if (j < 0 || j >= next.length) return prev
    ;[next[idx], next[j]] = [next[j], next[idx]]
    return next
  })

  const onSave = () => {
    if (!gym) { toast.error('Pick a gym first'); return }
    save.mutate(
      { gym, rows: rows.map((r, i) => ({ color_name: r.color_name, rank: i, points: r.points })) },
      { onSuccess: () => toast.success('Grading saved'), onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to save') },
    )
  }

  return (
    <div className="p-4 space-y-6 pb-28">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/profile')} className="text-gray-400 hover:text-gray-700 transition-colors">
          <ChevronLeft size={20} strokeWidth={1.75} />
        </button>
        <h1 className="text-xl font-bold">Gym Grading</h1>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Gym</label>
        <input
          list="gym-grading-gyms"
          value={gym}
          onChange={e => setGym(e.target.value)}
          placeholder="e.g. Boulders Oslo"
          className="w-full border rounded-lg px-3 py-2.5"
        />
        <datalist id="gym-grading-gyms">
          {gyms.map(g => <option key={g.name} value={g.name} />)}
        </datalist>
      </div>

      {gym && (
        <>
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Colours (easiest → hardest)</p>
            {rows.length === 0 && <p className="text-sm text-gray-400 mb-2">No colours yet. Add some below.</p>}
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={r.color_name} className="flex items-center gap-3 border rounded-xl px-3 py-2">
                  <TapeGraphic color={r.color_name} size={26} />
                  <span className="text-sm font-medium text-gray-700 flex-1">{r.color_name}</span>
                  <label className="text-xs text-gray-400">pts</label>
                  <input
                    type="number"
                    value={r.points}
                    onChange={e => setPoints(r.color_name, Number(e.target.value) || 0)}
                    className="w-16 border rounded-lg px-2 py-1 text-sm"
                  />
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="text-gray-400 disabled:opacity-30 hover:text-gray-700"><ArrowUp size={16} /></button>
                  <button onClick={() => move(i, 1)} disabled={i === rows.length - 1} className="text-gray-400 disabled:opacity-30 hover:text-gray-700"><ArrowDown size={16} /></button>
                  <button onClick={() => removeColor(r.color_name)} className="text-gray-300 hover:text-red-500"><X size={16} /></button>
                </div>
              ))}
            </div>
          </div>

          {available.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-2">Add colour:</p>
              <div className="flex flex-wrap gap-2">
                {available.map(c => (
                  <button key={c.name} onClick={() => addColor(c.name)} title={c.name} aria-label={c.name}
                    className="grid place-items-center rounded-lg p-1 hover:bg-gray-100 transition">
                    <TapeGraphic color={c.name} size={26} />
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={onSave}
            disabled={save.isPending}
            className="w-full bg-sage-700 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : 'Save Grading'}
          </button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Register the route**

In `src/App.tsx`, add the import after line 17:

```tsx
import { GymGradingPage } from './pages/GymGradingPage'
```

And add the route after line 51 (`/admin`):

```tsx
                <Route path="/gym-grading" element={<GymGradingPage />} />
```

- [ ] **Step 3: Link it from ProfilePage**

In `src/pages/ProfilePage.tsx`, the Admin link block is at lines 306-316 (`{profile?.is_admin && (<Link to="/admin" ...>)}`). Add directly after that closing `)}` (line 316) a grading link visible to admins and setters:

```tsx
      {(profile?.is_admin || profile?.is_setter) && (
        <Link
          to="/gym-grading"
          className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 hover:border-gray-300 transition-colors"
        >
          <Shield size={18} strokeWidth={1.75} className="text-sage-700" />
          <span className="text-sm font-medium text-gray-700">Gym Grading</span>
          <span className="ml-auto text-gray-400 text-base">›</span>
        </Link>
      )}
```

(`Shield` and `Link` are already imported in ProfilePage — reused from the Admin link.)

- [ ] **Step 4: Verify it builds**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual check**

As an admin or setter, open Profile → Gym Grading. Pick a gym, add colours, reorder with the arrows, set points, Save → toast "Grading saved". Reopen: the saved order and points reload. As a non-setter/non-admin, `/gym-grading` shows "Not authorized."

- [ ] **Step 6: Commit**

```bash
git add src/pages/GymGradingPage.tsx src/App.tsx src/pages/ProfilePage.tsx
git commit -m "feat: gym grading admin/setter config page"
```

---

## Task 6: Grade-score aggregation util (TDD)

**Files:**
- Create: `src/utils/gradeLeaderboard.ts`
- Test: `src/utils/__tests__/gradeLeaderboard.test.ts`

**Interfaces:**
- Consumes: `GymGrading`, `LeaderboardEntry` (types).
- Produces: `interface GradeProblemRow { user_id: string; color: string | null; sent: boolean }`; `pointsForColor(gradings: GymGrading[], color: string | null): number`; `buildGradeLeaderboard(problems: GradeProblemRow[], gradings: GymGrading[], profiles: {id;username;avatar_url}[]): LeaderboardEntry[]`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/gradeLeaderboard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { pointsForColor, buildGradeLeaderboard } from '../gradeLeaderboard'
import type { GymGrading } from '../../types'

const gradings: GymGrading[] = [
  { gym: 'G', color_name: 'Green', rank: 0, points: 1 },
  { gym: 'G', color_name: 'Blue', rank: 1, points: 3 },
  { gym: 'G', color_name: 'Black', rank: 2, points: 10 },
]
const profiles = [
  { id: 'u1', username: 'ana', avatar_url: null },
  { id: 'u2', username: 'bo', avatar_url: null },
]

describe('pointsForColor', () => {
  it('maps a colour name to its points, case-insensitively', () => {
    expect(pointsForColor(gradings, 'blue')).toBe(3)
  })
  it('returns 0 for a null or unknown colour', () => {
    expect(pointsForColor(gradings, null)).toBe(0)
    expect(pointsForColor(gradings, 'Pink')).toBe(0)
  })
})

describe('buildGradeLeaderboard', () => {
  it('sums points over sent problems and ranks desc', () => {
    const rows = [
      { user_id: 'u1', color: 'Black', sent: true },   // 10
      { user_id: 'u1', color: 'Green', sent: true },   // 1  -> u1 = 11
      { user_id: 'u2', color: 'Blue', sent: true },    // 3  -> u2 = 3
    ]
    const lb = buildGradeLeaderboard(rows, gradings, profiles)
    expect(lb.map(e => [e.user_id, e.points, e.rank])).toEqual([
      ['u1', 11, 1],
      ['u2', 3, 2],
    ])
  })

  it('ignores unsent problems and unknown/zero colours', () => {
    const rows = [
      { user_id: 'u1', color: 'Black', sent: false },  // unsent -> ignored
      { user_id: 'u1', color: 'Pink', sent: true },    // unknown -> 0
      { user_id: 'u2', color: 'Blue', sent: true },    // 3
    ]
    const lb = buildGradeLeaderboard(rows, gradings, profiles)
    expect(lb).toEqual([{ user_id: 'u2', points: 3, username: 'bo', avatar_url: null, rank: 1 }])
  })

  it('gives tied scores the same rank (competition ranking)', () => {
    const rows = [
      { user_id: 'u1', color: 'Blue', sent: true },    // 3
      { user_id: 'u2', color: 'Blue', sent: true },    // 3
    ]
    const lb = buildGradeLeaderboard(rows, gradings, profiles)
    expect(lb.map(e => e.rank)).toEqual([1, 1])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run gradeLeaderboard`
Expected: FAIL — cannot resolve `../gradeLeaderboard`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/gradeLeaderboard.ts`:

```ts
import type { GymGrading, LeaderboardEntry } from '../types'

export interface GradeProblemRow {
  user_id: string
  color: string | null
  sent: boolean
}

/** Points for a stored colour name under a gym's config; 0 if null/unknown. */
export function pointsForColor(gradings: GymGrading[], color: string | null): number {
  if (!color) return 0
  const match = gradings.find(g => g.color_name.toLowerCase() === color.toLowerCase())
  return match?.points ?? 0
}

/**
 * Grade score per user = sum of a gym's colour points over the user's SENT
 * problems. Ranking mirrors buildLeaderboard (competition ranking: ties share a
 * rank, the next distinct score skips). Kept separate from buildLeaderboard so
 * the two leaderboards stay independently testable.
 */
export function buildGradeLeaderboard(
  problems: GradeProblemRow[],
  gradings: GymGrading[],
  profiles: { id: string; username: string | null; avatar_url: string | null }[],
): LeaderboardEntry[] {
  const profileById = new Map(profiles.map(p => [p.id, p]))

  const totals = new Map<string, number>()
  for (const p of problems) {
    if (!p.sent) continue
    const pts = pointsForColor(gradings, p.color)
    if (pts === 0) continue
    totals.set(p.user_id, (totals.get(p.user_id) ?? 0) + pts)
  }

  const sorted = Array.from(totals.entries())
    .map(([user_id, points]) => ({
      user_id,
      points,
      username: profileById.get(user_id)?.username ?? null,
      avatar_url: profileById.get(user_id)?.avatar_url ?? null,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      const an = a.username ?? '￿'
      const bn = b.username ?? '￿'
      return an < bn ? -1 : an > bn ? 1 : 0
    })

  let lastPoints: number | null = null
  let lastRank = 0
  return sorted.map((e, i) => {
    const rank = lastPoints !== null && e.points === lastPoints ? lastRank : i + 1
    lastPoints = e.points
    lastRank = rank
    return { ...e, rank }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --run gradeLeaderboard`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/utils/gradeLeaderboard.ts src/utils/__tests__/gradeLeaderboard.test.ts
git commit -m "feat: grade-score aggregation util with tests"
```

---

## Task 7: Grade-score leaderboard hook + render in CrewPage

**Files:**
- Create: `src/hooks/useGradeLeaderboard.ts`
- Modify: `src/pages/CrewPage.tsx`

**Interfaces:**
- Consumes: `buildGradeLeaderboard`, `GradeProblemRow` (Task 6); `GymGrading`, `LeaderboardEntry` types.
- Produces: `useGymGradeLeaderboard(gym: string): UseQueryResult<LeaderboardEntry[]>`.

- [ ] **Step 1: Write the hook**

Create `src/hooks/useGradeLeaderboard.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { buildGradeLeaderboard, type GradeProblemRow } from '../utils/gradeLeaderboard'
import type { GymGrading, LeaderboardEntry } from '../types'

export function useGymGradeLeaderboard(gym: string) {
  return useQuery({
    queryKey: ['grade_leaderboard', gym],
    queryFn: async (): Promise<LeaderboardEntry[]> => {
      const { data: gradings, error: gErr } = await supabase
        .from('gym_gradings')
        .select('gym, color_name, rank, points')
        .eq('gym', gym)
      if (gErr) throw gErr

      const { data: probs, error: pErr } = await supabase
        .from('problems')
        .select('user_id, color, sent')
        .eq('gym', gym)
        .eq('sent', true)
      if (pErr) throw pErr
      const rows = (probs ?? []) as GradeProblemRow[]

      const userIds = Array.from(new Set(rows.map(r => r.user_id)))
      let profiles: { id: string; username: string | null; avatar_url: string | null }[] = []
      if (userIds.length > 0) {
        const { data: profs, error: prErr } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', userIds)
        if (prErr) throw prErr
        profiles = (profs ?? []) as { id: string; username: string | null; avatar_url: string | null }[]
      }

      return buildGradeLeaderboard(rows, (gradings ?? []) as GymGrading[], profiles)
    },
    enabled: !!gym,
  })
}
```

- [ ] **Step 2: Wire the hook into CrewPage**

In `src/pages/CrewPage.tsx`, add the import next to the existing leaderboard import (line 14):

```tsx
import { useGymLeaderboard } from '../hooks/useLeaderboard'
import { useGymGradeLeaderboard } from '../hooks/useGradeLeaderboard'
```

Next to the existing leaderboard query (line 200), add:

```tsx
  const { data: gradeLeaderboard = [] } = useGymGradeLeaderboard(boulder?.gym ?? '')
```

- [ ] **Step 3: Render the grade-score leaderboard**

The existing month leaderboard is rendered at lines 567-583 inside `{boulder.gym && leaderboard.length > 0 && ( ... )}`. Immediately after that block's closing `)}`, add a parallel grade-score block (reuse the same list markup pattern):

```tsx
            {boulder.gym && gradeLeaderboard.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  {boulder.gym} grade score
                </p>
                <div className="space-y-1.5">
                  {gradeLeaderboard.slice(0, 5).map(entry => (
                    <div key={entry.user_id} className="flex items-center gap-2 text-sm">
                      <span className="w-5 text-gray-400 tabular-nums">{entry.rank}</span>
                      <span className="flex-1 text-gray-700 truncate">{entry.username ?? 'Climber'}</span>
                      <span className="font-semibold text-gray-800 tabular-nums">{entry.points}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
```

(If the surrounding markup differs slightly, match the existing month-leaderboard list markup at 575-582 for visual consistency.)

- [ ] **Step 4: Verify it builds**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual check**

Configure a gym's grading (Task 5), log some sent problems in that gym with graded colours, open a shared boulder for that gym (`/gym-problems/:id`) → the "<gym> grade score" list shows users ranked by summed points.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useGradeLeaderboard.ts src/pages/CrewPage.tsx
git commit -m "feat: per-gym grade-score leaderboard"
```

---

## Task 8: Show the gym-grade colour as a tape swatch

**Files:**
- Modify: `src/pages/SessionDetailPage.tsx`
- Modify: `src/pages/CrewPage.tsx`
- Modify: `src/components/GymBoulderPicker.tsx`

**Interfaces:**
- Consumes: `TapeGraphic` / `TapeDot` (Task 2).

Only the three *visual* render sites are changed. String/title/notification/fallback uses of `color` (BoulderLinkSheet:84, CrewPage:245, CreateBattleSheet:75, AppBar:152/157, HelpPage:128) stay as text — they compose plain-text labels, not chips.

- [ ] **Step 1: SessionDetailPage — swatch instead of "Gym grade: <text>"**

In `src/pages/SessionDetailPage.tsx`, the block at lines 245-247 currently reads:

```tsx
                      {problem.color && (
                        <span className="text-gray-400 text-sm font-normal ml-1">· Gym grade: {problem.color}</span>
                      )}
```

Replace it (mirroring the `hold_color` line just below at 248-252) with:

```tsx
                      {problem.color && (
                        <span className="ml-1.5 inline-flex items-center gap-1 align-middle text-gray-400 text-sm font-normal">
                          <TapeGraphic color={problem.color} size={16} /> {problem.color}
                        </span>
                      )}
```

Add `TapeGraphic` to the existing `Chip` import in this file (find the line importing `HoldGraphic` from `'../components/Chip'` and add `TapeGraphic`). Example:

```tsx
import { HoldGraphic, TapeGraphic } from '../components/Chip'
```

(If the existing import lists other names, keep them and append `TapeGraphic`.)

- [ ] **Step 2: CrewPage — swatch on the boulder's gym grade**

In `src/pages/CrewPage.tsx`, line 415 currently reads:

```tsx
              {boulder.color && <><span className="text-gray-300">·</span><span>Gym grade: {boulder.color}</span></>}
```

Replace with (mirroring the `hold_color` line 416):

```tsx
              {boulder.color && <><span className="text-gray-300">·</span><span className="inline-flex items-center gap-1"><TapeGraphic color={boulder.color} size={16} /> {boulder.color}</span></>}
```

Add `TapeGraphic` to CrewPage's existing `Chip` import (it already imports `HoldDot`/`HoldGraphic`). Example:

```tsx
import { HoldDot, HoldGraphic, TapeGraphic } from './Chip'
```

(Match the file's actual current import — keep existing names, append `TapeGraphic`. The import path may be `'../components/Chip'`; use whatever the file already uses.)

- [ ] **Step 3: GymBoulderPicker — tape swatch before the colour label**

In `src/components/GymBoulderPicker.tsx`, line 50 currently reads:

```tsx
            {b.color && <span className="text-[10px] text-white/80 leading-none truncate">{b.color}</span>}
```

Replace with:

```tsx
            {b.color && <TapeDot color={b.color} size={9} />}
            {b.color && <span className="text-[10px] text-white/80 leading-none truncate">{b.color}</span>}
```

Add `TapeDot` to the existing `Chip` import (the file already imports `HoldDot`). Example:

```tsx
import { HoldDot, TapeDot } from './Chip'
```

(Keep the file's existing imported names; append `TapeDot`.)

- [ ] **Step 4: Verify it builds**

Run: `npm run build`
Expected: build succeeds, no unused-import errors.

- [ ] **Step 5: Manual check**

Session detail: a problem with a gym colour shows a tape swatch + name. Shared boulder (CrewPage) header shows a tape swatch for the gym grade. GymBoulderPicker cards show a small tape before the colour name.

- [ ] **Step 6: Commit**

```bash
git add src/pages/SessionDetailPage.tsx src/pages/CrewPage.tsx src/components/GymBoulderPicker.tsx
git commit -m "feat: render gym grading colour as a tape swatch"
```

---

## Task 9: Final verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 2: Tests**

Run: `npm run test -- --run`
Expected: PASS, including the new `gradeLeaderboard` suite.

- [ ] **Step 3: Lint (no new problems)**

Run: `npm run lint`
Expected: no more than the baseline 17 problems; none in files this plan created/modified.

- [ ] **Step 4: Confirm migration applied**

Verify `071_gym_gradings.sql` has been run in the Supabase dashboard (Task 1, Step 3) before any deploy.

---

## Self-Review Notes (coverage vs spec)

- **§1 config storage** → Task 1 (`gym_gradings` + `save_gym_gradings`).
- **§2 palette + tape** → Task 2 (`TapeDot`/`TapeGraphic`, reuses `HOLD_COLORS`; `color` stays a name).
- **§3 ProblemForm picker** → Task 4.
- **§4 admin/setter config** → Task 5 (dedicated `/gym-grading` page gated `is_admin OR is_setter`; deviates from "section in AdminPage" because AdminPage hard-gates on `is_admin` — documented in Task 5).
- **§5 grade-score leaderboard** → Tasks 6 (pure util + tests) + 7 (hook + CrewPage render). Computed **client-side**, not via the RPC the spec floated, because problems are already readable by all authenticated users (migration `015`) — simpler and matches the existing `useGymLeaderboard` pattern. "Done" = `sent = true`, counted once.
- **§6 display updates** → Task 8 (three visual sites; text/title/notification sites intentionally unchanged).
- **§7 shared boulders** → the shared-boulder gym grade renders as a swatch (Task 8, CrewPage); shared-boulder colour *editing* paths are unchanged by this feature and remain out of scope, consistent with the spec's "no new RLS on `gym_problems`".
- **Testing** → Task 6 unit tests; components/hooks/SQL via build + manual (repo convention).
