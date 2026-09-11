# Instagram Handle on a Gym — Design

**Date:** 2026-09-10
**Status:** approved

## Summary

Give a gym in the registry an Instagram handle, set by an admin in Gyms admin,
and show it as a glyph next to the gym name on the **boulder page**
(`/gym-problems/:id`).

Sibling of [the climber-handle feature](2026-09-10-profile-instagram-link-design.md),
shipped the same day. That one reuses nothing from this; this one reuses almost
everything from that one.

## How this serves learning

The one thing on a gym's Instagram that teaches movement is the **new-set
video**. You are looking at a boulder from one of that gym's sets; the glyph
says "the rest of this set, on video, over here."

**Vision tension, stated:** a gym's feed is a business's marketing channel, and
that is further from "make the beta the hero" than a climber's handle is — a
climber's handle at least hangs off a piece of beta they wrote. CLAUDE.md also
rejects gym-wide context parked on a boulder, which is nearly where this lands.
Two things keep it on the right side: the link sits on the gym's own name in the
boulder's meta line rather than claiming space of its own, and it is a link, not
a statistic. It surfaces nowhere else.

## Data

### Migration `094_gym_instagram.sql`

```sql
alter table gyms add column if not exists instagram_handle text;

alter table gyms drop constraint if exists gyms_instagram_handle_format;
alter table gyms add constraint gyms_instagram_handle_format
  check (instagram_handle is null or instagram_handle ~ '^[A-Za-z0-9._]{1,30}$');
```

A charset-and-length guard, character-identical to `HANDLE` in
`src/utils/instagram.ts` and to the constraint on `profiles.instagram_handle`
(093). Its real job is that a stored value can never contain the characters
that would let it escape the `https://instagram.com/` prefix the client builds.
A well-formed-but-unissued handle can still be stored and renders a dead link.

### The write path

`gyms` has a SELECT policy and **no INSERT/UPDATE/DELETE policy at all** — 092
made that choice deliberately, so every write goes through a `SECURITY DEFINER`
function. A client therefore cannot write this column directly, and adding a
policy is not on the table. New function, shaped exactly like
`set_gym_verified`:

```sql
create or replace function public.set_gym_instagram(p_id uuid, p_handle text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_gym_admin();
  update public.gyms
     set instagram_handle = nullif(btrim(coalesce(p_handle, '')), '')
   where id = p_id;
  if not found then
    raise exception 'No such gym';
  end if;
end;
$$;

revoke execute on function public.set_gym_instagram(uuid, text) from public, anon;
grant  execute on function public.set_gym_instagram(uuid, text) to authenticated;
```

`nullif(btrim(...))` means clearing the field stores `null` rather than `''`,
so the constraint never sees an empty string. The revoke matches 092's stated
posture: `CREATE FUNCTION` grants EXECUTE to PUBLIC, so the explicit grant
narrows nothing on its own.

`set_gym_instagram` is deliberately **not** folded into `rename_gym`. A rename
rewrites a gym string across twelve columns; a handle write touches one field
on one row.

The file ends with a `do` block that calls `set_gym_instagram` once and rolls
back, because **a plpgsql body is not validated at CREATE** — a migration can
apply perfectly clean and the function still raise on its first call. 092 sets
this precedent at length.

### What a merge does to a handle

`merge_gyms` folds one gym into another. The source's handle is discarded and
the target's wins — the same treatment `gym_gradings` gets. No special handling
is added: a merge means the two rows were one building, so one handle is
correct.

### Release gate

Migration 094 is applied by hand in the Supabase dashboard and must be applied
before the client that reads the column is deployed.

**This gate is soft, and that is a design choice.** The handle is read by its
own dedicated query, not by the boulder query. Before 094 is applied, that one
query fails, `useGymInstagramHandles` has no data, and the glyph is simply
absent — nothing else on the boulder page changes, no other data is lost, and
no name degrades. Contrast 093, where the column rode inside the boulder-beta
profiles select whose error is swallowed, so an unapplied migration silently
turned every beta author into "Someone".

## Reuse — this feature adds no new pure logic

Already built and tested for 093:

- `parseInstagramHandle(input): InstagramParse` and `instagramUrl(handle)` in
  `src/utils/instagram.ts` — both handle-agnostic. The gym admin input uses the
  same three states: `empty` clears, `ok` saves, `invalid` toasts and changes
  nothing.
- `<InstagramLink handle={...} />` in `src/components/InstagramLink.tsx` — the
  glyph, the `target="_blank" rel="noopener noreferrer"`, the accessible label,
  the propagation stop and the enlarged tap target.

Nothing new is worth extracting into a util, so **no new tests**. The suite
stays at its current count; `src/utils/instagram.test.ts` already covers the
one piece of logic in this feature that can be wrong.

## Reading the handle — `useGymInstagramHandles`

One app-wide cached query, modelled on `useSetterUserIds`:

```ts
select label, instagram_handle from gyms
 where instagram_handle is not null and merged_into is null
```

returning `Map<label, handle>`, with a `staleTime` in the same range as
`useSetterUserIds` (5 minutes). `gyms.label` is the join key everywhere in this
app, so a label is what every caller already has.

`merged_into is null` matters: a folded-away duplicate still has a row, and
without the filter it could supply a handle for a label the app no longer
writes.

A thin `<GymInstagramLink gym={label} />` consults the map and renders
`<InstagramLink>` or nothing — droppable next to any gym name anywhere, exactly
as `SetterBadge` is droppable next to any name.

## UI

### Boulder page — the only climber-facing surface

`src/pages/CrewPage.tsx`, the meta line that currently reads
`{boulder.gym && <><span>·</span><span>{boulder.gym}</span></>}`. The glyph goes
immediately after the gym name at `size={13}`, matching that line's small type.

### Gyms admin — where it is set

`src/components/GymsAdmin.tsx`, inside the existing per-gym sheet — already
admin-only, already open on the gym you mean, and reached from the pencil
button on each row. An `@`-prefixed input below the city field, its current
value read from the `useGymInstagramHandles` map, saving through a
`useSetGymInstagram` mutation built with the file's existing `useGymMutation`
helper (whose `invalidateQueries()` already refreshes the handle map).

**The handle saves on its own, on blur and on Enter — not via the sheet's Save
button.** That button calls `rename_gym`, which rewrites a gym string across
twelve columns; a handle write must not ride along with it, and an admin who
only wanted to fix a handle must not trigger a rename. This also matches how
the same field behaves on `/profile`.

Because the sheet now edits more than the name, three labels change with it:
the component becomes `EditGymSheet`, the `BottomSheet` title becomes
`Edit gym`, and the row button's `title`/`aria-label` become `Edit` /
`Edit {gym.label}`. The pencil icon already reads as "edit", so nothing moves.

Copy matches `/profile` so the two editors read as one feature — the toasts
`Instagram saved` / `Instagram removed` / `That doesn't look like an Instagram
handle` are identical. The placeholder is the one deliberate divergence:
`gym.handle`, not `/profile`'s `your.handle`, because an admin editing this
field is never editing their own.

`gym_suggestions()` is **not** touched. Widening its return type would mean
`DROP FUNCTION` + recreate, and 092 warns explicitly that the deployed client
breaks during that window. Reading the handle from the separate cached query
avoids the whole problem.

## Out of scope

- Not in the gym pickers (`GymPicker`, `GymBoulderPicker`, `AddGymSheet`) — a
  picker is transient, and an outbound link inside one fights the tap the
  climber came to make.
- Not in Default Gyms on `/profile`, not on the session pages, not on the home
  strip.
- No per-gym page. No climber-facing edit path — admins only, via
  `assert_gym_admin`.
- `gym_suggestions()` and `GymOption` unchanged.
- No second social network.

## Verification

1. `npx vitest run` — unchanged count; this feature adds no pure logic.
2. `npm run build` — `noUnusedLocals`/`noUnusedParameters` are on.
3. `npm run lint` — baseline measured at **16 problems (15 errors, 1 warning)**
   on branch `feature/gym-instagram` on 2026-09-10; new work adds zero.
4. Manual pass at phone width, after 094 is applied: in Gyms admin, open a
   gym's rename sheet, save a handle, confirm the toast; open a boulder at that
   gym and confirm the glyph sits after the gym name and opens Instagram in a
   new tab; confirm a boulder at a gym with no handle shows no glyph and no gap;
   clear the handle in admin and confirm the glyph disappears.
