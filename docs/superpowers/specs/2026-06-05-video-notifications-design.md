# Video Notifications & Display Design

**Date:** 2026-06-05  
**Status:** Approved

## Overview

Two related improvements:
1. **Notification** when a friend adds a video link to a problem (beta video) or challenge attempt (proof video) — shown in the AppBar notification panel, ephemeral and dismissed via localStorage
2. **Video link display** in problem lists and challenge attempt lists — using the existing `▶ Text` link style

---

## Part 1: Video Notifications

### Data

**No new DB tables.** Two query-based hooks in `src/hooks/useVideoNotifications.ts`:

```typescript
useFriendBetaVideos(followingIds: string[])
// Queries: problems WHERE user_id IN followingIds
//   AND beta_video_url IS NOT NULL
//   AND created_at >= now() - interval '48 hours'
// Returns: { id, user_id, session_id, beta_video_url, created_at }[]

useFriendProofVideos(followingIds: string[])
// Queries: challenge_attempts WHERE user_id IN followingIds
//   AND video_url IS NOT NULL
//   AND created_at >= now() - interval '48 hours'
// Selects: *, challenges(title)
// Returns: { id, user_id, challenge_id, video_url, created_at, challenges: { title } }[]
```

**Known limitation:** only catches videos on newly created problems/attempts. Adding a video to an existing record won't trigger a notification (no `updated_at` column on either table).

### Dismissal

localStorage key: `lastSeenVideosAt` (ISO timestamp string).

- **Unseen** = items with `created_at > lastSeenVideosAt` (or all items if key not set)
- **Dismiss** = set `lastSeenVideosAt = new Date().toISOString()` when the user opens the notification panel
- Badge count = `unseenBetaVideos.length + unseenProofVideos.length`

### AppBar changes (`src/components/AppBar.tsx`)

1. Add `useFriendBetaVideos(followingIds)` and `useFriendProofVideos(followingIds)` — both require `followingIds` from `useFollowing()` (already fetched)
2. Compute `lastSeenVideosAt` from localStorage on mount
3. Filter to unseen items (created_at > lastSeenVideosAt)
4. When panel opens (`setOpen(true)`), update `lastSeenVideosAt = now()`
5. Add unseen count to badge total
6. Add "Videos" section in `NotificationList` with rows for each item

**Notification row format:**
- Beta video: `🎥 {username} added a beta video` — tapping opens `beta_video_url` in new tab
- Proof video: `🎥 {username} added a proof video for {challenge.title}` — tapping opens `video_url` in new tab
- Username resolved via `useProfile(item.user_id)` (cached)

---

## Part 2: Video Links in Lists

### Problems list (`src/pages/SessionDetailPage.tsx`)

In the exercises list section where each problem is displayed, add below the problem name + grade line:

```tsx
{problem.beta_video_url && (
  <a
    href={problem.beta_video_url}
    target="_blank"
    rel="noopener noreferrer"
    className="text-xs text-sage-800 font-medium mt-0.5 inline-block"
  >
    ▶ Beta video
  </a>
)}
```

### Challenge attempt cards (`src/pages/ChallengesPage.tsx`)

Challenge cards already show `▶ Watch demo video` — no change needed there.

In the attempt list section, each attempt card should show:

```tsx
{a.video_url && (
  <a
    href={a.video_url}
    target="_blank"
    rel="noopener noreferrer"
    className="text-xs text-sage-800 font-medium mt-0.5 inline-block"
  >
    ▶ Proof video
  </a>
)}
```

---

## File Map

| Action | Path |
|---|---|
| Create | `src/hooks/useVideoNotifications.ts` |
| Modify | `src/components/AppBar.tsx` — add video notification hooks, badge count, panel section |
| Modify | `src/pages/SessionDetailPage.tsx` — add beta video link on problem cards |
| Modify | `src/pages/ChallengesPage.tsx` — add proof video link on attempt cards |

---

## Out of Scope

- Notifications for videos added to existing problems (requires `updated_at`)
- Push notifications
- Video preview / embed
- Notification when challenge creator adds a demo video
