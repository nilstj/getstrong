# Instagram Handle on Beta — Design

**Date:** 2026-09-10
**Status:** approved

## Summary

Let a climber save their Instagram handle on their profile, and show it as a
small glyph next to their name on the **beta they post on a shared boulder**.
You watched someone's beta; the glyph takes you to where the rest of their clips
live.

## How this serves learning

Beta video in this app is already an external Instagram/YouTube link. A handle
on the beta author turns one clip into a channel: the climber who taught you a
move on this boulder has more of the same a tap away. The link is attached to
the teaching, not to the tick.

**Vision tension, stated:** a bare "follow me" link on a profile is an
ornament, and profile ornaments are the vanity-metric shape. This design keeps
it on-vision by attaching the link to **beta authorship only** and by wording it
as *where your beta clips live* — not as a social-media badge. It is deliberately
absent from the feed, the leaderboards, the roster and user search.

## Data

### Migration `093_profile_instagram.sql`

```sql
alter table profiles add column if not exists instagram_handle text;

alter table profiles add constraint profiles_instagram_handle_format
  check (instagram_handle is null or instagram_handle ~ '^[A-Za-z0-9._]{1,30}$');
```

The check constraint mirrors Instagram's own handle rule (letters, digits,
periods, underscores, 1–30 chars). It is the real guard: a malformed value
cannot be stored even if the client is bypassed, so nothing downstream has to
re-validate before building a URL.

**No new RLS policy is needed.** `profiles` already carries, from migration
002, `users can update own profile` (USING and WITH CHECK on `auth.uid() = id`),
so the client update lands rather than silently no-opping.

**Visibility:** `profiles` is SELECT-able by any authenticated user, so a saved
handle is readable by every signed-in climber. That is intended — it is a link
the climber chose to publish.

**Data export:** `export_my_data` (migration 088) serialises the profile row
with `to_jsonb(p)`, so `instagram_handle` appears in the export with no change
to that function.

### Release gate

Migration 093 is applied by hand in the Supabase dashboard and **must be applied
before the client that reads the column is deployed.** The client selects
`instagram_handle` inside the boulder-beta query, so deploying first breaks the
**beta tab on the boulder page** — the same failure mode migration 090 had.

## Pure logic — `src/utils/instagram.ts`

```ts
export type InstagramParse =
  | { status: 'empty' }                  // cleared — store null
  | { status: 'ok'; handle: string }
  | { status: 'invalid' }

export function parseInstagramHandle(input: string): InstagramParse
export function instagramUrl(handle: string): string
```

`parseInstagramHandle` trims, strips a leading `@`, strips an
`instagram.com/`-style prefix (with or without scheme, `www.`/`m.`, trailing
slash, query string), and validates what remains against the same regex as the
database constraint. Case is preserved as typed — Instagram handles are
case-insensitive, and echoing the climber's own capitalisation avoids a
surprise in how their name reads.

Three explicit statuses exist so that "the climber cleared the field" and "the
climber typed something wrong" never collapse into one nullable return.

`instagramUrl` builds `https://instagram.com/<handle>`. **The app always
constructs the href from the stored handle**, so a stored value can never point
at a host other than instagram.com.

Accepted: `nils`, `@nils`, `  @nils  `, `instagram.com/nils`,
`https://www.instagram.com/nils/`, `https://instagram.com/nils?hl=en`,
`http://m.instagram.com/nils`.
Rejected: `nils/photos`, `nils@x`, `nils climbs`, `instagram.com/p/abc123` (a
post, not a profile — the residual `p/abc123` contains a slash), anything over
30 chars.
Empty: `''`, whitespace, and a lone `@` — the input renders an `@` prefix, so a
climber clearing the field may well leave the sigil behind; that reads as
"remove it", not as a typo.

Tested with Vitest, per the repo rule that only pure functions in `src/utils/`
are tested.

## UI

### Editor — `/profile`

A new block in the stacked settings column, below Default Gyms, following the
established pattern there (small uppercase label above the control).

- Label: **Instagram**
- Helper copy: **"Where your beta clips live — shown on beta you post."**
- An `@`-prefixed text input; saves on Enter and on blur.
- `ok` → save the handle, success toast.
- `empty` → save `null` (clears it), success toast.
- `invalid` → `toast.error("That doesn't look like an Instagram handle")`, and
  the stored value is left alone.

`instagram_handle` is added to the `Profile` interface and to the key set
`useUpdateProfile` accepts.

### Glyph — beta author on the boulder page

The only outbound surface.

- `useBoulderBeta`: add `instagram_handle` to the profiles select that the hook
  already issues (`src/hooks/useBoulderBeta.ts`, the `.in('id', allIds)` query),
  add `authorInstagram: string | null` to the `BetaThread` type, and map it
  where `authorName`/`authorAvatarUrl` are mapped. No extra round trip. The
  comment/reply type is untouched.
- New `src/components/InstagramLink.tsx`, modelled on `SetterBadge`: takes a
  handle, renders the `lucide-react` `Instagram` icon inside
  `<a target="_blank" rel="noopener noreferrer">` with
  `aria-label="@<handle> on Instagram"`, returns `null` when the handle is null,
  and calls `stopPropagation` on click so it can sit inside a tappable card.
- Placed immediately after `<SetterBadge>` in the `BetaThreadCard` author row,
  `size={14}`, `text-gray-400 hover:text-sage-700`. That row already ends in a
  `flex-1` spacer, so adding one item reflows nothing.
- It renders on the viewer's own beta too — harmless, and it confirms the handle
  saved.

## Out of scope

- No glyph in the home feed, the leaderboards, the session roster, the friends
  list or user search.
- Nothing on beta replies/comments — a thread of six replies would become a row
  of six glyphs competing with the beta text.
- No verification that the Instagram account exists.
- Other social networks.
- `src/lib/profiles.ts` (`profilesByIds`) is not extended; only the beta hook
  needs the column.

## Verification

1. `npx vitest run src/utils/instagram.test.ts` — the parser's table of cases.
2. `npm run build` — `noUnusedLocals`/`noUnusedParameters` are on, so an unused
   local is a build failure.
3. `npm run lint` — baseline measured on this branch before starting; new work
   adds zero problems.
4. Manual pass at phone width: save a handle on `/profile`; reload and confirm
   it persisted; post beta on a shared boulder; the glyph appears next to your
   name; tapping it opens the Instagram profile in a new tab; clear the handle
   and confirm the glyph disappears.
