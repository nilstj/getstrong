# IG Redesign — Plan 3: Boulder Page

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the crew page (`/gym-problems/:id`) into the Instagram-style boulder page where learning + digs happen — a ranked **Beta** thread with "✓ worked for N", the **Crew** with playful titles, and a **Banter** dig panel.

**Architecture:** One page rewrite (`CrewPage`) on top of a small hook-prep task. The page composes Plan 2 primitives (`Chip`/`HoldDot`, `BetaCard`, `CrewTitleBadge`) and Plan 1 hooks (`useBoulderBetas`, `useAddBoulderBeta`, `useMark/UnmarkBetaWorked`, `useGymProblemReactions` + add/remove) and the pure helper `crewTitles`. Existing crew/leaderboard/strip behavior is preserved inside the Crew tab.

**Tech Stack:** React 18 + TS + Vite + Tailwind, `@tanstack/react-query`, `react-hot-toast`, `lucide-react`. Spec: `docs/superpowers/specs/2026-06-26-ig-redesign-foundation-and-hero-screens-design.md`.

## Global Constraints

- Preserve existing behavior: strip ("This got stripped"), the per-gym monthly leaderboard, crew member states. Don't regress them — they move into the **Crew** tab.
- Use Plan 1 hooks/types and Plan 2 primitives; don't reimplement them.
- **Banter = emoji digs** (the `gym_problem_reactions` built in Plan 1). **Text banter (a boulder comment thread) is OUT OF SCOPE** — the data model has no boulder-comments table; it's a deferred follow-on (note it, don't fake it).
- "helped N climbers" teaching-credit on a beta author is deferred to the Profile sub-project (BetaCard's `helpedLabel` is left unset here).
- ESLint baseline **17**, introduce **0 new**. `noUnusedLocals`/`noUnusedParameters` ON; `@typescript-eslint/no-unused-vars` has no `^_` ignore (the `(_, v) =>` positional form is the only allowed unused placeholder). Remove any import that becomes unused during the rewrite (e.g. `Trophy` stays only if the leaderboard keeps it).
- Verification gate per task: `npx tsc -b` clean + `npm run lint` ≤17 + `npm run build` succeeds. No new unit tests (page/hook wiring is build-verified; `crewTitles`/`betaSort` are already tested).
- **Release gate:** this page calls the Plan 1 RPCs/tables — migrations 052–055 must be applied before it deploys (the branch can merge ahead of the apply; it must not go live first).

---

### Task 1: Hook prep — expose crew problem rows + enrich beta authors

`crewTitles` needs the raw per-problem rows (user_id/sent/attempts/created_at), and `BetaCard` needs an author name/avatar. Extend the two hooks to provide them.

**Files:**
- Modify: `src/hooks/useCrew.ts` (return the rows it already builds)
- Modify: `src/hooks/useBoulderBeta.ts` (attach author profile to each beta)

**Interfaces:**
- Produces: `useCrew(id)` returns `{ members: CrewMember[]; summary: CrewSummary; problems: CrewProblemRow[] }` (adds `problems`).
- Produces: `useBoulderBetas(gymProblemId)` returns `(BoulderBeta & { authorName: string | null; authorAvatarUrl: string | null })[]`, still sorted by `betaSort`.

- [ ] **Step 1: Return the rows from `useCrew`**

In `src/hooks/useCrew.ts`, the query already builds `const rows: CrewProblemRow[] = problems.map(...)`. Change the final `return { members, summary: summarizeCrew(members) }` to also return the rows:

```ts
      return { members, summary: summarizeCrew(members), problems: rows }
```

(If the `queryFn` has an explicit return type annotation like `Promise<{ members: CrewMember[]; summary: CrewSummary }>`, extend it to include `problems: CrewProblemRow[]`. `CrewProblemRow` is already imported in this file.)

- [ ] **Step 2: Enrich `useBoulderBetas` with author profiles**

In `src/hooks/useBoulderBeta.ts`, after building the `rows: BoulderBeta[]` (before the `return rows.sort(betaSort)`), fetch the authors' profiles and attach them. Replace the `queryFn`'s return type and tail so it reads:

```ts
    queryFn: async (): Promise<(BoulderBeta & { authorName: string | null; authorAvatarUrl: string | null })[]> => {
      const { data: { user } } = await supabase.auth.getUser()
      const [betasRes, workedRes] = await Promise.all([
        supabase
          .from('boulder_beta')
          .select('id, gym_problem_id, user_id, body, video_url, created_at, boulder_beta_worked(count)')
          .eq('gym_problem_id', gymProblemId),
        supabase
          .from('boulder_beta_worked')
          .select('beta_id')
          .eq('user_id', user?.id ?? ''),
      ])
      if (betasRes.error) throw betasRes.error
      const mine = new Set((workedRes.data ?? []).map(r => r.beta_id as string))
      const base = (betasRes.data ?? []).map((r): BoulderBeta => ({
        id: r.id as string,
        gym_problem_id: r.gym_problem_id as string,
        user_id: r.user_id as string,
        body: r.body as string | null,
        video_url: r.video_url as string | null,
        created_at: r.created_at as string,
        worked_count: ((r.boulder_beta_worked as { count: number }[] | null)?.[0]?.count) ?? 0,
        worked_by_me: mine.has(r.id as string),
      }))
      const authorIds = Array.from(new Set(base.map(b => b.user_id)))
      const profileById = new Map<string, { username: string | null; avatar_url: string | null }>()
      if (authorIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', authorIds)
        for (const p of profs ?? []) {
          profileById.set(p.id as string, { username: p.username as string | null, avatar_url: p.avatar_url as string | null })
        }
      }
      const rows = base.map(b => ({
        ...b,
        authorName: profileById.get(b.user_id)?.username ?? null,
        authorAvatarUrl: profileById.get(b.user_id)?.avatar_url ?? null,
      }))
      return rows.sort(betaSort)
    },
```

(This replaces the previous body of `useBoulderBetas`'s `queryFn`. The other hooks in the file are unchanged. `betaSort` accepts `BoulderBeta`; the enriched objects are assignable.)

- [ ] **Step 3: Verify**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: tsc clean; lint ≤17; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCrew.ts src/hooks/useBoulderBeta.ts
git commit -m "feat: useCrew returns problem rows; useBoulderBetas enriches author profile

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Rewrite `CrewPage` into the tabbed boulder page

Replace the whole page with the hero + **Beta / Crew / Banter** tabs. Beta is the default tab.

**Files:**
- Modify (full rewrite): `src/pages/CrewPage.tsx`

**Interfaces:**
- Consumes: `useGymProblem`, `useCrew` (now with `problems`), `useGymLeaderboard`, `useStripGymProblem`, `useBoulderBetas`/`useAddBoulderBeta`/`useMarkBetaWorked`/`useUnmarkBetaWorked`, `useGymProblemReactions`/`useAddGymProblemReaction`/`useRemoveGymProblemReaction`, `crewTitles`, `daysUntil`, `cycleMonth`, `useAuth`; primitives `Chip`/`HoldDot`, `BetaCard`, `CrewTitleBadge`.

- [ ] **Step 1: Replace the file**

Replace the entire contents of `src/pages/CrewPage.tsx` with:

```tsx
import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Users, Trophy, Play, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { useGymProblem, useCrew } from '../hooks/useCrew'
import { useGymLeaderboard } from '../hooks/useLeaderboard'
import { useStripGymProblem } from '../hooks/useGymProblems'
import {
  useBoulderBetas,
  useAddBoulderBeta,
  useMarkBetaWorked,
  useUnmarkBetaWorked,
  useGymProblemReactions,
  useAddGymProblemReaction,
  useRemoveGymProblemReaction,
} from '../hooks/useBoulderBeta'
import { daysUntil } from '../utils/gymProblems'
import { cycleMonth } from '../utils/leaderboard'
import { crewTitles } from '../utils/crewTitles'
import { useAuth } from '../providers/AuthProvider'
import { Chip, HoldDot } from '../components/Chip'
import { BetaCard } from '../components/BetaCard'
import { CrewTitleBadge } from '../components/CrewTitleBadge'
import type { CrewState } from '../types'

const STATE_LABEL: Record<CrewState, string> = { projecting: 'Projecting', sent: 'Sent', flashed: 'Flashed' }
const STATE_CLASS: Record<CrewState, string> = {
  projecting: 'bg-gray-100 text-gray-600',
  sent: 'bg-sage-100 text-sage-700',
  flashed: 'bg-amber-100 text-amber-700',
}
const DIG_EMOJIS = ['🔥', '💪', '😂', '🐒', '🪨']
type Tab = 'beta' | 'crew' | 'banter'

export function CrewPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { data: boulder, isLoading: loadingBoulder } = useGymProblem(id)
  const { data: crew, isLoading: loadingCrew } = useCrew(id)
  const month = cycleMonth(new Date())
  const { data: leaderboard = [] } = useGymLeaderboard(boulder?.gym ?? '', month)
  const { data: betas = [] } = useBoulderBetas(id)
  const { data: reactions = [] } = useGymProblemReactions(id)
  const strip = useStripGymProblem()
  const addBeta = useAddBoulderBeta()
  const markWorked = useMarkBetaWorked()
  const unmarkWorked = useUnmarkBetaWorked()
  const addReaction = useAddGymProblemReaction()
  const removeReaction = useRemoveGymProblemReaction()

  const [tab, setTab] = useState<Tab>('beta')
  const [draft, setDraft] = useState('')
  const [draftVideo, setDraftVideo] = useState('')

  if (loadingBoulder || loadingCrew) {
    return <div className="p-5 text-sm text-gray-400">Loading boulder…</div>
  }
  if (!boulder) {
    return <div className="p-5 text-sm text-gray-400">This boulder no longer exists.</div>
  }

  const left = daysUntil(boulder.expires_at, new Date())
  const summary = crew?.summary
  const members = crew?.members ?? []
  const titles = crewTitles(crew?.problems ?? [])
  const title = boulder.name || `${boulder.color ?? ''} ${boulder.wall_angle ?? ''}`.trim() || 'Shared boulder'

  // Dig tallies from gym_problem_reactions
  const digTally = DIG_EMOJIS.map(emoji => {
    const rs = reactions.filter(r => r.emoji === emoji)
    return { emoji, count: rs.length, mine: rs.some(r => r.user_id === user?.id) }
  })
  const toggleDig = (emoji: string, mine: boolean) => {
    if (mine) removeReaction.mutate({ gymProblemId: id, emoji })
    else addReaction.mutate({ gymProblemId: id, emoji })
  }

  const submitBeta = () => {
    const body = draft.trim()
    const videoUrl = draftVideo.trim() || null
    if (!body && !videoUrl) return
    addBeta.mutate(
      { gymProblemId: id, body: body || null, videoUrl },
      {
        onSuccess: () => { setDraft(''); setDraftVideo(''); toast.success('Beta shared') },
        onError: () => toast.error('Could not post beta'),
      },
    )
  }

  const toggleWorked = (betaId: string, workedByMe: boolean) => {
    const v = { betaId, gymProblemId: id }
    if (workedByMe) unmarkWorked.mutate(v, { onError: () => toast.error('Could not update') })
    else markWorked.mutate(v, { onError: () => toast.error('Could not update') })
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'beta', label: `Beta ${betas.length || ''}`.trim() },
    { key: 'crew', label: `Crew ${summary?.total ?? 0}` },
    { key: 'banter', label: `Banter ${reactions.length || ''}`.trim() },
  ]

  return (
    <div className="pb-32 lg:max-w-2xl lg:mx-auto">
      {/* Hero */}
      <div className="relative">
        <div className="relative aspect-[16/10] max-h-80 w-full bg-gradient-to-br from-sage-700 to-sage-900">
          {boulder.image_url && (
            <img src={boulder.image_url} alt={title} className="absolute inset-0 w-full h-full object-cover" />
          )}
          {boulder.beta_video_url && !boulder.image_url && (
            <span className="absolute inset-0 grid place-items-center">
              <Play size={48} className="text-white/90" fill="currentColor" />
            </span>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent" />
          <Link to="/dashboard" aria-label="Back"
            className="absolute left-3 top-3 z-10 grid place-items-center w-9 h-9 rounded-full bg-black/35 text-white">
            <ArrowLeft size={18} />
          </Link>
          <div className="absolute left-4 bottom-3 right-4 text-white">
            <h1 className="text-lg font-bold tracking-tight">{title}</h1>
            <div className="mt-1 flex items-center gap-2 text-xs">
              {boulder.community_grade && <Chip label={boulder.community_grade} variant="grade" />}
              {boulder.color && <HoldDot color={boulder.color} />}
              <span className="opacity-90">
                {[boulder.gym, summary ? `${summary.sent}/${summary.total} sent` : null].filter(Boolean).join(' · ')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${
              tab === t.key ? 'text-gray-900 shadow-[inset_0_-2px_0] shadow-sage-700' : 'text-gray-400'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 pt-4">
        {/* BETA */}
        {tab === 'beta' && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-3 space-y-2">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="Share beta or call someone out…"
                rows={2}
                className="w-full resize-none text-sm focus:outline-none placeholder:text-gray-400"
              />
              <input
                value={draftVideo}
                onChange={e => setDraftVideo(e.target.value)}
                placeholder="Beta video link (optional)"
                className="w-full text-xs text-gray-600 border-t border-gray-100 pt-2 focus:outline-none placeholder:text-gray-400"
              />
              <div className="flex justify-end">
                <button type="button" onClick={submitBeta}
                  disabled={addBeta.isPending || (!draft.trim() && !draftVideo.trim())}
                  className="inline-flex items-center gap-1.5 rounded-full bg-sage-700 px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
                  <Send size={14} /> Post
                </button>
              </div>
            </div>

            {betas.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">Be the first to crack it — share your beta.</p>
            ) : (
              betas.map((b, i) => (
                <BetaCard
                  key={b.id}
                  beta={b}
                  authorName={b.authorName ?? 'Someone'}
                  authorAvatarUrl={b.authorAvatarUrl}
                  best={i === 0 && b.worked_count > 0}
                  onToggleWorked={() => toggleWorked(b.id, b.worked_by_me)}
                />
              ))
            )}
          </div>
        )}

        {/* CREW */}
        {tab === 'crew' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="inline-flex items-center gap-1 font-semibold text-gray-700">
                <Users size={15} strokeWidth={2} /> {summary?.total ?? 0} {summary?.total === 1 ? 'climber' : 'climbers'}
              </span>
              {summary && summary.flashed > 0 && (
                <><span className="text-gray-400">·</span><span className="text-amber-600">{summary.flashed} flash{summary.flashed === 1 ? '' : 'es'}</span></>
              )}
              <span className="text-gray-400">·</span>
              <span className={left >= 0 ? 'text-sage-700 font-medium' : 'text-gray-400'}>
                {left >= 0 ? `${left} days left` : 'Stripped'}
              </span>
            </div>

            <div className="space-y-2">
              {members.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No one on this boulder yet.</p>
              ) : (
                members.map(m => (
                  <div key={m.user_id} className="flex items-center gap-3 p-3 border rounded-xl">
                    {m.avatar_url
                      ? <img src={m.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                      : <div className="w-9 h-9 rounded-full bg-gray-200 grid place-items-center text-sm font-semibold text-gray-500">
                          {(m.username ?? '?').slice(0, 1).toUpperCase()}
                        </div>}
                    <div className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-gray-800 truncate">{m.username ?? 'Someone'}</span>
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {(titles[m.user_id] ?? []).map(t => <CrewTitleBadge key={t} title={t} />)}
                      </span>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATE_CLASS[m.state]}`}>
                      {STATE_LABEL[m.state]}
                    </span>
                  </div>
                ))
              )}
            </div>

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

            {boulder.gym && leaderboard.length > 0 && (
              <div className="pt-2">
                <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-800 mb-2">
                  <Trophy size={15} strokeWidth={2} className="text-amber-500" />
                  {new Date(`${month}-01T00:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} leaderboard
                  <span className="font-normal text-gray-400">· {boulder.gym}</span>
                </h2>
                <div className="space-y-1">
                  {leaderboard.slice(0, 5).map(entry => (
                    <div key={entry.user_id}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm ${
                        entry.user_id === user?.id ? 'bg-sage-50 border border-sage-200' : 'bg-gray-50'
                      }`}>
                      <span className="w-5 text-center font-bold text-gray-400">{entry.rank}</span>
                      <span className="flex-1 font-medium text-gray-800 truncate">{entry.username ?? 'Someone'}</span>
                      <span className="font-semibold text-sage-700">{entry.points}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* BANTER */}
        {tab === 'banter' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Pile on — react to this boulder.</p>
            <div className="flex flex-wrap gap-2">
              {digTally.map(d => (
                <button key={d.emoji} type="button" onClick={() => toggleDig(d.emoji, d.mine)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    d.mine ? 'bg-sage-100 text-sage-800 ring-1 ring-sage-300' : 'bg-gray-100 text-gray-600'
                  }`}>
                  <span className="text-base" aria-hidden>{d.emoji}</span>
                  {d.count > 0 && <span>{d.count}</span>}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400">Text banter is coming soon — for now, let the emojis do the talking.</p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: tsc clean (no unused imports); lint ≤17; build succeeds.

- [ ] **Step 3: Manual sanity (note in report)**

Read the diff and confirm: Beta tab is default; composer posts; BetaCard list renders with the top card highlighted when it has worked marks; Crew tab preserves members/strip/leaderboard and adds title badges; Banter tab toggles emoji digs. (No runtime harness; this is a code-level check.)

- [ ] **Step 4: Commit**

```bash
git add src/pages/CrewPage.tsx
git commit -m "feat: boulder page — Beta thread (worked-for) / Crew (titles) / Banter (digs)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- Hero: photo/video + name + grade chip + colour + gym + send-rate → Task 2 hero ✓
- Beta tab: ranked thread (sorted in hook), `best` top card, composer, worked-for toggle → Task 2 ✓
- Crew tab: members + playful titles (CrewTitleBadge via crewTitles) + leaderboard + strip preserved → Task 2 ✓
- Banter tab: emoji digs via gym_problem_reactions → Task 2 ✓; text banter explicitly deferred (Global Constraints) ✓
- Author display on beta → Task 1 enrichment ✓
- Worked-for credits author once → handled in the Plan 1 RPC; UI just calls mark/unmark ✓

**2. Placeholder scan:** No TBD/TODO; full file provided. "Text banter coming soon" is a real user-facing empty-state line, not a code placeholder.

**3. Type consistency:** `useCrew` now returns `problems: CrewProblemRow[]`, consumed by `crewTitles` (which needs user_id/sent/attempts/created_at — all on CrewProblemRow). `useBoulderBetas` returns `BoulderBeta & { authorName, authorAvatarUrl }`, consumed by `BetaCard` (`authorName`/`authorAvatarUrl`/`beta`/`best`/`onToggleWorked`). Reaction mutations take `{ gymProblemId, emoji }`; beta mutations `{ betaId, gymProblemId }` / `{ gymProblemId, body, videoUrl }` — matching Plan 1 hook signatures.

**4. Lint safety:** No `_`-prefixed/discarded bindings. The rewrite drops no longer-needed nothing (all imported icons — ArrowLeft, Users, Trophy, Play, Send — are used; `Chip`/`HoldDot`/`BetaCard`/`CrewTitleBadge` all used). `summary?.total === 1` guards pluralization.

## Open questions for implementation
- **Back link target** — hero back arrow points to `/dashboard`; if the user came from the feed (Plan 4) that's still a reasonable home. Could switch to `navigate(-1)` later; not needed now.
