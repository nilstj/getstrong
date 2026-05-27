# GetStrong — Bouldering Training App Design

**Date:** 2026-05-27
**Status:** Approved

## Overview

GetStrong is a mobile-first SPA for logging and tracking bouldering training. Users authenticate, log training sessions containing boulder problems and exercises, view progress charts on a dashboard, and challenge friends to attempt their problems.

Accessible on iPhone and Android via any mobile browser. No app store distribution. Online-only (no offline support).

Built in two phases:
- **Phase 1** — Core training log: auth, session/problem/exercise logging, dashboard
- **Phase 2** — Social layer: follows, challenges, comments, push notifications

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
  ├── Realtime                — live updates for challenge feed and notifications (Phase 2)
  ├── Edge Functions          — push notification dispatch (Phase 2)
  └── Row Level Security      — each user sees only their own data
```

The SPA is deployed as a static site (Vercel or Netlify free tier). Supabase handles all backend concerns — no custom server.

Auth flow: unauthenticated users are restricted to `/login`. All other routes are protected. Supabase's JS client manages the JWT and handles token refresh automatically.

---

## Data Model

All tables use Row Level Security policies. `user_id` on each row references `auth.users.id`.

### Phase 1 Tables

#### `sessions`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | references auth.users |
| date | date | training date |
| location | text | gym name, board name, or crag |
| duration_minutes | integer | nullable |
| notes | text | nullable |
| created_at | timestamptz | |

#### `problems`
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

Grade and color can both be set simultaneously (a gym problem can have both a color tag and a numeric grade).

#### `exercises`
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

#### `grade_mappings` (static lookup)
| Column | Type | Notes |
|---|---|---|
| v_scale | text | e.g. "V5" |
| font_equivalent | text | e.g. "7A" |

Seeded at deploy time, not user-editable. Used to convert grades in both directions for chart display.

---

### Phase 2 Tables

#### `follows`
| Column | Type | Notes |
|---|---|---|
| follower_id | uuid FK | the user who follows |
| following_id | uuid FK | the user being followed |
| created_at | timestamptz | |

Composite PK on `(follower_id, following_id)`. Follow model — no mutual acceptance required.

#### `challenges`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| challenger_id | uuid FK | user who issued the challenge |
| problem_id | uuid FK | nullable — references problems |
| exercise_id | uuid FK | nullable — references exercises |
| message | text | optional caption |
| created_at | timestamptz | |

Exactly one of `problem_id` or `exercise_id` is set. RLS: readable by the challenger and all followers of the challenger.

#### `challenge_attempts`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| challenge_id | uuid FK | references challenges |
| user_id | uuid FK | the user responding |
| problem_id | uuid FK | nullable — their logged response problem |
| exercise_id | uuid FK | nullable — their logged response exercise |
| created_at | timestamptz | |

Links a logged problem or exercise back to the challenge it was a response to.

#### `comments`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| challenge_id | uuid FK | references challenges |
| user_id | uuid FK | author |
| body | text | |
| created_at | timestamptz | |

#### `notifications`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | recipient |
| type | text | `new_challenge`, `new_comment`, `new_attempt` |
| reference_id | uuid | ID of the triggering challenge or comment |
| read | boolean | default false |
| created_at | timestamptz | |

---

## Routing

### Phase 1

| Route | Description |
|---|---|
| `/` | Redirect to `/dashboard` (authed) or `/login` |
| `/login` | Login and register tabs |
| `/dashboard` | Stats overview, charts, recent sessions |
| `/sessions` | Full session list, sorted newest-first |
| `/sessions/new` | Create a new session |
| `/sessions/:id` | Session detail — problems and exercises |
| `/sessions/:id/edit` | Edit session metadata |

Navigation: bottom tab bar — **Dashboard**, **Sessions**, **Log** (+).

### Phase 2 (added routes)

| Route | Description |
|---|---|
| `/feed` | Challenge feed from followed users |
| `/challenges/:id` | Challenge detail — description, comments, attempts |
| `/profile/:username` | User profile — their challenges, follow/unfollow button |
| `/notifications` | Notifications list |

Navigation: bottom tab bar expands to — **Dashboard**, **Sessions**, **Log** (+), **Feed**, **Notifications** (badge).

All routes except `/login` are protected.

---

## State Management

**TanStack Query** owns all server-synced state: sessions, problems, exercises, dashboard stats, challenge feed, comments.

**Zustand** owns active in-session UI state: the currently-open session ID and the live list of problems/exercises being added. On mutation success, TanStack Query cache is invalidated and Zustand stays in sync.

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
- Four stat cards: total sessions, total problems, total sends, send rate (sends ÷ problems × 100%)
- **Grade progression chart** (line): plots hardest sent grade per session. A toggle switches display between V-scale and Font scale; `grade_mappings` converts grades in both directions. Problems with only a color label are excluded. Filters to last 90 days.
- **Session frequency chart** (bar): sessions per week over last 90 days.
- Recent sessions list (last 5), linking to session detail.

### Sessions List
- Cards sorted newest-first.
- Each card: date, location, problem count, send rate badge.
- Tap to navigate to `/sessions/:id`.

### Challenge Flow (Phase 2)
1. From a problem or exercise detail, tap **Challenge** → opens a bottom sheet with an optional message field.
2. Submitting creates a `challenges` row and sends push notifications to all followers.
3. Followers see the challenge in `/feed`. Tapping opens `/challenges/:id`.
4. From the challenge detail, a follower can tap **Accept** to log their own attempt — this opens the standard problem or exercise form pre-filled with the challenge's grade/details. On submit, a `challenge_attempts` row is created linking back to the challenge.
5. Anyone who follows the challenger can comment on the challenge.

### Challenge Feed (Phase 2)
- List of challenges from followed users, sorted newest-first.
- Each card: challenger username, problem/exercise summary, send status, comment count.
- Tap to open challenge detail.

### Notifications (Phase 2)
- Bell icon in the tab bar with unread count badge.
- `/notifications` lists all notifications sorted newest-first, with read/unread state.
- Tapping a notification navigates to the relevant challenge.
- Push notifications via Web Push API. Supabase Edge Functions listen for new `challenges`, `comments`, and `challenge_attempts` rows and dispatch Web Push to the recipient's registered subscription.
- **iOS constraint:** Push notifications require the user to install the app to their home screen (iOS 16.4+ only). The app prompts iOS users to install to home screen on first login.

### User Profile (Phase 2)
- Displays username, follower count, following count.
- Lists the user's challenges.
- Follow/unfollow button (visible when viewing another user's profile).
- Users are discoverable by username via a search input in the Feed tab.

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
- Phase 2 adds `VITE_VAPID_PUBLIC_KEY` for Web Push.
- No CI/CD pipeline in the initial build — manual deploy via `vercel` or `netlify` CLI.
