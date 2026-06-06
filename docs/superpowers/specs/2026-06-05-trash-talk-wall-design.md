# Trash Talk Wall Design

**Date:** 2026-06-05  
**Status:** Approved

## Overview

A per-problem comment thread for friendly banter. Each problem card gets a `💬 N` badge that toggles an inline comment thread. Friends and challenge participants can post. Problem owners get bell notifications when someone comments.

---

## Data Model

### `problem_comments`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid primary key` | `gen_random_uuid()` |
| `problem_id` | `uuid not null` | references `problems(id) on delete cascade` |
| `user_id` | `uuid not null` | references `auth.users(id) on delete cascade` |
| `body` | `text not null` | the comment |
| `created_at` | `timestamptz not null` | `default now()` |

**RLS:**
- SELECT: all authenticated users
- INSERT: `auth.uid() = user_id`
- DELETE: `auth.uid() = user_id`

---

## Hooks — `src/hooks/useProblemComments.ts`

```typescript
useProblemComments(problemId: string)
// Fetches problem_comments for a problem, ordered by created_at asc
// queryKey: ['problem_comments', problemId]

usePostProblemComment()
// Mutation: inserts { problem_id, body }
// Invalidates ['problem_comments', problemId]

useMyProblemCommentNotifications()
// Fetches problem_comments WHERE:
//   problem.user_id = current_user.id  (comments on my problems)
//   AND problem_comments.user_id != current_user.id  (not my own)
//   AND created_at >= now() - 48h
// Returns { id, problem_id, user_id, body, created_at, problems(session_id) }[]
// queryKey: ['my_problem_comment_notifs', user.id]
```

---

## UI — Problem Card (`SessionDetailPage.tsx`)

### Badge

Below `ReactionBar`, add:
```tsx
<button onClick={() => toggleThread(problem.id)}>
  💬{commentCount > 0 ? ` ${commentCount}` : ''}
</button>
```
- Shows `💬 3` when 3 comments exist
- Shows `💬` (no number) when 0 and closed
- Hidden styling when 0 and never opened

### Expanded thread

When thread is open for a given problem:
- Comments listed oldest-first, each row: avatar/username + body + relative time (`formatDistanceToNow`)
- Empty state: `"No trash talk yet. Start something. 🔥"`
- Text input + "Send" button fixed at the bottom of the thread
- Enter key submits

### State

A single `openThreadId: string | null` state in `SessionDetailPage` — only one thread open at a time.

### FriendDetailSheet

Same badge + thread shown on friend problems in `DashboardPage` — friends can post there too. Uses the same `useProblemComments` hook.

---

## Notifications — `AppBar.tsx`

New "Trash talk 🔥" section in the notification panel using `useMyProblemCommentNotifications()`.

**Dismissal:** `lastSeenTrashTalkAt` in localStorage — set when panel opens (localStorage only, state synced on close — same pattern as video notifications).

**Badge:** `unseenTrashTalkCount` adds to the total badge number.

**Notification row format:**
`"{username} said something about your {grade} at {location}"`
- Grade from `problems.grade_value_font ?? problems.color ?? '—'`
- Location requires joining through `sessions` (via `problems.session_id → sessions.location`)

**No deep link** — MVP, user finds it in their session.

---

## File Map

| Action | Path |
|---|---|
| Create | `supabase/migrations/031_problem_comments.sql` |
| Create | `src/hooks/useProblemComments.ts` |
| Modify | `src/pages/SessionDetailPage.tsx` — badge + inline thread on problem cards |
| Modify | `src/pages/DashboardPage.tsx` — badge + inline thread in FriendDetailSheet |
| Modify | `src/components/AppBar.tsx` — trash talk notification section |

---

## Out of Scope

- Deleting other people's comments (only own)
- Reactions on comments
- Deep link from notification to the specific problem
- @mentions
- Moderation / reporting
