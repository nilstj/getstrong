# Trash Talk Wall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-problem banter comment thread with a `💬 N` badge toggle, inline expanded view, and bell notifications when friends comment on your problems.

**Architecture:** New `problem_comments` table + `useProblemComments` hook + reusable `ProblemCommentThread` component. The `💬 N` badge is shown on each problem card; tapping it toggles the thread inline (one open at a time via `openCommentProblemId` state). AppBar gains a "Trash talk 🔥" notification section using a new notification hook.

**Tech Stack:** React, TypeScript, Tailwind CSS, Supabase, TanStack Query, date-fns, lucide-react

---

## File Map

| Action | Path |
|---|---|
| Create | `supabase/migrations/031_problem_comments.sql` |
| Create | `src/hooks/useProblemComments.ts` |
| Create | `src/components/ProblemCommentThread.tsx` |
| Modify | `src/pages/SessionDetailPage.tsx` |
| Modify | `src/pages/DashboardPage.tsx` |
| Modify | `src/components/AppBar.tsx` |

---

## Task 1: Migration

**Files:**
- Create: `supabase/migrations/031_problem_comments.sql`

- [ ] **Step 1: Create the migration file**

```sql
create table problem_comments (
  id uuid primary key default gen_random_uuid(),
  problem_id uuid not null references problems(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table problem_comments enable row level security;

create policy "authenticated users can read problem comments"
  on problem_comments for select
  using (auth.role() = 'authenticated');

create policy "users can post own problem comments"
  on problem_comments for insert
  with check (auth.uid() = user_id);

create policy "users can delete own problem comments"
  on problem_comments for delete
  using (auth.uid() = user_id);
```

- [ ] **Step 2: Apply in Supabase SQL editor**

Paste and run the SQL above. Expected: no errors, `problem_comments` visible in Table Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/031_problem_comments.sql
git commit -m "feat: add problem_comments table for trash talk"
```

---

## Task 2: `useProblemComments` hook

**Files:**
- Create: `src/hooks/useProblemComments.ts`

- [ ] **Step 1: Create the file**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'

export interface ProblemComment {
  id: string
  problem_id: string
  user_id: string
  body: string
  created_at: string
}

export interface ProblemCommentNotif {
  id: string
  user_id: string
  body: string
  created_at: string
  problem_id: string
  problems: {
    grade_value_font: string | null
    color: string | null
    user_id: string
    sessions: { location: string } | null
  } | null
}

export function useProblemComments(problemId: string) {
  return useQuery({
    queryKey: ['problem_comments', problemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('problem_comments')
        .select('*')
        .eq('problem_id', problemId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as ProblemComment[]
    },
  })
}

export function useProblemCommentCounts(problemIds: string[]) {
  const sortedKey = problemIds.slice().sort().join(',')
  return useQuery({
    queryKey: ['problem_comment_counts', sortedKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('problem_comments')
        .select('problem_id')
        .in('problem_id', problemIds)
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const row of data ?? []) {
        counts[row.problem_id] = (counts[row.problem_id] ?? 0) + 1
      }
      return counts
    },
    enabled: problemIds.length > 0,
  })
}

export function usePostProblemComment() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({ problemId, body }: { problemId: string; body: string }) => {
      const { data, error } = await supabase
        .from('problem_comments')
        .insert({ problem_id: problemId, user_id: user!.id, body })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as ProblemComment
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['problem_comments', data.problem_id] })
      queryClient.invalidateQueries({ queryKey: ['problem_comment_counts'] })
    },
  })
}

export function useMyProblemCommentNotifs() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my_problem_comment_notifs', user?.id],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('problem_comments')
        .select('id, user_id, body, created_at, problem_id, problems!inner(grade_value_font, color, user_id, sessions!inner(location))')
        .eq('problems.user_id', user!.id)
        .neq('user_id', user!.id)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as ProblemCommentNotif[]
    },
    enabled: !!user,
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`  
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useProblemComments.ts
git commit -m "feat: add useProblemComments hook"
```

---

## Task 3: `ProblemCommentThread` component

**Files:**
- Create: `src/components/ProblemCommentThread.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { useProfile } from '../hooks/useProfile'
import type { ProblemComment } from '../hooks/useProblemComments'
import { useProblemComments, usePostProblemComment } from '../hooks/useProblemComments'

function CommentRow({ comment }: { comment: ProblemComment }) {
  const { data: profile } = useProfile(comment.user_id)
  return (
    <div className="flex gap-2">
      <div className="w-5 h-5 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-gray-500 font-medium text-[10px] flex-shrink-0 mt-0.5">
        {profile?.avatar_url
          ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
          : profile?.username?.[0]?.toUpperCase() ?? '?'}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold text-gray-700">{profile?.username ?? '…'}</span>
        <span className="text-[10px] text-gray-400 ml-1">
          {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
        </span>
        <p className="text-xs text-gray-600 mt-0.5 break-words">{comment.body}</p>
      </div>
    </div>
  )
}

interface Props {
  problemId: string
}

export function ProblemCommentThread({ problemId }: Props) {
  const { data: comments = [] } = useProblemComments(problemId)
  const postComment = usePostProblemComment()
  const [text, setText] = useState('')

  const handleSend = () => {
    if (!text.trim()) return
    postComment.mutate(
      { problemId, body: text.trim() },
      { onSuccess: () => setText('') }
    )
  }

  return (
    <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
      {comments.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-1">No trash talk yet. Start something. 🔥</p>
      ) : (
        <div className="space-y-2">
          {comments.map(c => <CommentRow key={c.id} comment={c} />)}
        </div>
      )}
      <div className="flex gap-1.5">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
          }}
          placeholder="Say something… 🔥"
          className="flex-1 text-xs border rounded-lg px-2.5 py-1.5"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || postComment.isPending}
          className="text-xs px-3 py-1.5 bg-sage-700 text-white rounded-lg font-medium disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`  
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ProblemCommentThread.tsx
git commit -m "feat: add ProblemCommentThread component"
```

---

## Task 4: Update `SessionDetailPage.tsx`

**Files:**
- Modify: `src/pages/SessionDetailPage.tsx`

- [ ] **Step 1: Add imports**

Near the existing component imports, add:

```typescript
import { ProblemCommentThread } from '../components/ProblemCommentThread'
import { useProblemCommentCounts } from '../hooks/useProblemComments'
```

- [ ] **Step 2: Add hooks in the component body**

After `const { data: problems = [] } = useSessionProblems(id!)`, add:

```typescript
  const problemIds = problems.map(p => p.id)
  const { data: commentCounts = {} } = useProblemCommentCounts(problemIds)
  const [openCommentProblemId, setOpenCommentProblemId] = useState<string | null>(null)
```

- [ ] **Step 3: Add badge + thread to each problem card**

Find the line `<ReactionBar problemId={problem.id} compact />` inside the problem card and replace it with:

```tsx
                <ReactionBar problemId={problem.id} compact />
                <div className="flex items-center mt-1.5">
                  <button
                    onClick={() => setOpenCommentProblemId(
                      openCommentProblemId === problem.id ? null : problem.id
                    )}
                    className="text-xs text-gray-400 hover:text-sage-700 transition-colors font-medium"
                  >
                    💬{(commentCounts[problem.id] ?? 0) > 0 ? ` ${commentCounts[problem.id]}` : ''}
                  </button>
                </div>
                {openCommentProblemId === problem.id && (
                  <ProblemCommentThread problemId={problem.id} />
                )}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`  
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/pages/SessionDetailPage.tsx
git commit -m "feat: add trash talk badge and thread to session problem cards"
```

---

## Task 5: Update `DashboardPage.tsx` FriendDetailSheet

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Add imports at the top of `DashboardPage.tsx`**

```typescript
import { ProblemCommentThread } from '../components/ProblemCommentThread'
import { useProblemCommentCounts } from '../hooks/useProblemComments'
```

- [ ] **Step 2: Update `FriendDetailSheet` to add comment counts + toggle state**

Find the `FriendDetailSheet` function signature:

```typescript
function FriendDetailSheet({ userId, gradeScale, onClose }: { userId: string; gradeScale: 'font' | 'v_scale'; onClose: () => void }) {
  const { data: profile } = useProfile(userId)
  const { data: detail, isLoading } = useFriendWeeklyDetail(userId)
```

After `useFriendWeeklyDetail`, add:

```typescript
  const friendProblemIds = (detail?.problems ?? []).map(p => p.id)
  const { data: commentCounts = {} } = useProblemCommentCounts(friendProblemIds)
  const [openCommentProblemId, setOpenCommentProblemId] = useState<string | null>(null)
```

- [ ] **Step 3: Add badge + thread to friend problem cards**

Find `<ReactionBar problemId={p.id} />` inside `FriendDetailSheet` and replace it with:

```tsx
                      <ReactionBar problemId={p.id} />
                      <div className="flex items-center mt-1">
                        <button
                          onClick={() => setOpenCommentProblemId(
                            openCommentProblemId === p.id ? null : p.id
                          )}
                          className="text-xs text-gray-400 hover:text-sage-700 transition-colors font-medium"
                        >
                          💬{(commentCounts[p.id] ?? 0) > 0 ? ` ${commentCounts[p.id]}` : ''}
                        </button>
                      </div>
                      {openCommentProblemId === p.id && (
                        <ProblemCommentThread problemId={p.id} />
                      )}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`  
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat: add trash talk badge and thread to friend detail sheet problems"
```

---

## Task 6: Update `AppBar.tsx` — Trash Talk notifications

**Files:**
- Modify: `src/components/AppBar.tsx`

- [ ] **Step 1: Add imports**

Add to the import block:

```typescript
import { useMyProblemCommentNotifs } from '../hooks/useProblemComments'
import type { ProblemCommentNotif } from '../hooks/useProblemComments'
```

- [ ] **Step 2: Add hooks + localStorage state in `AppBar` function**

After the video notification block (`unseenVideoCount`), add:

```typescript
  const { data: trashTalkNotifs = [] } = useMyProblemCommentNotifs()
  const [lastSeenTrashTalkAt, setLastSeenTrashTalkAt] = useState(
    () => localStorage.getItem('lastSeenTrashTalkAt') ?? ''
  )
  const unseenTrashTalk = trashTalkNotifs.filter(
    n => !lastSeenTrashTalkAt || n.created_at > lastSeenTrashTalkAt
  )
  const unseenTrashTalkCount = unseenTrashTalk.length
```

- [ ] **Step 3: Add to total badge**

Find:
```typescript
  const total = followRequests.length + challengeInvitations.length + taggedSessions.length + (unseenHypes > 0 ? 1 : 0) + (unseenVideoCount > 0 ? 1 : 0)
```

Replace with:
```typescript
  const total = followRequests.length + challengeInvitations.length + taggedSessions.length + (unseenHypes > 0 ? 1 : 0) + (unseenVideoCount > 0 ? 1 : 0) + (unseenTrashTalkCount > 0 ? 1 : 0)
```

- [ ] **Step 4: Update bell onClick to write `lastSeenTrashTalkAt` to localStorage**

Find the bell `onClick`:
```typescript
          onClick={() => {
            setOpen(true)
            localStorage.setItem('lastSeenVideosAt', new Date().toISOString())
          }}
```

Replace with:
```typescript
          onClick={() => {
            setOpen(true)
            const now = new Date().toISOString()
            localStorage.setItem('lastSeenVideosAt', now)
            localStorage.setItem('lastSeenTrashTalkAt', now)
          }}
```

- [ ] **Step 5: Update BottomSheet `onClose` to sync trash talk state**

Find:
```typescript
      <BottomSheet open={open} onClose={() => { setOpen(false); setLastSeenVideosAt(localStorage.getItem('lastSeenVideosAt') ?? '') }} title="Notifications">
```

Replace with:
```typescript
      <BottomSheet open={open} onClose={() => {
        setOpen(false)
        setLastSeenVideosAt(localStorage.getItem('lastSeenVideosAt') ?? '')
        setLastSeenTrashTalkAt(localStorage.getItem('lastSeenTrashTalkAt') ?? '')
      }} title="Notifications">
```

- [ ] **Step 6: Pass trash talk props to `NotificationList`**

Find the `<NotificationList` JSX and add:

```typescript
        <NotificationList
          followRequests={followRequests}
          challengeInvitations={challengeInvitations}
          taggedSessions={taggedSessions}
          unseenHypes={unseenHypes}
          onDismissHypes={dismissHypes}
          betaVideos={unseenBetaVideos}
          proofVideos={unseenProofVideos}
          trashTalkNotifs={unseenTrashTalk}
          onClose={() => {
            setOpen(false)
            setLastSeenVideosAt(localStorage.getItem('lastSeenVideosAt') ?? '')
            setLastSeenTrashTalkAt(localStorage.getItem('lastSeenTrashTalkAt') ?? '')
          }}
        />
```

- [ ] **Step 7: Update `NotificationList` signature**

Add `trashTalkNotifs: ProblemCommentNotif[]` to the props type:

```typescript
function NotificationList({
  followRequests,
  challengeInvitations,
  taggedSessions,
  unseenHypes,
  onDismissHypes,
  betaVideos,
  proofVideos,
  trashTalkNotifs,
  onClose,
}: {
  followRequests: { id: string; requester_id: string }[]
  challengeInvitations: any[]
  taggedSessions: { sessionId: string; location: string; date: string; ownerUserId: string }[]
  unseenHypes: number
  onDismissHypes: () => void
  betaVideos: FriendBetaVideo[]
  proofVideos: FriendProofVideo[]
  trashTalkNotifs: ProblemCommentNotif[]
  onClose: () => void
}) {
```

- [ ] **Step 8: Update `isEmpty` check**

Find and replace the `isEmpty` line:

```typescript
  const isEmpty = followRequests.length === 0 && challengeInvitations.length === 0 && taggedSessions.length === 0 && unseenHypes === 0 && betaVideos.length === 0 && proofVideos.length === 0 && trashTalkNotifs.length === 0
```

- [ ] **Step 9: Add `TrashTalkNotifRow` helper and "Trash talk" section**

Add `TrashTalkNotifRow` at the bottom of `AppBar.tsx` (after `VideoNotifRow`):

```tsx
function TrashTalkNotifRow({ notif }: { notif: ProblemCommentNotif }) {
  const { data: profile } = useProfile(notif.user_id)
  const grade = notif.problems?.grade_value_font ?? notif.problems?.color ?? '—'
  const location = notif.problems?.sessions?.location ?? 'somewhere'
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3">
      <p className="text-sm text-gray-700">
        <span className="font-semibold">{profile?.username ?? '…'}</span>
        {' said something about your '}
        <span className="font-semibold">{grade}</span>
        {' at '}
        <span className="font-semibold">{location}</span>
      </p>
      <p className="text-xs text-gray-400 mt-0.5 truncate">"{notif.body}"</p>
    </div>
  )
}
```

Inside `NotificationList`, add the "Trash talk" section after the Hype section:

```tsx
      {trashTalkNotifs.length > 0 && (
        <section>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Trash talk 🔥</p>
          <div className="space-y-2">
            {trashTalkNotifs.map(n => (
              <TrashTalkNotifRow key={n.id} notif={n} />
            ))}
          </div>
        </section>
      )}
```

- [ ] **Step 10: Verify TypeScript compiles + build passes**

Run: `npx tsc --noEmit`  
Run: `npm run build`  
Expected: no errors, `✓ built`

- [ ] **Step 11: Commit and push**

```bash
git add src/components/AppBar.tsx
git commit -m "feat: add trash talk notifications to AppBar panel"
git push origin main
```

---

## Manual Verification Checklist

- [ ] Problem cards in session detail show a `💬` badge below ReactionBar
- [ ] Badge shows `💬 3` when 3 comments exist
- [ ] Tapping badge expands the thread inline; tapping again collapses it
- [ ] Only one thread open at a time
- [ ] Empty state shows "No trash talk yet. Start something. 🔥"
- [ ] Typing and pressing Send posts the comment; input clears
- [ ] Friend's problems in the Friends Feed detail sheet also have the badge + thread
- [ ] When a friend comments on your problem, bell badge increments
- [ ] "Trash talk 🔥" section appears in notification panel with the comment preview
- [ ] Opening the panel marks trash talk as seen; closing clears the badge
