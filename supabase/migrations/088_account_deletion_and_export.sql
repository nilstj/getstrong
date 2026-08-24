-- Two rights the app has never honoured: take my data, delete my account.
--
-- Both functions are `security definer` so they can reach past RLS (and, for
-- deletion, into auth.users), and both pin search_path so an unqualified name
-- can't be hijacked by a caller-controlled schema. Both raise on an anonymous
-- caller and are executable only by `authenticated`.

-- ── export ──────────────────────────────────────────────────────────────────
-- Table discovery rather than a hand-written list of 45 tables: this schema is
-- 88 migrations deep and gains tables constantly, and a stale export is a
-- wrong answer to a data request rather than a missing feature. The catch is
-- that 8 of 67 tables match none of the obvious owner columns, so `profiles`
-- (owner column is `id`) and `problem_tag_assignments` (owned only through
-- `problem_id`) are handled explicitly, `app_settings`, `grade_mappings` and
-- `gym_gradings` are deliberately excluded as global config, and the envelope
-- reports anything else it couldn't reach in `unmapped_tables`.

create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid   := auth.uid();
  v_owner    text[] := array[
    'user_id','created_by','creator_id','voter_id','recipient_id','actor_id',
    'requester_id','follower_id','following_id','invited_user','invited_by',
    'added_by','opened_by','partner_id','from_user_id','to_user_id'];
  v_handled  text[] := array['app_settings','grade_mappings','gym_gradings',
                             'profiles','problem_tag_assignments'];
  v_data     jsonb  := '{}'::jsonb;
  v_unmapped text[] := '{}';
  v_rows     jsonb;
  r          record;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  for r in
    select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public'
       and t.table_type = 'BASE TABLE'
       and c.column_name = any (v_owner)
     order by c.table_name, c.column_name
  loop
    -- %I quoting plus the bound $1 are what keep this from being a hole
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

  select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_rows
    from profiles p where p.id = v_uid;
  v_data := jsonb_set(v_data, array['profiles'], v_rows, true);

  select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into v_rows
    from problem_tag_assignments a
   where a.problem_id in (select id from problems where user_id = v_uid);
  v_data := jsonb_set(v_data, array['problem_tag_assignments'], v_rows, true);

  select coalesce(array_agg(t.table_name order by t.table_name), '{}')
    into v_unmapped
    from information_schema.tables t
   where t.table_schema = 'public'
     and t.table_type = 'BASE TABLE'
     and t.table_name <> all (v_handled)
     and not exists (
       select 1 from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = t.table_name
          and c.column_name = any (v_owner));

  return jsonb_build_object(
    'generated_at',    now(),
    'user_id',         v_uid,
    'data',            v_data,
    'unmapped_tables', v_unmapped
  );
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

-- ── deletion ────────────────────────────────────────────────────────────────
-- The auth.users delete IS the deletion: 34 `on delete cascade` FKs take the
-- owned rows, and the 9 `on delete set null` authorship columns anonymise the
-- shared ones, so published beta and boulders stay on the wall for the
-- climbers using them.
--
-- The storage sweep here is a backstop only. The client removes its own
-- objects through the storage API first, which is what actually deletes the
-- files; anything it missed loses its row here, so no public URL outlives the
-- account.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  delete from storage.objects
   where bucket_id in ('avatars', 'problem-images')
     and (storage.foldername(name))[1] = v_uid::text;

  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
