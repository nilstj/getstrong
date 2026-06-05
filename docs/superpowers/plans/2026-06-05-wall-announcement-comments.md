# Wall Announcement Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-friend rows to the wall notification banner (each tappable), a `wall_comments` table for free-text replies, and a `WallAnnouncementSheet` bottom sheet showing joiners, comments, join/unjoin button, and comment input.

**Architecture:** New `wall_comments` table + `useWallComments` hook + `useAnnouncementJoiners` hook. `WallAnnouncementSheet` uses `BottomSheet` and composes existing join hooks with the new comment hook. The dashboard banner replaces its flat block with per-friend `FriendAnnouncementRow` sub-components, each opening the sheet via `selectedAnnouncement` state.

**Tech Stack:** React, TypeScript, Tailwind CSS, Supabase, TanStack Query, date-fns, lucide-react (none needed), existing `BottomSheet` component

---

## File Map

| Action | Path |
|---|---|
| Create | `supabase/migrations/029_wall_comments.sql` |
| Create | `src/hooks/useWallComments.ts` |
| Modify | `src/hooks/useWallAnnouncements.ts` — add `WallJoin` export + `useAnnouncementJoiners` |
| Create | `src/components/WallAnnouncementSheet.tsx` |
| Modify | `src/pages/DashboardPage.tsx` — replace flat banner with per-friend rows + sheet |

---

## Task 1: Migration

**Files:**
- Create: `supabase/migrations/029_wall_comments.sql`

- [ ] **Step 1: Create the migration file**

```sql
create table wall_comments (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references wall_announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table wall_comments enable row level security;

create policy "authenticated users can read comments"
  on wall_comments for select
  using (auth.role() = 'authenticated');

create policy "users can post own comments"
  on wall_comments for insert
  with check (auth.uid() = user_id);

create policy "users can delete own comments"
  on wall_comments for delete
  using (auth.uid() = user_id);
```

- [ ] **Step 2: Apply in Supabase SQL editor**

Paste and run the SQL above in Supabase → SQL Editor.  
Expected: no errors, `wall_comments` table visible in Table Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/029_wall_comments.sql
git commit -m "feat: add wall_comments table"
```

---

## Task 2: `useWallComments` hook

**Files:**
- Create: `src/hooks/useWallComments.ts`

- [ ] **Step 1: Create the file**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'

export interface WallComment {
  id: string
  announcement_id: string
  user_id: string
  body: string
  created_at: string
}

export function useAnnouncementComments(announcementId: string) {
  return useQuery({
    queryKey: ['wall_comments', announcementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wall_comments')
        .select('*')
        .eq('announcement_id', announcementId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as WallComment[]
    },
  })
}

export function usePostComment() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({ announcementId, body }: { announcementId: string; body: string }) => {
      const { data, error } = await supabase
        .from('wall_comments')
        .insert({ announcement_id: announcementId, user_id: user!.id, body })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as WallComment
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['wall_comments', data.announcement_id] })
    },
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`  
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useWallComments.ts
git commit -m "feat: add useWallComments hook"
```

---

## Task 3: Add `WallJoin` + `useAnnouncementJoiners` to `useWallAnnouncements.ts`

**Files:**
- Modify: `src/hooks/useWallAnnouncements.ts`

- [ ] **Step 1: Add `WallJoin` interface after `WallAnnouncement` interface**

After the closing `}` of `WallAnnouncement`, add:

```typescript
export interface WallJoin {
  id: string
  announcement_id: string
  user_id: string
  created_at: string
}
```

- [ ] **Step 2: Append `useAnnouncementJoiners` at the end of the file**

```typescript
export function useAnnouncementJoiners(announcementId: string) {
  return useQuery({
    queryKey: ['wall_joins', announcementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wall_joins')
        .select('*')
        .eq('announcement_id', announcementId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as WallJoin[]
    },
  })
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`  
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useWallAnnouncements.ts
git commit -m "feat: add WallJoin type and useAnnouncementJoiners hook"
```

---

## Task 4: `WallAnnouncementSheet` component

**Files:**
- Create: `src/components/WallAnnouncementSheet.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { BottomSheet } from './BottomSheet'
import { useProfile } from '../hooks/useProfile'
import type { WallAnnouncement, WallJoin } from '../hooks/useWallAnnouncements'
import {
  useJoinAnnouncement, useUnjoinAnnouncement, useMyJoins,
  useAnnouncementJoiners,
} from '../hooks/useWallAnnouncements'
import type { WallComment } from '../hooks/useWallComments'
import { useAnnouncementComments, usePostComment } from '../hooks/useWallComments'

function JoinerRow({ join }: { join: WallJoin }) {
  const { data: profile } = useProfile(join.user_id)
  if (!profile) return null
  return (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-gray-500 font-medium text-xs flex-shrink-0">
        {profile.avatar_url
          ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
          : profile.username?.[0]?.toUpperCase() ?? '?'}
      </div>
      <span className="text-sm text-gray-700">{profile.username}</span>
    </div>
  )
}

function CommentRow({ comment }: { comment: WallComment }) {
  const { data: profile } = useProfile(comment.user_id)
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-gray-700">{profile?.username ?? '…'}</span>
        <span className="text-[10px] text-gray-400">
          {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
        </span>
      </div>
      <p className="text-sm text-gray-600">{comment.body}</p>
    </div>
  )
}

interface Props {
  announcement: WallAnnouncement
  onClose: () => void
}

export function WallAnnouncementSheet({ announcement, onClose }: Props) {
  const { data: authorProfile } = useProfile(announcement.user_id)
  const { data: joiners = [] } = useAnnouncementJoiners(announcement.id)
  const { data: comments = [] } = useAnnouncementComments(announcement.id)
  const { data: myJoins = new Set<string>() } = useMyJoins()
  const joinAnnouncement = useJoinAnnouncement()
  const unjoinAnnouncement = useUnjoinAnnouncement()
  const postComment = usePostComment()
  const [commentText, setCommentText] = useState('')

  const hasJoined = myJoins.has(announcement.id)
  const isPlanned = new Date(announcement.starts_at) > new Date()
  const title = `${authorProfile?.username ?? '…'} · ${announcement.location}`

  const handleSend = () => {
    if (!commentText.trim()) return
    postComment.mutate(
      { announcementId: announcement.id, body: commentText.trim() },
      { onSuccess: () => setCommentText('') }
    )
  }

  return (
    <BottomSheet open onClose={onClose} title={title}>
      <div className="space-y-5">
        {isPlanned && (
          <p className="text-sm text-sage-700 font-medium">
            📅 {format(new Date(announcement.starts_at), 'EEEE d MMM, HH:mm')}
          </p>
        )}

        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Joining</p>
          {joiners.length === 0 ? (
            <p className="text-sm text-gray-400">No one joining yet.</p>
          ) : (
            <div className="space-y-2">
              {joiners.map(j => <JoinerRow key={j.id} join={j} />)}
            </div>
          )}
        </div>

        <button
          onClick={() => {
            if (hasJoined) {
              unjoinAnnouncement.mutate(announcement.id)
            } else {
              joinAnnouncement.mutate(announcement.id)
            }
          }}
          disabled={joinAnnouncement.isPending || unjoinAnnouncement.isPending}
          className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
            hasJoined ? 'bg-sage-100 text-sage-700' : 'bg-sage-700 text-white'
          }`}
        >
          {hasJoined ? "✓ I'll be there" : "I'll be there too 🧗"}
        </button>

        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Comments</p>
          {comments.length === 0 ? (
            <p className="text-sm text-gray-400">No comments yet.</p>
          ) : (
            <div className="space-y-3">
              {comments.map(c => <CommentRow key={c.id} comment={c} />)}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <input
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
            }}
            placeholder="Add a comment…"
            className="flex-1 border rounded-xl px-3 py-2 text-sm"
          />
          <button
            onClick={handleSend}
            disabled={!commentText.trim() || postComment.isPending}
            className="px-4 py-2 bg-sage-700 text-white rounded-xl text-sm font-medium disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`  
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/WallAnnouncementSheet.tsx
git commit -m "feat: add WallAnnouncementSheet with joiners, comments, and join button"
```

---

## Task 5: Update DashboardPage banner

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Add imports**

Add these imports to the top of `src/pages/DashboardPage.tsx`:

```typescript
import { WallAnnouncementSheet } from '../components/WallAnnouncementSheet'
```

(Note: `format` from date-fns, `WallAnnouncement`, and `useMyJoins` are already imported)

- [ ] **Step 2: Add `selectedAnnouncement` state**

After `const [showLocationSuggestions, setShowLocationSuggestions] = useState(false)`, add:

```typescript
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<WallAnnouncement | null>(null)
```

- [ ] **Step 3: Remove now-unused derived variables**

Find and delete these three lines from the component body:

```typescript
  const liveFriends = friendsAnnouncements.filter(a => new Date(a.starts_at) <= now)
  const plannedFriends = friendsAnnouncements.filter(a => new Date(a.starts_at) > now)
  const friendWallLocations = [...new Set(friendsAnnouncements.map(a => a.location))]
```

Also remove the `now` variable if it was only used by the above (search for `const now = new Date()` and delete it if unused elsewhere).

- [ ] **Step 4: Add `FriendAnnouncementRow` helper component**

Add this function anywhere before the `DashboardPage` export (e.g., just above it):

```tsx
function FriendAnnouncementRow({ announcement, onClick }: { announcement: WallAnnouncement; onClick: () => void }) {
  const { data: profile } = useProfile(announcement.user_id)
  const isLive = new Date(announcement.starts_at) <= new Date()
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 text-left active:bg-sage-100 transition-colors px-1 py-1.5 rounded-xl"
    >
      <span className="text-base">{isLive ? '🧗' : '📅'}</span>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-sage-800">{profile?.username ?? '…'}</span>
        <span className="text-sm text-sage-600"> · {announcement.location}</span>
        {!isLive && (
          <span className="text-xs text-sage-500 ml-1">
            · {format(new Date(announcement.starts_at), 'EEE HH:mm')}
          </span>
        )}
      </div>
      <span className="text-sage-400 text-base">›</span>
    </button>
  )
}
```

- [ ] **Step 5: Replace the flat banner block**

Find and replace the entire `{/* Friends on the wall notification */}` block with:

```tsx
      {/* Friends on the wall notification */}
      {friendsAnnouncements.length > 0 && (
        <>
          <div className="bg-sage-50 border border-sage-200 rounded-2xl px-4 py-3 space-y-1">
            <p className="text-xs font-semibold text-sage-600 uppercase tracking-wide mb-1">Friends on the wall</p>
            {friendsAnnouncements.map(a => (
              <FriendAnnouncementRow
                key={a.id}
                announcement={a}
                onClick={() => setSelectedAnnouncement(a)}
              />
            ))}
          </div>
          {selectedAnnouncement && (
            <WallAnnouncementSheet
              announcement={selectedAnnouncement}
              onClose={() => setSelectedAnnouncement(null)}
            />
          )}
        </>
      )}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`  
Expected: no errors

- [ ] **Step 7: Verify build passes**

Run: `npm run build`  
Expected: `✓ built in Xs`

- [ ] **Step 8: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat: replace flat wall banner with per-friend rows opening announcement sheet"
```

---

## Manual Verification Checklist

- [ ] Dashboard shows each friend's name + location + live/planned indicator as separate tappable rows
- [ ] Tapping a row opens the bottom sheet
- [ ] Sheet header shows friend's name + location
- [ ] Planned sessions show date/time in the sheet
- [ ] "Joining" section lists everyone who joined
- [ ] "I'll be there too 🧗" button joins; "✓ I'll be there" unjoins on tap
- [ ] Comments section shows existing comments with username + relative time
- [ ] Typing a comment and pressing Send or Enter posts it and clears the input
- [ ] Sheet closes via the × button or backdrop tap
