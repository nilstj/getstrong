# Friend Badges in Feed Design

**Date:** 2026-06-18  
**Status:** Approved

## Summary

Show each friend's earned helper badges (🤲 🤲 💦 🧗 🏆) directly in the friends feed summary table so everyone can see at a glance who gives great beta — without having to tap through to their profile.

## Scope

- **Where:** Athlete column in the friends feed summary table (`FriendRow`)
- **What:** All earned badge emojis shown as a small line below the username
- **Empty state:** Friends with no badges show nothing — no extra space
- **One file changes:** `src/pages/DashboardPage.tsx`

## Design

### Data

`useUserBadges(userId)` in `src/hooks/useBadges.ts` already accepts an optional `userId` and queries `user_badges` filtered by that ID. Call it inside `FriendRow` with `friend.userId` — same pattern as the existing `useProfile(friend.userId)` call already in that component.

`BADGES` (the ordered array of `{ key, emoji, ... }`) is exported from `src/types/index.ts` and gives the canonical display order (Spotter → Beta Sprayer → Crux Crusher → Beta Legend).

### UI

In `FriendRow`, inside the Athlete `<td>` username `<div>`, after the existing username `<span>`, add:

```tsx
{earnedEmojis.length > 0 && (
  <p className="text-sm leading-none mt-0.5">{earnedEmojis.join(' ')}</p>
)}
```

Where `earnedEmojis` is derived by filtering `BADGES` to those whose `key` is in the friend's `badges` result, then mapping to `.emoji`. This preserves the canonical badge order regardless of `earned_at` ordering from the DB.

### Imports to add to `DashboardPage.tsx`

```ts
import { useUserBadges } from '../hooks/useBadges'
import { BADGES } from '../types'
```

### No empty-space regression

The badge line only renders when `earnedEmojis.length > 0`. The announcement location/time lines that already conditionally appear below the username are unaffected — badges appear between the username and any announcement text.

## What Is Not Changing

- The detail sheet (`FriendDetailSheet`) — badges not added there
- `useBadges.ts` — no changes needed
- Power Rankings, summary columns — untouched
