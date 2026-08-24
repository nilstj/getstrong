# Account deletion and data export — leaving, and taking your log with you

**Date:** 2026-08-24
**Status:** design, approved
**Depends on:** `supabase/migrations/087_erasure_fks_and_storage_owner_policies.sql`
(without it, deleting a user raises a not-null violation)

## How this serves learning

It doesn't, and pretending otherwise would be worse than admitting it. This is
plumbing: the two rights every user of a logbook has — take my data, delete my
account — and neither exists today. The only account action in the app is sign
out.

The nearest on-vision framing is honest enough to keep: **beta is worth
contributing only if contributing it isn't a trap.** A climber who can leave
with their log intact, and who knows their beta outlives them on the boulder
rather than vanishing, has one less reason to hold back. That is the reason the
deletion model anonymises instead of deleting — see decision 1.

## Decisions taken — overrule on review

1. **Deletion anonymises contributions; it does not delete them.** Betas,
   published boulders, variations and comments survive with the author nulled,
   because the alternative strips beta off boulders other climbers are actively
   using and takes the boulder with it. This is what migration 087 already set
   up, and what the schema's nine existing `on delete set null` authorship
   columns have always implied. Once the user id is gone the row is no longer
   personal data, so anonymising is a complete answer to erasure, not a dodge.
2. **Deletion is immediate and irreversible, gated by typing your username.**
   No 30-day grace period: a soft-delete state would have to be threaded
   through every read path in the app, and one missed query means a "deleted"
   account still showing up on a leaderboard. A typed confirmation is the
   cheapest guard that actually stops an accidental tap.
3. **No service-role key.** The obvious Supabase recipe is a Vercel function
   holding `SUPABASE_SERVICE_ROLE_KEY` and calling `auth.admin.deleteUser`.
   Rejected: that key bypasses RLS entirely, and `api/` already contains two
   unauthenticated endpoints. A `security definer` function owned by `postgres`
   can delete from `auth.users` on its own, so the key never has to exist.
4. **The export discovers its own tables.** A hand-listed export would name ~45
   tables and go stale on the next migration — and a stale export is a wrong
   answer to a data request, not a missing feature. The function walks
   `information_schema` instead. See "The blind-spot problem" for why that isn't
   the whole story.
5. **Points are exported, not explained.** `beta_points` rows go in the export
   as they are. No derived totals, no leaderboard position — the export is a
   record of what is stored, not a report.

## The blind-spot problem

Discovery by owner-column name looked complete until it was checked against the
schema. Of 67 tables, **8 match none of the obvious owner columns**:

| Table | Why | Handling |
|---|---|---|
| `profiles` | owner column is `id` | special case: `id = auth.uid()` |
| `challenges`, `shared_projects` | use `creator_id` | add `creator_id` to the owner set |
| `hype_messages` | uses `from_user_id` / `to_user_id` | add both to the owner set |
| `problem_tag_assignments` | owned transitively via `problem_id` | special case: one join through `problems` |
| `app_settings`, `grade_mappings`, `gym_gradings` | global config and lookups, no personal data | **deliberately excluded** |

So the owner set is `user_id`, `created_by`, `creator_id`, `voter_id`,
`recipient_id`, `actor_id`, `requester_id`, `follower_id`, `following_id`,
`invited_user`, `invited_by`, `added_by`, `opened_by`, `partner_id`,
`from_user_id`, `to_user_id` — plus two named special cases and three
deliberate exclusions.

That table is the part of this design most likely to rot, so the function
**reports its own blind spots**: the envelope carries an `unmapped_tables` list
naming every public base table that matched no rule and isn't on the excluded
list. A future migration introducing a novel owner column shows up in the next
export as a named gap instead of a silent omission. Keying results by
`table.column` rather than by table also matters: `follows` is reached through
both `follower_id` and `following_id`, and both sides are your data.

## The functions

Both live in migration `088`, are `security definer` with `set search_path =
public`, raise on an anonymous caller, and are executable only by
`authenticated`.

```sql
create or replace function public.export_my_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_data jsonb := '{}'::jsonb;
  v_unmapped text[] := '{}';
  v_rows jsonb;
  r record;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  -- One pass over every (table, owner column) pair. %I quoting and the bound
  -- $1 are what keep the dynamic SQL from being a hole; search_path is pinned
  -- above so an unqualified name can't be hijacked.
  for r in
    select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
       and c.column_name = any (array[
         'user_id','created_by','creator_id','voter_id','recipient_id','actor_id',
         'requester_id','follower_id','following_id','invited_user','invited_by',
         'added_by','opened_by','partner_id','from_user_id','to_user_id'])
     order by c.table_name, c.column_name
  loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from %I t where t.%I = $1',
      r.table_name, r.column_name)
      into v_rows using v_uid;
    if jsonb_array_length(v_rows) > 0 then
      -- keyed by table.column, so both sides of `follows` survive
      v_data := jsonb_set(v_data,
        array[r.table_name || '.' || r.column_name], v_rows, true);
    end if;
  end loop;

  -- the two special cases from the table above
  select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_rows
    from profiles p where p.id = v_uid;
  v_data := jsonb_set(v_data, array['profiles'], v_rows, true);

  select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into v_rows
    from problem_tag_assignments a
   where a.problem_id in (select id from problems where user_id = v_uid);
  v_data := jsonb_set(v_data, array['problem_tag_assignments'], v_rows, true);

  -- self-reported blind spots: any public base table no rule reached
  select coalesce(array_agg(t.table_name order by t.table_name), '{}')
    into v_unmapped
    from information_schema.tables t
   where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
     and t.table_name <> all (array['app_settings','grade_mappings','gym_gradings',
                                    'profiles','problem_tag_assignments'])
     and not exists (
       select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = t.table_name
          and c.column_name = any (array[
            'user_id','created_by','creator_id','voter_id','recipient_id','actor_id',
            'requester_id','follower_id','following_id','invited_user','invited_by',
            'added_by','opened_by','partner_id','from_user_id','to_user_id']));

  return jsonb_build_object(
    'generated_at', now(), 'user_id', v_uid,
    'data', v_data, 'unmapped_tables', v_unmapped
  );
end $$;
```

```sql
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  -- backstop only: the client removes its own objects through the storage API
  -- first, which deletes the actual files. Anything missed loses its row here,
  -- so no public URL outlives the account.
  delete from storage.objects
   where bucket_id in ('avatars', 'problem-images')
     and (storage.foldername(name))[1] = v_uid::text;
  delete from auth.users where id = v_uid;
end $$;
```

The `auth.users` delete is the whole deletion: 34 `on delete cascade` FKs take
the owned rows, and the `on delete set null` columns anonymise the shared ones.

## Client

**`src/hooks/useMyData.ts`** — `useExportMyData()` calls the RPC, wraps the
result in a Blob and triggers a download. `useDeleteMyAccount()` lists and
removes `<uid>/` in both buckets, calls the RPC, then signs out and redirects to
`/login`. Storage first: if it fails, the account still exists and the user can
retry, which is the recoverable ordering.

**`src/pages/ProfilePage.tsx`** — a "Your data" section above the existing sign
out button: *Download my data*, and *Delete my account* opening a `BottomSheet`
(a sibling of the heading, not inside it) that requires typing the username.

## Pure functions to test

Per the repo constraint, logic worth testing gets extracted into `src/utils/`
and TDD'd there; the hooks and the sheet are covered by `npm run build` and a
manual pass.

- `exportFilename(date)` → `moresends-export-2026-08-24.json`
- `summariseExport(envelope)` → `{ rowCount, tableCount, unmapped }`, shown
  before the download so the user sees what they're getting
- `deletionConfirmationMatches(typed, username)` → trimmed, case-insensitive;
  guards a destructive action, so it gets tests before it gets a caller

## Failure modes

| Failure | Behaviour |
|---|---|
| Export RPC fails | toast, nothing downloaded, account untouched |
| Storage delete fails | abort before the RPC; account intact, toast asks to retry |
| RPC succeeds, sign-out fails | session is already invalid; force `/login` regardless |
| `unmapped_tables` non-empty | rendered in the UI as a note, not swallowed |

## Release gate

Migration `088` must be applied in the Supabase dashboard **before** the client
that calls these RPCs deploys, or both buttons 404 at the API. It must be run
as `postgres` (the dashboard SQL editor default) so the functions are owned by
a role permitted to delete from `auth.users`.

## Out of scope

Privacy policy, signup consent and the age gate (the next piece of work, and
the one with a legal deadline attached); the `problems` visibility model; the
Groq disclosure.
