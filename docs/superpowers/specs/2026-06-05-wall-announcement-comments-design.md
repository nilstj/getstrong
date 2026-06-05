# Wall Announcement Comments Design

**Date:** 2026-06-05  
**Status:** Approved

## Overview

Enhance the wall announcements feature with:
1. **Named friend rows** in the dashboard notification banner — each friend's name + location + time, tappable
2. **`wall_comments` table** — free-text comments per announcement, independent of joins
3. **`WallAnnouncementSheet`** — a bottom sheet showing joiners, comments, join/unjoin button, and comment input

---

## Data Model

### `wall_comments`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid primary key` | `gen_random_uuid()` |
| `announcement_id` | `uuid not null` | references `wall_announcements(id) on delete cascade` |
| `user_id` | `uuid not null` | references `auth.users(id) on delete cascade` |
| `body` | `text not null` | the comment text |
| `created_at` | `timestamptz not null` | `default now()` |

**RLS:**
- SELECT: all authenticated users
- INSERT: `auth.uid() = user_id`
- DELETE: `auth.uid() = user_id`

`wall_joins` is unchanged — join and comment are independent actions.

---

## New Hooks

### `useWallComments.ts`

```typescript
useAnnouncementComments(announcementId: string)
// Fetches wall_comments for an announcement, ordered by created_at asc
// Returns { id, announcement_id, user_id, body, created_at }[]

usePostComment()
// Mutation: inserts { announcement_id, body } into wall_comments
// Invalidates ['wall_comments', announcementId]
```

### Addition to `useWallAnnouncements.ts`

```typescript
useAnnouncementJoiners(announcementId: string)
// Fetches wall_joins for an announcement
// Returns { id, announcement_id, user_id, created_at }[]
```

---

## New Component: `WallAnnouncementSheet`

File: `src/components/WallAnnouncementSheet.tsx`

**Props:**
```typescript
{
  announcement: WallAnnouncement
  onClose: () => void
}
```

**Layout:**
1. **Header** — friend's name (via `useProfile(announcement.user_id)`), location, formatted date/time if planned
2. **Joiners section** — list of `useAnnouncementJoiners` results, each showing avatar/name via `useProfile(join.user_id)`. If empty: "No one joining yet."
3. **Join/unjoin button** — uses existing `useJoinAnnouncement` / `useUnjoinAnnouncement` + `useMyJoins`
4. **Comments section** — list of comments from `useAnnouncementComments`, each showing username + body + relative time (e.g. "2m ago")
5. **Comment input** — text input + "Send" button at the bottom, uses `usePostComment`

Uses the existing `BottomSheet` component.

---

## Dashboard Banner Changes (`DashboardPage.tsx`)

Replace the current flat notification block with per-friend rows using a new `FriendAnnouncementRow` helper component:

```
🧗 Friends on the wall
┌──────────────────────────────────────┐
│ 🧗 Nils · Boulders · now            ›│
│ 📅 Bjorn · Kilter Cave · Thu 18:00  ›│
└──────────────────────────────────────┘
```

**`FriendAnnouncementRow`:**
- Small internal component in `DashboardPage.tsx`
- Calls `useProfile(announcement.user_id)` for the name (already cached from FriendRow)
- Shows 🧗 for live, 📅 for planned
- `onClick` → opens `WallAnnouncementSheet` with the announcement

State needed: `selectedAnnouncement: WallAnnouncement | null` — set on row tap, cleared on sheet close.

---

## File Map

| Action | Path |
|---|---|
| Create | `supabase/migrations/029_wall_comments.sql` |
| Create | `src/hooks/useWallComments.ts` |
| Modify | `src/hooks/useWallAnnouncements.ts` — add `useAnnouncementJoiners` |
| Create | `src/components/WallAnnouncementSheet.tsx` |
| Modify | `src/pages/DashboardPage.tsx` — replace flat banner with per-friend rows + sheet state |

---

## Out of Scope

- Editing or deleting comments
- Notifications when someone comments on your announcement
- Pagination of comments
- Comment reactions
