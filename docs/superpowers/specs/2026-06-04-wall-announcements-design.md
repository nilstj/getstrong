# Wall Announcements Design

**Date:** 2026-06-04  
**Status:** Approved

## Overview

Replace the profile-based "on the wall" feature with a dedicated `wall_announcements` table. Users can announce they are on the wall right now (live) or plan a future session at a specific gym or crag. Friends see both live and planned announcements in their feed and can respond — hype for live sessions, "I'll join" for planned ones. Announcements expire automatically.

---

## Data Model

### `wall_announcements`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid primary key` | `gen_random_uuid()` |
| `user_id` | `uuid not null` | references `auth.users(id) on delete cascade` |
| `location` | `text not null` | gym or crag name |
| `label` | `text null` | optional note ("projecting 7B+") |
| `starts_at` | `timestamptz not null` | now = live session, future = planned session |
| `created_at` | `timestamptz not null` | `default now()` |

One active announcement per user — creating a new one deletes the previous one first (handled in the hook, not a DB constraint).

**Visibility rules (evaluated client-side in the hook query):**
- **Live:** `starts_at <= now() AND starts_at >= now() - interval '3 hours'`
- **Planned:** `starts_at > now()`
- **Expired:** `starts_at < now() - interval '3 hours'` — not fetched

### `wall_joins`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid primary key` | `gen_random_uuid()` |
| `announcement_id` | `uuid not null` | references `wall_announcements(id) on delete cascade` |
| `user_id` | `uuid not null` | the friend who plans to join |
| `created_at` | `timestamptz not null` | `default now()` |
| unique | | `(announcement_id, user_id)` |

### Profile columns

`on_wall_at` and `on_wall_label` remain in the DB but are no longer written to. No migration needed to remove them.

---

## RLS Policies

**`wall_announcements`:**
- SELECT: authenticated users (needed to see friends' announcements)
- INSERT: own row only (`user_id = auth.uid()`)
- DELETE: own row only (`user_id = auth.uid()`)

**`wall_joins`:**
- SELECT: authenticated users
- INSERT: own row only (`user_id = auth.uid()`)
- DELETE: own row only (`user_id = auth.uid()`)

---

## New Hook: `useWallAnnouncements`

File: `src/hooks/useWallAnnouncements.ts`

**Exported functions:**

```typescript
useMyAnnouncement()
// Returns the current user's active announcement (live or planned) or null

useCreateAnnouncement()
// Mutation: deletes existing, inserts new { location, label, starts_at }

useClearAnnouncement()
// Mutation: deletes by id

useFriendsAnnouncements(followingIds: string[])
// Returns active announcements for friends (live + planned), joined with join count

useJoinAnnouncement()
// Mutation: inserts wall_join { announcement_id }

useUnjoinAnnouncement()
// Mutation: deletes wall_join { announcement_id }

useMyJoins()
// Returns set of announcement_ids the current user has joined
```

## New Hook: `useMySessionLocations`

File: addition to `src/hooks/useSessions.ts`

```typescript
useMySessionLocations()
// Returns distinct location strings from the user's sessions, sorted by frequency
// Used for autocomplete suggestions in the announcement form
```

---

## UI — DashboardPage

### Announcement input form

Shown when user clicks "Announce you're on the wall…":

1. **Location** — text input. While typing, shows dropdown of matching past locations from `useMySessionLocations()`. User can also type something new.
2. **Label** (optional) — text input, e.g. "projecting 7B+"
3. **When** — two-option toggle:
   - "Now" (default)
   - "Plan" → reveals a `datetime-local` input for picking a future date/time
4. Submit: "I'm on the wall 🧗" (when=Now) or "Plan session 📅" (when=Plan)

### Your own status banners

**Live** (starts_at ≤ now):
- Green sage banner: 🧗 location, label, hype count
- "Done" button → `useClearAnnouncement()`

**Planned** (starts_at > now):
- Sage-muted banner: 📅 location, formatted date/time, join count ("X joining")
- "Cancel" button → `useClearAnnouncement()`

### FriendRow in Friends Feed

**Live friend:**
- Green dot on avatar (unchanged)
- Location + label below username
- "🔥 Hype" button (unchanged behaviour, but now calls `useSendHype` keyed to announcement)

**Planned friend:**
- Calendar icon on avatar instead of green dot
- Location + date/time below username
- "📅 Join" button → `useJoinAnnouncement()`. If already joined, shows "✓ Joined" → tap to unjoin

---

## Retirement

`src/hooks/useOnWall.ts` is no longer used and can be deleted after this feature ships.

---

## Out of Scope

- Push notifications when the planned time approaches
- Comments or chat on announcements
- Multiple simultaneous announcements per user
- Admin visibility of announcements
