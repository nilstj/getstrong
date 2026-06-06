# Video Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add notifications to the AppBar panel when friends add video links to problems or challenge attempts, and fix the proof video display style in the challenges page.

**Architecture:** Two new query hooks (`useFriendBetaVideos`, `useFriendProofVideos`) query recent friend activity via Supabase. AppBar gains `useFollowing` + the two video hooks, filters by `lastSeenVideosAt` (localStorage), adds to badge count, and renders a "Videos" section in the notification panel. Proof video links in ChallengesPage get a style fix.

**Tech Stack:** React, TypeScript, Tailwind CSS, Supabase, TanStack Query

> **Note:** Problem beta video links in SessionDetailPage (`▶ Beta video`) are already implemented at lines 224-229. No changes needed there.

---

## File Map

| Action | Path |
|---|---|
| Create | `src/hooks/useVideoNotifications.ts` |
| Modify | `src/components/AppBar.tsx` |
| Modify | `src/pages/ChallengesPage.tsx` |

---

## Task 1: `useVideoNotifications` hook

**Files:**
- Create: `src/hooks/useVideoNotifications.ts`

- [ ] **Step 1: Create the file**

```typescript
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface FriendBetaVideo {
  id: string
  user_id: string
  session_id: string
  beta_video_url: string
  created_at: string
}

export interface FriendProofVideo {
  id: string
  user_id: string
  challenge_id: string
  video_url: string
  created_at: string
  challenges: { title: string } | null
}

const FORTY_EIGHT_HOURS_AGO = () =>
  new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

export function useFriendBetaVideos(followingIds: string[]) {
  const sortedKey = followingIds.slice().sort().join(',')
  return useQuery({
    queryKey: ['friend_beta_videos', sortedKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('problems')
        .select('id, user_id, session_id, beta_video_url, created_at')
        .in('user_id', followingIds)
        .not('beta_video_url', 'is', null)
        .gte('created_at', FORTY_EIGHT_HOURS_AGO())
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as FriendBetaVideo[]
    },
    enabled: followingIds.length > 0,
  })
}

export function useFriendProofVideos(followingIds: string[]) {
  const sortedKey = followingIds.slice().sort().join(',')
  return useQuery({
    queryKey: ['friend_proof_videos', sortedKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('challenge_attempts')
        .select('id, user_id, challenge_id, video_url, created_at, challenges(title)')
        .in('user_id', followingIds)
        .not('video_url', 'is', null)
        .gte('created_at', FORTY_EIGHT_HOURS_AGO())
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as FriendProofVideo[]
    },
    enabled: followingIds.length > 0,
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`  
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useVideoNotifications.ts
git commit -m "feat: add useFriendBetaVideos and useFriendProofVideos hooks"
```

---

## Task 2: Update AppBar with video notifications

**Files:**
- Modify: `src/components/AppBar.tsx`

The current `AppBar.tsx` does not call `useFollowing`. This task adds it, adds the two video hooks, computes unseen count using localStorage, adds to badge, and adds a "Videos" section to `NotificationList`.

- [ ] **Step 1: Update imports**

Replace the existing `useFollows` import line:
```typescript
import { useReceivedFollowRequests, useAcceptFollowRequest, useDeclineFollowRequest } from '../hooks/useFollows'
```
With:
```typescript
import { useReceivedFollowRequests, useAcceptFollowRequest, useDeclineFollowRequest, useFollowing } from '../hooks/useFollows'
import { useFriendBetaVideos, useFriendProofVideos } from '../hooks/useVideoNotifications'
import type { FriendBetaVideo, FriendProofVideo } from '../hooks/useVideoNotifications'
```

- [ ] **Step 2: Add following + video hooks inside `AppBar` function**

After the `dismissHypes` / `unseenHypes` block, add:

```typescript
  const { data: following = [] } = useFollowing()
  const followingIds = following.map(f => f.following_id)
  const { data: betaVideos = [] } = useFriendBetaVideos(followingIds)
  const { data: proofVideos = [] } = useFriendProofVideos(followingIds)
  const [lastSeenVideosAt, setLastSeenVideosAt] = useState(
    () => localStorage.getItem('lastSeenVideosAt') ?? ''
  )
  const unseenBetaVideos = betaVideos.filter(v => !lastSeenVideosAt || v.created_at > lastSeenVideosAt)
  const unseenProofVideos = proofVideos.filter(v => !lastSeenVideosAt || v.created_at > lastSeenVideosAt)
  const unseenVideoCount = unseenBetaVideos.length + unseenProofVideos.length
```

- [ ] **Step 3: Update `total` to include unseen videos**

Find:
```typescript
  const total = followRequests.length + challengeInvitations.length + taggedSessions.length + (unseenHypes > 0 ? 1 : 0)
```

Replace with:
```typescript
  const total = followRequests.length + challengeInvitations.length + taggedSessions.length + (unseenHypes > 0 ? 1 : 0) + (unseenVideoCount > 0 ? 1 : 0)
```

- [ ] **Step 4: Update the notification bell `onClick` to mark videos as seen**

Find the bell button's `onClick`:
```typescript
          onClick={() => setOpen(true)}
```

Replace with:
```typescript
          onClick={() => {
            setOpen(true)
            const now = new Date().toISOString()
            localStorage.setItem('lastSeenVideosAt', now)
            setLastSeenVideosAt(now)
          }}
```

- [ ] **Step 5: Pass video props to `NotificationList`**

Find the `<NotificationList` JSX and add `betaVideos`, `proofVideos` props:

```typescript
        <NotificationList
          followRequests={followRequests}
          challengeInvitations={challengeInvitations}
          taggedSessions={taggedSessions}
          unseenHypes={unseenHypes}
          onDismissHypes={dismissHypes}
          betaVideos={unseenBetaVideos}
          proofVideos={unseenProofVideos}
          onClose={() => setOpen(false)}
        />
```

- [ ] **Step 6: Update `NotificationList` signature**

Find the `NotificationList` function signature and add the two new props:

```typescript
function NotificationList({
  followRequests,
  challengeInvitations,
  taggedSessions,
  unseenHypes,
  onDismissHypes,
  betaVideos,
  proofVideos,
  onClose,
}: {
  followRequests: { id: string; requester_id: string }[]
  challengeInvitations: any[]
  taggedSessions: { sessionId: string; location: string; date: string; ownerUserId: string }[]
  unseenHypes: number
  onDismissHypes: () => void
  betaVideos: FriendBetaVideo[]
  proofVideos: FriendProofVideo[]
  onClose: () => void
}) {
```

- [ ] **Step 7: Update the `isEmpty` check**

Find:
```typescript
  const isEmpty = followRequests.length === 0 && challengeInvitations.length === 0 && taggedSessions.length === 0 && unseenHypes === 0
```

Replace with:
```typescript
  const isEmpty = followRequests.length === 0 && challengeInvitations.length === 0 && taggedSessions.length === 0 && unseenHypes === 0 && betaVideos.length === 0 && proofVideos.length === 0
```

- [ ] **Step 8: Add `VideoNotifRow` helper and "Videos" section**

Add `VideoNotifRow` after the existing `TaggedSessionNotif` function at the bottom of the file:

```tsx
function VideoNotifRow({ userId, videoUrl, label }: { userId: string; videoUrl: string; label: string }) {
  const { data: profile } = useProfile(userId)
  return (
    <a
      href={videoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3"
    >
      <span className="text-base">🎥</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-700">
          <span className="font-semibold">{profile?.username ?? '…'}</span>{' '}
          {label}
        </p>
      </div>
      <span className="text-xs text-sage-700 font-medium flex-shrink-0">▶ Watch</span>
    </a>
  )
}
```

And inside `NotificationList`, add the Videos section after the Hype section:

```tsx
      {(betaVideos.length > 0 || proofVideos.length > 0) && (
        <section>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Videos</p>
          <div className="space-y-2">
            {betaVideos.map(v => (
              <VideoNotifRow
                key={v.id}
                userId={v.user_id}
                videoUrl={v.beta_video_url}
                label="added a beta video"
              />
            ))}
            {proofVideos.map(v => (
              <VideoNotifRow
                key={v.id}
                userId={v.user_id}
                videoUrl={v.video_url}
                label={`added a proof video for "${v.challenges?.title ?? 'a challenge'}"`}
              />
            ))}
          </div>
        </section>
      )}
```

- [ ] **Step 9: Verify TypeScript compiles**

Run: `npx tsc --noEmit`  
Expected: no errors

- [ ] **Step 10: Verify build**

Run: `npm run build`  
Expected: `✓ built in Xs`

- [ ] **Step 11: Commit**

```bash
git add src/components/AppBar.tsx
git commit -m "feat: add video notifications to AppBar panel"
```

---

## Task 3: Fix proof video display in ChallengesPage

**Files:**
- Modify: `src/pages/ChallengesPage.tsx`

Currently proof videos show the raw URL as link text (`▶ {a.video_url}`). This replaces it with a clean `▶ Proof video` label using the consistent style used elsewhere in the app.

- [ ] **Step 1: Read the file** to find the exact proof video block (search for `▶ {a.video_url}`)

- [ ] **Step 2: Replace the proof video link text and style**

Find:
```tsx
            {attempts.filter(a => a.video_url).map(a => (
              <a
                key={a.id}
                href={a.video_url!}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm text-sage-800 truncate"
              >
                ▶ {a.video_url}
              </a>
            ))}
```

Replace with:
```tsx
            {attempts.filter(a => a.video_url).map(a => (
              <a
                key={a.id}
                href={a.video_url!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-sage-800 font-medium inline-block"
              >
                ▶ Proof video
              </a>
            ))}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`  
Expected: no errors

- [ ] **Step 4: Commit and push**

```bash
git add src/pages/ChallengesPage.tsx
git commit -m "fix: show Proof video label instead of raw URL in challenge attempts"
git push origin main
```

---

## Manual Verification Checklist

- [ ] When a friend creates a problem with a beta video URL, it appears in the notification panel under "Videos" within 48h
- [ ] When a friend adds a proof video to a challenge attempt, it appears under "Videos"
- [ ] Each video notification shows the friend's username + description + "▶ Watch" link
- [ ] Tapping the notification row opens the video URL in a new tab
- [ ] The bell badge count includes unseen video notifications
- [ ] Opening the notification panel marks all current videos as seen (badge clears)
- [ ] Challenge proof video links show "▶ Proof video" instead of the raw URL
