# Wall Announcements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the profile-based "on the wall" feature with a dedicated `wall_announcements` table that supports both live check-ins and planned future sessions, with location autocomplete, "I'll join" RSVPs for planned sessions, and hype for live sessions.

**Architecture:** Two new tables (`wall_announcements`, `wall_joins`) with RLS. A new `useWallAnnouncements` hook replaces `useSetOnWall`/`useFriendsOnWall`. `DashboardPage` gets a new form (location autocomplete + optional label + now/plan toggle) and updated FriendRow showing join/hype based on whether the session is live or planned. `useSendHype` and `useMyHypeCount` in `useOnWall.ts` are kept as-is.

**Tech Stack:** React, TypeScript, Tailwind CSS, Supabase, TanStack Query, lucide-react, date-fns

---

## File Map

| Action | Path |
|---|---|
| Create | `supabase/migrations/027_wall_announcements.sql` |
| Create | `src/hooks/useWallAnnouncements.ts` |
| Modify | `src/hooks/useSessions.ts` — add `useMySessionLocations` |
| Modify | `src/pages/DashboardPage.tsx` — replace on-wall UI |

---

## Task 1: Migration

**Files:**
- Create: `supabase/migrations/027_wall_announcements.sql`

- [ ] **Step 1: Create the migration file**

```sql
create table wall_announcements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location text not null,
  label text,
  starts_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table wall_announcements enable row level security;

create policy "authenticated users can read announcements"
  on wall_announcements for select
  using (auth.role() = 'authenticated');

create policy "users can create own announcements"
  on wall_announcements for insert
  with check (auth.uid() = user_id);

create policy "users can delete own announcements"
  on wall_announcements for delete
  using (auth.uid() = user_id);

create table wall_joins (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references wall_announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(announcement_id, user_id)
);

alter table wall_joins enable row level security;

create policy "authenticated users can read joins"
  on wall_joins for select
  using (auth.role() = 'authenticated');

create policy "users can create own joins"
  on wall_joins for insert
  with check (auth.uid() = user_id);

create policy "users can delete own joins"
  on wall_joins for delete
  using (auth.uid() = user_id);
```

- [ ] **Step 2: Apply in Supabase SQL editor**

Paste and run the SQL above in your Supabase project → SQL Editor.  
Expected: no errors, two new tables visible in Table Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/027_wall_announcements.sql
git commit -m "feat: add wall_announcements and wall_joins tables"
```

---

## Task 2: `useWallAnnouncements` hook

**Files:**
- Create: `src/hooks/useWallAnnouncements.ts`

- [ ] **Step 1: Create the file**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'

export interface WallAnnouncement {
  id: string
  user_id: string
  location: string
  label: string | null
  starts_at: string
  created_at: string
  wall_joins: { id: string }[]
}

const THREE_HOURS_AGO = () =>
  new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()

export function useMyAnnouncement() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['wall_announcement', 'mine', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wall_announcements')
        .select('*, wall_joins(id)')
        .eq('user_id', user!.id)
        .gte('starts_at', THREE_HOURS_AGO())
        .order('starts_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as WallAnnouncement | null
    },
    enabled: !!user,
  })
}

export function useCreateAnnouncement() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({
      location,
      label,
      starts_at,
    }: {
      location: string
      label: string | null
      starts_at: string
    }) => {
      // Delete any existing announcement first
      await supabase
        .from('wall_announcements')
        .delete()
        .eq('user_id', user!.id)

      const { data, error } = await supabase
        .from('wall_announcements')
        .insert({ user_id: user!.id, location, label, starts_at })
        .select('*, wall_joins(id)')
        .single()
      if (error) throw error
      return data as WallAnnouncement
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wall_announcement'] })
    },
  })
}

export function useClearAnnouncement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('wall_announcements')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wall_announcement'] })
    },
  })
}

export function useFriendsAnnouncements(followingIds: string[]) {
  const sortedKey = followingIds.slice().sort().join(',')
  return useQuery({
    queryKey: ['wall_announcement', 'friends', sortedKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wall_announcements')
        .select('*, wall_joins(id)')
        .in('user_id', followingIds)
        .gte('starts_at', THREE_HOURS_AGO())
        .order('starts_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as WallAnnouncement[]
    },
    enabled: followingIds.length > 0,
  })
}

export function useJoinAnnouncement() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (announcementId: string) => {
      const { error } = await supabase
        .from('wall_joins')
        .insert({ announcement_id: announcementId, user_id: user!.id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wall_announcement'] })
      queryClient.invalidateQueries({ queryKey: ['my_joins'] })
    },
  })
}

export function useUnjoinAnnouncement() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (announcementId: string) => {
      const { error } = await supabase
        .from('wall_joins')
        .delete()
        .eq('announcement_id', announcementId)
        .eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wall_announcement'] })
      queryClient.invalidateQueries({ queryKey: ['my_joins'] })
    },
  })
}

export function useMyJoins() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my_joins', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wall_joins')
        .select('announcement_id')
        .eq('user_id', user!.id)
      if (error) throw error
      return new Set((data ?? []).map(j => j.announcement_id as string))
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
git add src/hooks/useWallAnnouncements.ts
git commit -m "feat: add useWallAnnouncements hook"
```

---

## Task 3: `useMySessionLocations` in useSessions.ts

**Files:**
- Modify: `src/hooks/useSessions.ts`

- [ ] **Step 1: Add import and hook at the end of `src/hooks/useSessions.ts`**

First, add `useAuth` to imports at the top of the file:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Session } from '../types'
import { useAuth } from '../providers/AuthProvider'
```

Then append at the bottom of the file:

```typescript
export function useMySessionLocations() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['session_locations', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('location')
        .eq('user_id', user!.id)
        .order('date', { ascending: false })
      if (error) throw error
      const seen = new Set<string>()
      return (data ?? [])
        .map(s => s.location as string)
        .filter(loc => loc && !seen.has(loc) && !!seen.add(loc))
    },
    enabled: !!user?.id,
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`  
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSessions.ts
git commit -m "feat: add useMySessionLocations for wall announcement autocomplete"
```

---

## Task 4: Update DashboardPage

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

This task replaces the on-wall UI section and FriendRow. Do each step carefully.

- [ ] **Step 1: Update imports**

Replace the existing `useOnWall` import line:

```typescript
import { useSetOnWall, useFriendsOnWall, useSendHype, useMyHypeCount } from '../hooks/useOnWall'
```

With:

```typescript
import { useSendHype, useMyHypeCount } from '../hooks/useOnWall'
import {
  useMyAnnouncement, useCreateAnnouncement, useClearAnnouncement,
  useFriendsAnnouncements, useJoinAnnouncement, useUnjoinAnnouncement, useMyJoins,
} from '../hooks/useWallAnnouncements'
import type { WallAnnouncement } from '../hooks/useWallAnnouncements'
import { useMySessionLocations } from '../hooks/useSessions'
import { format } from 'date-fns'
```

Also add `CalendarDays` to the lucide-react import:

```typescript
import { Trophy, CalendarDays } from 'lucide-react'
```

- [ ] **Step 2: Replace state variables and hooks in `DashboardPage` function**

Remove these lines (search for each and delete):

```typescript
  const setOnWall = useSetOnWall()
  const [wallLabelInput, setWallLabelInput] = useState('')
  const [showWallInput, setShowWallInput] = useState(false)
  const isOnWall = !!myProfile?.on_wall_at
```

Also find and remove the `useFriendsOnWall` call (it will be elsewhere in the hook block):

```typescript
  const { data: friendsOnWall = [] } = useFriendsOnWall(followingIds)
```

Replace with:

```typescript
  const { data: myAnnouncement } = useMyAnnouncement()
  const createAnnouncement = useCreateAnnouncement()
  const clearAnnouncement = useClearAnnouncement()
  const { data: friendsAnnouncements = [] } = useFriendsAnnouncements(followingIds)
  const { data: myJoins = new Set<string>() } = useMyJoins()
  const { data: sessionLocations = [] } = useMySessionLocations()
  const gradeScale = myProfile?.grade_preference ?? 'font'

  const [showWallInput, setShowWallInput] = useState(false)
  const [locationInput, setLocationInput] = useState('')
  const [labelInput, setLabelInput] = useState('')
  const [wallMode, setWallMode] = useState<'now' | 'plan'>('now')
  const [plannedAt, setPlannedAt] = useState('')
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false)

  const isLive = !!myAnnouncement && new Date(myAnnouncement.starts_at) <= new Date()
  const isPlanned = !!myAnnouncement && new Date(myAnnouncement.starts_at) > new Date()

  const handleCreateAnnouncement = () => {
    const starts_at = wallMode === 'now' ? new Date().toISOString() : new Date(plannedAt).toISOString()
    createAnnouncement.mutate(
      { location: locationInput.trim(), label: labelInput.trim() || null, starts_at },
      {
        onSuccess: () => {
          setShowWallInput(false)
          setLocationInput('')
          setLabelInput('')
          setPlannedAt('')
          setWallMode('now')
        },
      }
    )
  }

  const filteredLocations = locationInput.length > 0
    ? sessionLocations.filter(l => l.toLowerCase().includes(locationInput.toLowerCase()))
    : sessionLocations.slice(0, 5)
```

- [ ] **Step 3: Replace the on-wall UI block in the JSX**

Find and replace the entire `{/* On the Wall */}` section (from the `{isOnWall ? (` to the closing announcement button) with:

```tsx
      {/* On the Wall */}
      {isLive && myAnnouncement ? (
        <div className="bg-sage-700 text-white rounded-2xl px-4 py-3 flex items-center gap-3">
          <span className="text-xl animate-bounce">🧗</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{myAnnouncement.location}</p>
            {myAnnouncement.label && (
              <p className="text-xs text-white/60 truncate">{myAnnouncement.label}</p>
            )}
            {myHypeCount > 0 && (
              <p className="text-xs text-yellow-300 font-medium mt-0.5">🔥 {myHypeCount} hype{myHypeCount !== 1 ? 's' : ''}!</p>
            )}
          </div>
          <button
            onClick={() => clearAnnouncement.mutate(myAnnouncement.id, { onSuccess: () => {} })}
            className="text-xs text-white/60 hover:text-white font-medium"
          >
            Done
          </button>
        </div>
      ) : isPlanned && myAnnouncement ? (
        <div className="bg-sage-50 border border-sage-200 rounded-2xl px-4 py-3 flex items-center gap-3">
          <CalendarDays size={20} className="text-sage-700 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sage-800">{myAnnouncement.location}</p>
            <p className="text-xs text-sage-600">
              {format(new Date(myAnnouncement.starts_at), 'EEE d MMM, HH:mm')}
              {myAnnouncement.wall_joins.length > 0 && ` · ${myAnnouncement.wall_joins.length} joining`}
            </p>
            {myAnnouncement.label && (
              <p className="text-xs text-sage-500 truncate">{myAnnouncement.label}</p>
            )}
          </div>
          <button
            onClick={() => clearAnnouncement.mutate(myAnnouncement.id, { onSuccess: () => {} })}
            className="text-xs text-sage-600 hover:text-sage-800 font-medium"
          >
            Cancel
          </button>
        </div>
      ) : showWallInput ? (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 space-y-2">
          {/* Location input with autocomplete */}
          <div className="relative">
            <input
              autoFocus
              value={locationInput}
              onChange={e => { setLocationInput(e.target.value); setShowLocationSuggestions(true) }}
              onFocus={() => setShowLocationSuggestions(true)}
              onBlur={() => setTimeout(() => setShowLocationSuggestions(false), 150)}
              placeholder="Gym or crag (e.g. Boulder World)"
              className="w-full text-sm bg-white border border-gray-200 rounded-xl px-3 py-2"
            />
            {showLocationSuggestions && filteredLocations.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                {filteredLocations.map(loc => (
                  <button
                    key={loc}
                    type="button"
                    onMouseDown={() => { setLocationInput(loc); setShowLocationSuggestions(false) }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {loc}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Optional label */}
          <input
            value={labelInput}
            onChange={e => setLabelInput(e.target.value)}
            placeholder="What are you working on? (optional)"
            className="w-full text-sm bg-white border border-gray-200 rounded-xl px-3 py-2"
          />
          {/* Now / Plan toggle */}
          <div className="flex rounded-xl overflow-hidden border">
            {(['now', 'plan'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setWallMode(m)}
                className={`flex-1 py-1.5 text-sm font-medium transition-colors ${wallMode === m ? 'bg-sage-700 text-white' : 'bg-white text-gray-600'}`}
              >
                {m === 'now' ? '🧗 Now' : '📅 Plan'}
              </button>
            ))}
          </div>
          {wallMode === 'plan' && (
            <input
              type="datetime-local"
              value={plannedAt}
              onChange={e => setPlannedAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              className="w-full text-sm bg-white border border-gray-200 rounded-xl px-3 py-2"
            />
          )}
          <div className="flex gap-2">
            <button
              onClick={() => { setShowWallInput(false); setLocationInput(''); setLabelInput('') }}
              className="flex-1 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-xl"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateAnnouncement}
              disabled={!locationInput.trim() || (wallMode === 'plan' && !plannedAt) || createAnnouncement.isPending}
              className="flex-1 py-1.5 text-sm font-semibold bg-sage-700 text-white rounded-xl disabled:opacity-50"
            >
              {createAnnouncement.isPending ? '…' : wallMode === 'now' ? "I'm on the wall 🧗" : 'Plan session 📅'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowWallInput(true)}
          className="w-full flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2.5 text-sm text-gray-500 hover:border-gray-300 transition-colors"
        >
          <span>🧗</span>
          <span>Announce you're on the wall…</span>
        </button>
      )}
```

- [ ] **Step 4: Update `FriendRow` call in the table body**

Find the `onWall={friendsOnWall.find(...)}` prop and replace the entire FriendRow usage:

```tsx
                {friendsActivity.map((friend, i) => (
                  <FriendRow
                    key={friend.userId}
                    friend={friend}
                    last={i === friendsActivity.length - 1}
                    announcement={friendsAnnouncements.find(a => a.user_id === friend.userId) ?? null}
                    hasJoined={!!friendsAnnouncements.find(a => a.user_id === friend.userId && myJoins.has(a.id))}
                    onClick={() => setSelectedFriend(friend.userId)}
                  />
                ))}
```

- [ ] **Step 5: Replace `OnWallProfile` interface and `FriendRow` function**

Remove the `OnWallProfile` interface and replace the entire `FriendRow` function:

```typescript
interface OnWallProfile { id: string; username: string | null; avatar_url: string | null; on_wall_at: string; on_wall_label: string | null }
```

Replace `FriendRow` (from `function FriendRow` to its closing `}`) with:

```tsx
function FriendRow({ friend, last, announcement, hasJoined, onClick }: {
  friend: FriendWeeklySummary
  last: boolean
  announcement: WallAnnouncement | null
  hasJoined: boolean
  onClick: () => void
}) {
  const { data: profile } = useProfile(friend.userId)
  const sendHype = useSendHype(friend.userId)
  const joinAnnouncement = useJoinAnnouncement()
  const unjoinAnnouncement = useUnjoinAnnouncement()
  if (!profile) return null

  const now = new Date()
  const isLiveAnnouncement = !!announcement && new Date(announcement.starts_at) <= now
  const isPlannedAnnouncement = !!announcement && new Date(announcement.starts_at) > now

  return (
    <tr
      className={`cursor-pointer active:bg-gray-50 transition-colors ${last ? '' : 'border-b border-gray-100'}`}
      onClick={onClick}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="w-7 h-7 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-gray-500 font-medium text-xs flex-shrink-0">
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                : profile.username?.[0]?.toUpperCase() ?? '?'}
            </div>
            {isLiveAnnouncement && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
            )}
            {isPlannedAnnouncement && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-sage-500 rounded-full border-2 border-white flex items-center justify-center">
                <CalendarDays size={6} className="text-white" />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <span className="font-medium text-gray-900 text-sm">{profile.username}</span>
            {isLiveAnnouncement && announcement && (
              <p className="text-[10px] text-green-600 truncate max-w-[100px]">{announcement.location}</p>
            )}
            {isPlannedAnnouncement && announcement && (
              <p className="text-[10px] text-sage-600 truncate max-w-[100px]">
                {format(new Date(announcement.starts_at), 'EEE HH:mm')} · {announcement.location}
              </p>
            )}
          </div>
          {isLiveAnnouncement ? (
            <button
              onClick={e => {
                e.stopPropagation()
                sendHype.mutate(undefined, { onSuccess: () => toast.success('Hype sent! 🔥') })
              }}
              disabled={sendHype.isPending}
              className="ml-auto text-xs bg-khaki-100 text-khaki-700 px-2 py-0.5 rounded-full font-semibold"
            >
              🔥 Hype
            </button>
          ) : isPlannedAnnouncement && announcement ? (
            <button
              onClick={e => {
                e.stopPropagation()
                if (hasJoined) {
                  unjoinAnnouncement.mutate(announcement.id)
                } else {
                  joinAnnouncement.mutate(announcement.id, { onSuccess: () => toast.success('Joined! 📅') })
                }
              }}
              disabled={joinAnnouncement.isPending || unjoinAnnouncement.isPending}
              className={`ml-auto text-xs px-2 py-0.5 rounded-full font-semibold ${
                hasJoined
                  ? 'bg-sage-100 text-sage-700'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {hasJoined ? '✓ Joined' : '📅 Join'}
            </button>
          ) : (
            <span className="text-gray-300 ml-auto text-base">›</span>
          )}
        </div>
      </td>
      <td className="text-center px-2 py-3 font-semibold text-gray-800">{friend.problems}</td>
      <td className="text-center px-2 py-3">
        {friend.sends > 0
          ? <span className="font-semibold text-gray-800">{friend.sends}</span>
          : <span className="text-gray-300">—</span>}
      </td>
      <td className="text-center px-2 py-3">
        {friend.challengeAttempts > 0 ? (
          <span className="font-semibold text-gray-800">
            {friend.challengesCompleted > 0
              ? <span>{friend.challengesCompleted}<span className="text-gray-400 font-normal">/{friend.challengeAttempts}</span></span>
              : friend.challengeAttempts}
          </span>
        ) : <span className="text-gray-300">—</span>}
      </td>
    </tr>
  )
}
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
git commit -m "feat: replace on-wall profile fields with wall_announcements, add location autocomplete and planned sessions"
```

---

## Manual Verification Checklist

- [ ] Clicking "Announce you're on the wall…" opens the new form
- [ ] Location input shows autocomplete from past session locations
- [ ] "Now" mode submits with `starts_at = now()`
- [ ] "Plan" mode reveals a datetime picker and submits with the chosen future time
- [ ] Live banner: shows location, label, hype count, Done button
- [ ] Planned banner: shows location, formatted date/time, join count, Cancel button
- [ ] FriendRow: live friend shows green dot + location + Hype button
- [ ] FriendRow: planned friend shows calendar dot + location + time + Join button
- [ ] Tapping Join toggles to "✓ Joined", tapping again unjoins
- [ ] Clearing/cancelling removes the announcement
