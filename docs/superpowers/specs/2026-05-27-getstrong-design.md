# GetStrong — Bouldering Training App Design

**Date:** 2026-05-27
**Status:** Approved

## Overview

GetStrong is a mobile-first SPA for logging and tracking bouldering training. Users authenticate, log training sessions containing boulder problems and exercises, and view progress charts on a dashboard.

Accessible on iPhone and Android via any mobile browser. No app store distribution. Online-only (no offline support).

---

## Architecture

```
Browser (React SPA)
  ├── React Router v6         — page routing
  ├── TanStack Query          — server state, caching, mutations
  ├── Zustand                 — in-session UI state (active session being built)
  ├── Recharts                — stats dashboard charts
  └── Tailwind CSS            — styling, mobile-first

Supabase (BaaS)
  ├── Auth                    — email/password login + JWT
  ├── PostgreSQL              — all persistent data
  └── Row Level Security      — each user sees only their own data
```

The SPA is deployed as a static site (Vercel or Netlify free tier). Supabase handles all backend concerns — no custom server.

Auth flow: unauthenticated users are restricted to `/login`. All other routes are protected. Supabase's JS client manages the JWT and handles token refresh automatically.

---

## Data Model

All tables use Row Level Security policies so users only access their own rows. `user_id` on each row references `auth.users.id`.

### `sessions`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | references auth.users |
| date | date | training date |
| location | text | gym name or crag |
| duration_minutes | integer | nullable |
| notes | text | nullable |
| created_at | timestamptz | |

### `problems`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| session_id | uuid FK | references sessions |
| user_id | uuid FK | references auth.users |
| grade_system | text | `v_scale`, `font`, or `color` |
| grade_value | text | e.g. "V5", "7A" — nullable if color-only |
| color | text | gym color label — nullable if grade-only |
| attempts | integer | |
| sent | boolean | default false |
| notes | text | nullable |
| created_at | timestamptz | |

Grade and color can both be set simultaneously (a gym problem can have both a color tag and a Font grade).

### `exercises`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| session_id | uuid FK | references sessions |
| user_id | uuid FK | references auth.users |
| name | text | e.g. "Hangboard — 20mm edge" |
| type | text | `reps` or `time` |
| sets | integer | nullable |
| reps | integer | nullable — used when type = reps |
| duration_seconds | integer | nullable — used when type = time |
| notes | text | nullable |
| created_at | timestamptz | |

### `grade_mappings` (static lookup)
| Column | Type | Notes |
|---|---|---|
| v_scale | text | e.g. "V5" |
| font_equivalent | text | e.g. "7A" |

Used by the dashboard to normalize V-grades to Font scale for trend charts. Seeded at deploy time, not user-editable.

---

## Routing

| Route | Description |
|---|---|
| `/` | Redirect to `/dashboard` (authed) or `/login` |
| `/login` | Login and register tabs |
| `/dashboard` | Stats overview, charts, recent sessions |
| `/sessions` | Full session list, sorted newest-first |
| `/sessions/new` | Create a new session |
| `/sessions/:id` | Session detail — problems and exercises |
| `/sessions/:id/edit` | Edit session metadata |

All routes except `/login` are protected. Unauthenticated access redirects to `/login`.

Navigation: bottom tab bar with three items — **Dashboard**, **Sessions**, and a **Log** (+) button that opens `/sessions/new`.

---

## State Management

**TanStack Query** owns all server-synced state: sessions list, session detail, problems, exercises, dashboard stats. Handles caching, background refetch, and mutation optimism.

**Zustand** owns active in-session UI state: the currently-open session ID and the live list of problems/exercises being added during a gym session. This keeps the "add problem" flow snappy without re-fetching on every tap. On mutation success, TanStack Query cache is invalidated and Zustand stays in sync.

---

## Key Components & Flows

### Auth
- `AuthProvider` context wraps the app; exposes `user` and `signOut`.
- Supabase `onAuthStateChange` drives the provider.
- Protected route wrapper redirects to `/login` if no user.

### Session Logging Flow
1. Tap **Log** → `/sessions/new` → fill in date, location, duration → submit.
2. Redirected to `/sessions/:id` (newly created session).
3. Floating "+" FAB opens a bottom sheet to add a problem or exercise.
4. Each item persists immediately to Supabase on form submit.

### Problem Form (bottom sheet)
- Grade system selector: **V**, **Font**, **Color**
- Grade input: dropdown for V-scale (V0–V17) or Font (3 to 9A), free text for color
- Optional gym color field (works alongside any grade system)
- Attempts counter (stepper)
- Sent toggle
- Optional notes

### Exercise Form (bottom sheet)
- Name text input
- Type toggle: **Reps** or **Time**
- Sets stepper
- Reps stepper (if Reps) or Duration input in seconds (if Time)
- Optional notes

### Dashboard
- Four stat cards: total sessions, total problems, total sends, send rate
- **Grade progression chart** (line): plots hardest sent grade per session, normalized to Font scale via `grade_mappings`. Filters to last 90 days.
- **Session frequency chart** (bar): sessions per week over last 90 days.
- Recent sessions list (last 5), linking to session detail.

### Sessions List
- Cards sorted newest-first.
- Each card: date, location, problem count, send rate badge.
- Tap to navigate to `/sessions/:id`.

---

## Error Handling

- TanStack Query retries failed requests up to 2 times before surfacing an error state.
- Failed mutations show a toast notification with a retry action.
- Auth token expiry or network errors on protected routes redirect to `/login` with an explanatory message.
- Client-side form validation covers required fields; Supabase constraints are the data-integrity backstop.

---

## Testing

- Vitest unit tests for pure logic: grade normalization (V ↔ Font), dashboard stat calculations (send rate, session frequency bucketing).
- No component tests or E2E in the initial build. Manual testing on a real iPhone and Android browser covers the critical paths.
- Tests are added as business logic grows in complexity.

---

## Deployment

- Static SPA deployed to Vercel or Netlify (free tier).
- Supabase project on the free tier.
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- No CI/CD pipeline in the initial build — manual deploy via `vercel` or `netlify` CLI.
