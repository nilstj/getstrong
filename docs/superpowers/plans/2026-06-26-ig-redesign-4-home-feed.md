# IG Redesign — Plan 4: Home Feed

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Home dashboard with the Instagram-style vertical feed — a stories strip of your gyms over a crew beta/activity feed, each card opening the boulder page.

**Architecture:** Enrich `useCrewFeed` with actor profiles, then rewrite `DashboardPage` (route `/dashboard`, unchanged) to render a `StoryRing` strip (from `useMySessionLocations`) + a `FeedCard` list paged via `useCrewFeed`. **Per the user's decision (2026-06-26), the feed fully replaces the old dashboard** — on-wall announcements, friends' weekly activity, and hype are removed from Home (the Crews section already lives at `/crews`).

**Tech Stack:** React 18 + TS + Vite + Tailwind, `@tanstack/react-query` (infinite query), `react-router-dom`, `lucide-react`. Consumes Plan 1 `useCrewFeed` + Plan 2 `FeedCard`/`StoryRing`. Spec: `docs/superpowers/specs/2026-06-26-ig-redesign-foundation-and-hero-screens-design.md`.

## Global Constraints

- Home = feed only. Dropping the dashboard widgets is intended (user decision). Other pages keep their own behavior; only `DashboardPage` is rewritten. The now-unused dashboard hooks (on-wall, hype, friends-activity) stay in the repo (unused exports don't fail the build) — do not delete them.
- Feed cards route engagement to the boulder page (Plan 3 Beta/Banter). **No inline per-card reactions in v1** — fetching reactions per feed card would be an N+1 against the infinite feed, and there is no `like`/`save` backing table. The card's media + footer link open the boulder, where digs/beta live.
- ESLint baseline **17**, introduce **0 new**. `noUnusedLocals`/`noUnusedParameters` ON; no `^_` ignore. Remove imports the rewrite no longer uses (the old DashboardPage imported many — the new file imports only what it needs).
- Verification gate per task: `npx tsc -b` clean + `npm run lint` ≤17 + `npm run build` succeeds. No new unit tests (page/hook wiring is build-verified).
- **Release gate:** the feed calls `get_crew_feed` — migrations 052–055 must be applied before this deploys.

---

### Task 1: Enrich `useCrewFeed` with actor profiles

`FeedCard` needs `actorName`/`actorAvatarUrl`; the RPC returns only `actor_id`. Attach profiles per page (same pattern as `useBoulderBetas`).

**Files:**
- Modify: `src/hooks/useCrewFeed.ts`

**Interfaces:**
- Produces: `FeedEventEnriched = FeedEvent & { actorName: string | null; actorAvatarUrl: string | null }`; `useCrewFeed()` pages are `FeedEventEnriched[]`.

- [ ] **Step 1: Replace `useCrewFeed.ts`**

```ts
import { useInfiniteQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { FeedEvent } from '../types'

const PAGE = 20

export type FeedEventEnriched = FeedEvent & {
  actorName: string | null
  actorAvatarUrl: string | null
}

export function useCrewFeed() {
  return useInfiniteQuery({
    queryKey: ['crew_feed'],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<FeedEventEnriched[]> => {
      const { data, error } = await supabase.rpc('get_crew_feed', {
        p_limit: PAGE,
        p_before: pageParam,
      })
      if (error) throw error
      const events = (data ?? []) as FeedEvent[]
      const actorIds = Array.from(new Set(events.map(e => e.actor_id)))
      const profileById = new Map<string, { username: string | null; avatar_url: string | null }>()
      if (actorIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', actorIds)
        for (const p of profs ?? []) {
          profileById.set(p.id as string, { username: p.username as string | null, avatar_url: p.avatar_url as string | null })
        }
      }
      return events.map(e => ({
        ...e,
        actorName: profileById.get(e.actor_id)?.username ?? null,
        actorAvatarUrl: profileById.get(e.actor_id)?.avatar_url ?? null,
      }))
    },
    getNextPageParam: last =>
      last.length === PAGE ? last[last.length - 1].event_at : undefined,
  })
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: tsc clean; lint ≤17; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCrewFeed.ts
git commit -m "feat: enrich crew feed events with actor profiles

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Rewrite `DashboardPage` as the feed

**Files:**
- Modify (full rewrite): `src/pages/DashboardPage.tsx`

**Interfaces:**
- Consumes: `useCrewFeed` (Task 1), `useMySessionLocations` (existing — returns `string[]` of your gyms/locations, newest first), `FeedCard` + `StoryRing` (Plan 2).

- [ ] **Step 1: Replace the file**

Replace the entire contents of `src/pages/DashboardPage.tsx` with:

```tsx
import { useNavigate } from 'react-router-dom'
import { useCrewFeed } from '../hooks/useCrewFeed'
import { useMySessionLocations } from '../hooks/useSessions'
import { FeedCard } from '../components/FeedCard'
import { StoryRing } from '../components/StoryRing'

export function DashboardPage() {
  const navigate = useNavigate()
  const { data: gyms = [] } = useMySessionLocations()
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useCrewFeed()
  const events = data?.pages.flat() ?? []

  return (
    <div className="pb-32 lg:max-w-2xl lg:mx-auto">
      {gyms.length > 0 && (
        <div className="flex gap-3 overflow-x-auto px-4 py-3 border-b border-gray-100">
          {gyms.slice(0, 12).map(g => (
            <StoryRing key={g} label={g} onClick={() => navigate('/crews')} />
          ))}
        </div>
      )}

      <div className="px-4 py-4 space-y-3">
        {isLoading ? (
          <p className="py-10 text-center text-sm text-gray-400">Loading your crew feed…</p>
        ) : events.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-500">No crew activity yet.</p>
            <p className="mt-1 text-xs text-gray-400">
              Log a problem at a gym or publish a boulder to start your feed.
            </p>
          </div>
        ) : (
          <>
            {events.map((e, i) => (
              <FeedCard
                key={`${e.event_type}-${e.gym_problem_id}-${e.event_at}-${i}`}
                event={e}
                actorName={e.actorName ?? 'Someone'}
                actorAvatarUrl={e.actorAvatarUrl}
                onOpen={() => navigate(`/gym-problems/${e.gym_problem_id}`)}
              >
                <button type="button" onClick={() => navigate(`/gym-problems/${e.gym_problem_id}`)}
                  className="text-sm font-semibold text-sage-700">
                  💬 Beta &amp; banter →
                </button>
              </FeedCard>
            ))}
            {hasNextPage && (
              <button type="button" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}
                className="w-full py-3 text-sm font-medium text-sage-700 disabled:opacity-50">
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

Note: this drops every previous dashboard import. Because the old file imported a large set of hooks/components, deleting its body removes all those usages at once — `tsc -b` will pass only if NO leftover references remain. Replace the whole file (do not merge) so there are no orphaned imports.

- [ ] **Step 2: Verify**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: tsc clean (no unused imports anywhere); lint ≤17; build succeeds.

- [ ] **Step 3: Manual sanity (note in report)**

Read the diff and confirm: stories strip renders one `StoryRing` per gym (→ `/crews`); the feed maps `useCrewFeed` pages to `FeedCard`s opening `/gym-problems/:id`; loading + empty states present; Load-more calls `fetchNextPage` when `hasNextPage`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat: Home becomes the crew beta/activity feed (stories + FeedCard list)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- Home replaced by vertical feed → Task 2 ✓ (per user decision: full replacement)
- Stories strip of gyms/crews → Task 2 (`StoryRing` from `useMySessionLocations`, → `/crews`) ✓
- Feed of crew beta/activity events, newest first, paged → Task 1 (`useCrewFeed` infinite) + Task 2 list + Load more ✓
- Each card opens the boulder page → Task 2 `onOpen`/footer → `/gym-problems/:id` ✓
- Actor name/avatar on cards → Task 1 enrichment ✓
- Empty state nudge → Task 2 ✓

**2. Placeholder scan:** No TBD/TODO; both files complete. The "no inline reactions in v1" is a documented scope decision, not a gap.

**3. Type consistency:** `useCrewFeed` returns pages of `FeedEventEnriched` (`FeedEvent` + `actorName`/`actorAvatarUrl`); `FeedCard` consumes `event: FeedEvent` (enriched is assignable) + `actorName`/`actorAvatarUrl` props. `getNextPageParam` reads `event_at` (present on FeedEvent). `useMySessionLocations` → `string[]` consumed by `StoryRing label`.

**4. Lint safety:** Full-file rewrite of DashboardPage removes all prior imports atomically (no orphans). New imports (`useNavigate`, `useCrewFeed`, `useMySessionLocations`, `FeedCard`, `StoryRing`) are all used. No `_`-prefixed bindings.

## Open questions for implementation
- **Stories destination** — every gym ring currently routes to `/crews` (the boulder index). A per-gym filter could come later; `/crews` is the correct v1 destination.
- **Dropped dashboard features** — on-wall/hype/friends-activity are intentionally gone from Home; if any deserve a new home (e.g., Profile), that's a later sub-project, not this plan.
