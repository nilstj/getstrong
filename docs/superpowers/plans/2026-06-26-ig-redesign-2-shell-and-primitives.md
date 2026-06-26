# IG Redesign — Plan 2: Shell + Reusable Primitives

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reusable presentational primitives the boulder page (Plan 3) and home feed (Plan 4) consume, and restructure the app shell to the approved Instagram-style navigation.

**Architecture:** Six small, presentational, prop-driven components (no data fetching — they take typed props and callbacks; the consuming pages wire data). Plus a `/crews` index page reusing the existing `CrewsSection`, and a restyled `BottomNav` (Home · Sessions · ＋ · Crews · Profile) with a `lg:` left sidebar. Styling uses the existing Tailwind `sage`/`khaki` tokens; visuals match the approved mockup.

**Tech Stack:** React 18 + TypeScript + Vite, Tailwind (`sage`/`khaki`), `lucide-react`, `react-router-dom`. Types/helpers from Plan 1 (`BoulderBeta`, `FeedEvent`, `CrewTitle`, `CREW_TITLE_META`). Spec: `docs/superpowers/specs/2026-06-26-ig-redesign-foundation-and-hero-screens-design.md`.

## Global Constraints

- Components are **presentational**: typed props + callbacks, no hooks/data fetching (so they're reusable and build-verifiable in isolation). Data wiring happens in Plans 3 & 4.
- Reuse existing tokens/idioms: accent `sage-700`/`sage-800`, the chip/overlay look already on boulder tiles. Match the approved mockup (light feed + boulder page).
- Components are flat in `src/components/` (repo convention — no new `ui/` folder).
- ESLint baseline **17**, introduce **0 new**. `noUnusedLocals`/`noUnusedParameters` ON; `@typescript-eslint/no-unused-vars` has no `^_` ignore — every binding must be used (placeholder positional `_` before a used arg is the only allowed unused form).
- `react-hooks` plugin active — no new warnings. Keyboard focus visible; `alt=""` on decorative images.
- Verification gate per task: `npx tsc -b` clean + `npm run lint` ≤17 + `npm run build` succeeds. No new unit tests (presentational components are build-verified per repo convention).
- A component is **unused-by-design** until Plans 3/4 import it — that is expected, not a defect (an un-imported export does not trip `noUnusedLocals`).

---

### Task 1: Display atoms — `Chip`, `HoldDot`, `CrewTitleBadge`, `StoryRing`

**Files:**
- Create: `src/components/Chip.tsx`
- Create: `src/components/CrewTitleBadge.tsx`
- Create: `src/components/StoryRing.tsx`

**Interfaces:**
- Produces: `Chip({ label, variant?, className? })` (`variant: 'grade' | 'gym' | 'neutral'`), `HoldDot({ color, size? })`, `CrewTitleBadge({ title })`, `StoryRing({ label, imageUrl?, active?, onClick? })`.

- [ ] **Step 1: Create `Chip.tsx` (Chip + HoldDot)**

```tsx
type ChipVariant = 'grade' | 'gym' | 'neutral'

export function Chip({
  label,
  variant = 'neutral',
  className = '',
}: {
  label: string
  variant?: ChipVariant
  className?: string
}) {
  const styles: Record<ChipVariant, string> = {
    grade: 'bg-sage-700 text-white',
    gym: 'bg-white/85 text-gray-800 backdrop-blur-sm',
    neutral: 'bg-black/55 text-white backdrop-blur-sm',
  }
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold tracking-tight ${styles[variant]} ${className}`}>
      {label}
    </span>
  )
}

export function HoldDot({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-block rounded-full border-2 border-white/85 flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: color }}
      title={color}
    />
  )
}
```

- [ ] **Step 2: Create `CrewTitleBadge.tsx`**

```tsx
import { CREW_TITLE_META } from '../utils/crewTitles'
import type { CrewTitle } from '../types'

export function CrewTitleBadge({ title }: { title: CrewTitle }) {
  const meta = CREW_TITLE_META[title]
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sage-50 border border-sage-200 px-2 py-0.5 text-[11px] font-semibold text-sage-800">
      <span aria-hidden>{meta.emoji}</span> {meta.label}
    </span>
  )
}
```

- [ ] **Step 3: Create `StoryRing.tsx`**

```tsx
export function StoryRing({
  label,
  imageUrl,
  active = true,
  onClick,
}: {
  label: string
  imageUrl?: string | null
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 w-16 flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 rounded-xl"
    >
      <span
        className={`w-14 h-14 rounded-full p-[2.5px] ${
          active
            ? 'bg-gradient-to-tr from-sage-600 via-khaki-400 to-sage-400'
            : 'bg-gray-300'
        }`}
      >
        <span className="block w-full h-full rounded-full border-2 border-white bg-sage-100 bg-cover bg-center"
          style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined} />
      </span>
      <span className="text-[10px] text-gray-600 truncate max-w-[60px]">{label}</span>
    </button>
  )
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc -b && npm run lint`
Expected: tsc clean; lint ≤17.

- [ ] **Step 5: Commit**

```bash
git add src/components/Chip.tsx src/components/CrewTitleBadge.tsx src/components/StoryRing.tsx
git commit -m "feat: redesign display atoms — Chip, HoldDot, CrewTitleBadge, StoryRing

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `ReactionDigBar`

The action row used on feed cards and the boulder page: like, comment/beta, and a `+ dig` emoji quick-picker, plus save. Presentational — counts in, callbacks out.

**Files:**
- Create: `src/components/ReactionDigBar.tsx`

**Interfaces:**
- Produces: `ReactionDigBar({ likeCount, liked, onLike, commentCount, commentLabel?, onComment, digReactions, onDig, onSave?, saved? })` where `digReactions: { emoji: string; count: number; mine: boolean }[]` and `onDig(emoji: string) => void`.

- [ ] **Step 1: Create `ReactionDigBar.tsx`**

```tsx
import { useState } from 'react'
import { Heart, MessageCircle, Bookmark } from 'lucide-react'

const DIG_EMOJIS = ['🔥', '💪', '😂', '🐒', '🪨']

export function ReactionDigBar({
  likeCount,
  liked,
  onLike,
  commentCount,
  commentLabel = 'Beta',
  onComment,
  digReactions,
  onDig,
  onSave,
  saved = false,
}: {
  likeCount: number
  liked: boolean
  onLike: () => void
  commentCount: number
  commentLabel?: string
  onComment: () => void
  digReactions: { emoji: string; count: number; mine: boolean }[]
  onDig: (emoji: string) => void
  onSave?: () => void
  saved?: boolean
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  return (
    <div className="flex items-center gap-4 text-sm font-semibold text-gray-700">
      <button type="button" onClick={onLike}
        className={`inline-flex items-center gap-1 ${liked ? 'text-sage-700' : ''}`}>
        <Heart size={18} strokeWidth={2} fill={liked ? 'currentColor' : 'none'} />
        {likeCount > 0 && <span>{likeCount}</span>}
      </button>

      <button type="button" onClick={onComment} className="inline-flex items-center gap-1">
        <MessageCircle size={18} strokeWidth={2} />
        <span>{commentLabel}{commentCount > 0 ? ` ${commentCount}` : ''}</span>
      </button>

      <div className="relative">
        <button type="button" onClick={() => setPickerOpen(o => !o)}
          className="inline-flex items-center gap-1 text-gray-600">
          <span aria-hidden>🐒</span> dig
        </button>
        {pickerOpen && (
          <div className="absolute z-10 bottom-7 left-0 flex gap-1 rounded-full bg-white shadow-lg border border-gray-200 px-2 py-1">
            {DIG_EMOJIS.map(e => (
              <button key={e} type="button"
                onClick={() => { onDig(e); setPickerOpen(false) }}
                className="text-lg hover:scale-125 transition-transform">{e}</button>
            ))}
          </div>
        )}
      </div>

      {digReactions.filter(r => r.count > 0).map(r => (
        <button key={r.emoji} type="button" onClick={() => onDig(r.emoji)}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
            r.mine ? 'bg-sage-100 text-sage-800' : 'bg-gray-100 text-gray-600'
          }`}>
          <span aria-hidden>{r.emoji}</span> {r.count}
        </button>
      ))}

      <span className="flex-1" />
      {onSave && (
        <button type="button" onClick={onSave} className={saved ? 'text-sage-700' : 'text-gray-500'}>
          <Bookmark size={18} strokeWidth={2} fill={saved ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc -b && npm run lint`
Expected: tsc clean; lint ≤17.

- [ ] **Step 3: Commit**

```bash
git add src/components/ReactionDigBar.tsx
git commit -m "feat: ReactionDigBar — like / beta / dig-emoji / save action row

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `BetaCard`

A single ranked beta in the boulder page's beta thread: optional video thumb, the tip, author + "✓ worked for N", a worked-for-me toggle, and a `best` highlight for the top-ranked beta.

**Files:**
- Create: `src/components/BetaCard.tsx`

**Interfaces:**
- Consumes: `BoulderBeta` (Plan 1).
- Produces: `BetaCard({ beta, authorName, authorAvatarUrl?, helpedLabel?, onToggleWorked, best? })`.

- [ ] **Step 1: Create `BetaCard.tsx`**

```tsx
import { Play, Check } from 'lucide-react'
import type { BoulderBeta } from '../types'

export function BetaCard({
  beta,
  authorName,
  authorAvatarUrl,
  helpedLabel,
  onToggleWorked,
  best = false,
}: {
  beta: BoulderBeta
  authorName: string
  authorAvatarUrl?: string | null
  helpedLabel?: string
  onToggleWorked: () => void
  best?: boolean
}) {
  return (
    <div className={`flex gap-3 rounded-2xl bg-white p-3 border ${
      best ? 'border-sage-500 ring-1 ring-sage-500' : 'border-gray-200'
    }`}>
      {beta.video_url ? (
        <a href={beta.video_url} target="_blank" rel="noopener noreferrer"
          className="relative w-12 h-12 rounded-xl bg-gray-800 flex-shrink-0 grid place-items-center">
          <Play size={18} className="text-white" fill="currentColor" />
        </a>
      ) : (
        <span className="w-12 h-12 rounded-xl bg-cover bg-center bg-sage-100 flex-shrink-0"
          style={authorAvatarUrl ? { backgroundImage: `url(${authorAvatarUrl})` } : undefined} />
      )}

      <div className="min-w-0 flex-1">
        {beta.body && <p className="text-sm font-medium leading-snug text-gray-800">{beta.body}</p>}
        <p className="mt-1 text-xs text-gray-500">
          {authorName}
          {beta.worked_count > 0 && (
            <span className="text-sage-700 font-semibold"> · ✓ worked for {beta.worked_count}</span>
          )}
          {helpedLabel && <span className="text-gray-400"> · {helpedLabel}</span>}
        </p>
      </div>

      <button type="button" onClick={onToggleWorked}
        className={`self-start inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
          beta.worked_by_me
            ? 'bg-sage-700 text-white'
            : 'bg-sage-50 text-sage-800 border border-sage-200'
        }`}>
        <Check size={13} strokeWidth={3} /> {beta.worked_by_me ? 'Worked' : 'Worked?'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc -b && npm run lint`
Expected: tsc clean; lint ≤17.

- [ ] **Step 3: Commit**

```bash
git add src/components/BetaCard.tsx
git commit -m "feat: BetaCard — ranked beta with worked-for-N + worked toggle

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `FeedCard`

A single home-feed event. Renders a header line per `event_type`, the boulder media with grade/colour overlay, a caption, and a `ReactionDigBar` slot (passed as `children` so the page wires reactions).

**Files:**
- Create: `src/components/FeedCard.tsx`

**Interfaces:**
- Consumes: `FeedEvent` (Plan 1), `Chip`/`HoldDot` (Task 1).
- Produces: `FeedCard({ event, actorName, actorAvatarUrl?, onOpen, children? })`. `children` is the action bar.

- [ ] **Step 1: Create `FeedCard.tsx`**

```tsx
import type { ReactNode } from 'react'
import { Play } from 'lucide-react'
import { Chip, HoldDot } from './Chip'
import type { FeedEvent, FeedEventType } from '../types'

const VERB: Record<FeedEventType, string> = {
  boulder_new: 'put up a boulder',
  send: 'sent',
  beta_added: 'shared beta on',
  beta_worked: 'nailed the beta on',
}

export function FeedCard({
  event,
  actorName,
  actorAvatarUrl,
  onOpen,
  children,
}: {
  event: FeedEvent
  actorName: string
  actorAvatarUrl?: string | null
  onOpen: () => void
  children?: ReactNode
}) {
  const title = event.boulder_name || 'a boulder'
  return (
    <article className="bg-white rounded-2xl overflow-hidden border border-gray-100">
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <span className="w-8 h-8 rounded-full bg-cover bg-center bg-sage-100 flex-shrink-0"
          style={actorAvatarUrl ? { backgroundImage: `url(${actorAvatarUrl})` } : undefined} />
        <div className="min-w-0 text-sm leading-tight">
          <span className="font-semibold">{actorName}</span>{' '}
          <span className="text-gray-500">{VERB[event.event_type]}</span>{' '}
          <span className="font-semibold">{title}</span>
          <div className="text-[11px] text-gray-400">
            {[event.boulder_grade, event.gym].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      <button type="button" onClick={onOpen}
        className="block w-full relative aspect-[4/3] bg-gradient-to-br from-sage-700 to-sage-900 focus:outline-none">
        {event.boulder_image_url && (
          <img src={event.boulder_image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        {event.beta_video_url && !event.boulder_image_url && (
          <span className="absolute inset-0 grid place-items-center">
            <Play size={40} className="text-white/90" fill="currentColor" />
          </span>
        )}
        <span className="absolute left-2.5 bottom-2.5 flex items-center gap-2">
          {event.boulder_grade && <Chip label={event.boulder_grade} variant="grade" />}
          {event.boulder_color && <HoldDot color={event.boulder_color} />}
        </span>
      </button>

      <div className="px-3.5 pt-2.5 pb-1">{children}</div>

      {event.beta_snippet && (
        <p className="px-3.5 pb-3 text-sm text-gray-700 leading-snug">
          <span className="font-medium">“{event.beta_snippet}”</span>
        </p>
      )}
    </article>
  )
}
```

Note: `event.boulder_color` is free text (e.g. "Red"/"Blue") in this data; `HoldDot` passes it as a CSS color — named CSS colours render, unknown strings fall back to transparent. Acceptable for v1 (the spec flagged name→swatch mapping as a later refinement).

- [ ] **Step 2: Verify**

Run: `npx tsc -b && npm run lint`
Expected: tsc clean; lint ≤17.

- [ ] **Step 3: Commit**

```bash
git add src/components/FeedCard.tsx
git commit -m "feat: FeedCard — one home-feed event (header, media, caption, action slot)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `CrewsPage` + route

A real destination for the new Crews tab, reusing the existing `CrewsSection` so this plan ships a working tab without new data work.

**Files:**
- Create: `src/pages/CrewsPage.tsx`
- Modify: `src/App.tsx` (add the route)

**Interfaces:**
- Consumes: existing `CrewsSection` (`src/components/CrewsSection.tsx`).
- Produces: route `/crews` rendering `CrewsPage`.

- [ ] **Step 1: Confirm `CrewsSection`'s usage**

Open `src/components/CrewsSection.tsx`; confirm it renders self-contained (fetches its own data; takes no required props) the way it does inside `DashboardPage`. If it requires props, pass the same ones `DashboardPage` passes.

- [ ] **Step 2: Create `CrewsPage.tsx`**

```tsx
import { CrewsSection } from '../components/CrewsSection'

export function CrewsPage() {
  return (
    <div className="p-4 pb-32 space-y-4">
      <h1 className="text-xl font-bold">Crews</h1>
      <p className="text-sm text-gray-500">Shared boulders from your gyms — jump in, add beta, compare points.</p>
      <CrewsSection />
    </div>
  )
}
```

(If `CrewsSection` needs props per Step 1, add them here matching `DashboardPage`.)

- [ ] **Step 3: Add the route in `src/App.tsx`**

Add the import alongside the other page imports and a route inside the protected `<Route element={<ProtectedRoute />}>` block, next to the other top-level routes:

```tsx
import { CrewsPage } from './pages/CrewsPage'
```
```tsx
              <Route path="/crews" element={<CrewsPage />} />
```

- [ ] **Step 4: Verify**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: tsc clean; lint ≤17; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/pages/CrewsPage.tsx src/App.tsx
git commit -m "feat: /crews page (reuses CrewsSection) — destination for the Crews tab

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Shell — restyle `BottomNav` (5 tabs) + `lg:` sidebar

Restructure the bottom bar to the approved 5 tabs (**Home · Sessions · ＋ · Crews · Profile**) and add a desktop left sidebar (shown at `lg`, where the bottom bar hides). Analysis & Help leave the bar but stay routable and appear in the sidebar.

**Files:**
- Modify: `src/components/BottomNav.tsx`
- Create: `src/components/SideNav.tsx`
- Modify: the layout that renders `BottomNav` (find it: `grep -rn "<BottomNav" src/` — likely `src/App.tsx` or a layout component). Render `SideNav` there too.

**Interfaces:**
- Produces: `BottomNav` with five items; `SideNav` (desktop) with the full nav incl. Sessions, Crews, Analysis, Help, Profile.

- [ ] **Step 1: Find where `BottomNav` is rendered + how content is wrapped**

Run: `grep -rn "BottomNav\|AppBar\|max-w-\|<main\|pb-" src/App.tsx src/components/*.tsx | head -30`
Note the wrapper element and current padding so the sidebar can offset content at `lg` (e.g. add `lg:pl-56`) without breaking mobile.

- [ ] **Step 2: Restyle `BottomNav` to the five tabs**

Replace the nav items in `src/components/BottomNav.tsx` so the bar is exactly: Home (`/dashboard`, `Home` icon), Sessions (`/sessions`, `CalendarDays`), the center ＋ (unchanged, `/sessions/new`), Crews (`/crews`, `Users` icon, keep the existing follow-request red dot if present), Profile (`/profile`, `User`, keep its badge dot). Remove the Challenges, Help, and Analysis items from the bar. Keep the `NavLink` active-state styling pattern already in the file. Hide the whole bar at `lg`: add `lg:hidden` to the `<nav>`. Keep `Trophy`/`LifeBuoy`/`BarChart2` out of imports if now unused (unused imports fail `tsc -b`). Use `Home` and `Users` from `lucide-react`.

The challenge/follow-request badge dots currently sit on Challenges/Profile — move the received-challenges dot off (Challenges is no longer in the bar) and keep the follow-request dot on Profile.

- [ ] **Step 3: Create `SideNav.tsx` (desktop)**

```tsx
import { NavLink } from 'react-router-dom'
import { Home, CalendarDays, Users, User, BarChart2, LifeBuoy, Trophy, Plus } from 'lucide-react'

const ITEMS = [
  { to: '/dashboard', label: 'Home', Icon: Home },
  { to: '/sessions', label: 'Sessions', Icon: CalendarDays },
  { to: '/crews', label: 'Crews', Icon: Users },
  { to: '/challenges', label: 'Challenges', Icon: Trophy },
  { to: '/analysis', label: 'Analysis', Icon: BarChart2 },
  { to: '/help', label: 'Help', Icon: LifeBuoy },
  { to: '/profile', label: 'Profile', Icon: User },
]

export function SideNav() {
  return (
    <aside className="hidden lg:flex fixed top-0 left-0 bottom-0 w-56 flex-col gap-1 border-r border-gray-200 bg-[#f7f5f0] px-3 py-5 z-40">
      <div className="px-3 pb-4 text-lg font-black tracking-tight text-sage-800">GetStrong</div>
      {ITEMS.map(({ to, label, Icon }) => (
        <NavLink key={to} to={to}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive ? 'bg-sage-100 text-sage-800' : 'text-gray-600 hover:bg-gray-100'
            }`
          }>
          <Icon size={20} strokeWidth={1.9} /> {label}
        </NavLink>
      ))}
      <NavLink to="/sessions/new"
        className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-sage-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-sage-800">
        <Plus size={18} strokeWidth={2.5} /> Log session
      </NavLink>
    </aside>
  )
}
```

- [ ] **Step 4: Render `SideNav` and offset content at `lg`**

In the layout found in Step 1, render `<SideNav />` alongside `<BottomNav />`, and add `lg:pl-56` to the content wrapper (and, if the `AppBar` is a fixed top bar, add `lg:hidden` to it so the desktop uses the sidebar logo instead — only if that reads cleanly; otherwise leave `AppBar` and just offset). Keep all mobile classes intact.

- [ ] **Step 5: Verify**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: tsc clean (no unused icon imports); lint ≤17; build succeeds.

- [ ] **Step 6: Manual sanity (note in report)**

Confirm by reading the diff: mobile bar shows 5 items; `lg:hidden` on the bar; `SideNav` is `hidden lg:flex`; content offset only at `lg`. (No runtime test harness for layout.)

- [ ] **Step 7: Commit**

```bash
git add src/components/BottomNav.tsx src/components/SideNav.tsx src/App.tsx
git commit -m "feat: shell — 5-tab BottomNav (Home/Sessions/+/Crews/Profile) + desktop SideNav

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- Primitives `Chip`/`HoldDot`/`StoryRing`/`ReactionDigBar`/`FeedCard`/`BetaCard`/`CrewTitleBadge` → Tasks 1–4 ✓
- Shell: 5 tabs Home·Sessions·＋·Crews·Profile, Analysis/Help off the bar, web sidebar → Task 6 ✓
- Crews tab has a real destination → Task 5 ✓
- Reuses sage/khaki tokens + mockup look → all component tasks ✓

**2. Placeholder scan:** No TBD/TODO; every component has complete JSX. Two steps say "if CrewsSection needs props, match DashboardPage" / "find the layout" — these are concrete investigative steps with a named fallback, not placeholders.

**3. Type consistency:** `BetaCard` consumes `BoulderBeta` (worked_count/worked_by_me/video_url/body) exactly as defined in Plan 1. `FeedCard` consumes `FeedEvent`/`FeedEventType` field names from Plan 1. `CrewTitleBadge` uses `CrewTitle` + `CREW_TITLE_META` from `src/utils/crewTitles`. `Chip`/`HoldDot` are imported by `FeedCard` from `./Chip`.

**4. Lint safety:** No discarded/`_`-prefixed bindings. Task 6 explicitly calls out removing now-unused lucide imports (`Trophy`/`LifeBuoy`/`BarChart2` from BottomNav) so `noUnusedLocals` stays green. `ReactionDigBar`'s `useState` is used.

## Open questions for implementation
- **AppBar on desktop** — whether to hide it at `lg` (sidebar carries the logo) or keep it for notifications. Default: keep `AppBar` (notifications live there); only offset content. Decide in Task 6 by what reads cleanly.
