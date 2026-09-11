-- A gym's Instagram handle, shown beside the gym name on the boulder page.
-- The one thing on a gym's feed that teaches movement is the new-set video:
-- you are looking at a boulder from one of that gym's sets, and this points at
-- the rest of it. Design:
-- docs/superpowers/specs/2026-09-10-gym-instagram-design.md
--
-- Stored as the bare handle, never a URL — the client builds the href from it
-- (src/utils/instagram.ts), so this column cannot point anywhere but Instagram.
--
-- RELEASE GATE: apply before deploying the client that reads the column. The
-- gate is SOFT by design: the handle is read by its own dedicated query
-- (useGymInstagramHandles), not by the boulder query, so until this lands that
-- one query fails, the glyph is absent, and nothing else on the boulder page
-- changes. Contrast 093, which rode inside a select whose error is swallowed
-- and so silently turned every beta author into "Someone".

alter table gyms add column if not exists instagram_handle text;

-- A charset-and-length guard, character-identical to HANDLE in
-- src/utils/instagram.ts and to the same constraint on profiles (093). Its real
-- job is that a stored value can never hold the characters that would let it
-- escape the https://instagram.com/ prefix the client builds. A well-formed but
-- unissued handle (a lone '.', a trailing dot) still stores, and renders a dead
-- link. Dropped first so this file stays re-runnable after a failed apply.
alter table gyms drop constraint if exists gyms_instagram_handle_format;
alter table gyms add constraint gyms_instagram_handle_format
  check (instagram_handle is null or instagram_handle ~ '^[A-Za-z0-9._]{1,30}$');

-- gyms has a SELECT policy and NO insert/update/delete policy at all (092), so
-- every write goes through a SECURITY DEFINER function. This is
-- set_gym_verified's shape exactly, admin guard included. Kept separate from
-- rename_gym on purpose: a rename rewrites a gym string across twelve columns,
-- while this touches one field on one row, and an admin fixing a handle must
-- not trigger a rename.
--
-- nullif(btrim(...)) means clearing the field stores null rather than '', so the
-- check constraint never sees an empty string.
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

-- CREATE FUNCTION grants EXECUTE to PUBLIC and grants are cumulative, so the
-- grant below narrows nothing by itself — the revoke is what does. Same posture
-- as every function in 092.
revoke execute on function public.set_gym_instagram(uuid, text) from public, anon;
grant  execute on function public.set_gym_instagram(uuid, text) to authenticated;

-- A plpgsql body is not validated at CREATE: this file can apply perfectly
-- clean and set_gym_instagram still raise on its first call. So call it once
-- and roll back. A block with an EXCEPTION clause is a savepoint, so catching
-- the final raise below undoes everything this block did, smoke gym included.
-- Stricter than 092's smoke block, which cleans up its rows explicitly instead:
-- unwinding the savepoint cannot leave debris behind even on a mid-paste failure.
do $$
declare
  v_gym   uuid;
  v_admin uuid;
begin
  insert into public.gyms (name, city, label, canonical_key)
  values ('Smoke Test Instagram Wall', null, 'Smoke Test Instagram Wall',
          public.fold_gym_text('Smoke Test Instagram Wall'))
  returning id into v_gym;

  -- Applied by hand there is no JWT, so auth.uid() is null and assert_gym_admin
  -- would raise on the very first line of set_gym_instagram's body — the update
  -- that does the real work, and the assertions that prove it, would never run.
  -- Borrow a real profiles.id the way 092 does, so the body is actually
  -- exercised here rather than only at its guard.
  select p.id into v_admin from public.profiles p where p.is_admin = true order by p.id limit 1;

  if v_admin is null then
    raise notice 'smoke: no profile has is_admin, so set_gym_instagram is NOT exercised here — its body is parsed for the first time on its first real call. Watch the first save in the admin UI.';
  else
    -- Impersonate so the guard passes and the real body runs. Every write
    -- below stays confined to the smoke gym inserted above, which this block
    -- rolls back along with everything else.
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

    perform public.set_gym_instagram(v_gym, '  moresends  ');
    assert (select instagram_handle from public.gyms where id = v_gym) = 'moresends',
      'set_gym_instagram did not store the trimmed handle';
    perform public.set_gym_instagram(v_gym, '');
    assert (select instagram_handle from public.gyms where id = v_gym) is null,
      'set_gym_instagram did not clear on empty input';
    raise notice 'set_gym_instagram ran end to end (admin profile in scope): stored, trimmed, and cleared';

    -- Drop the borrowed identity before anything else runs.
    perform set_config('request.jwt.claims', json_build_object('sub', null)::text, true);
  end if;

  -- The column and its constraint, exercised directly rather than through the
  -- admin-gated function, so this runs regardless of who is applying the file.
  update public.gyms set instagram_handle = 'moresends' where id = v_gym;
  assert (select instagram_handle from public.gyms where id = v_gym) = 'moresends',
    'instagram_handle did not store a valid handle';

  begin
    update public.gyms set instagram_handle = 'not a handle' where id = v_gym;
    raise exception 'gyms_instagram_handle_format accepted a malformed handle';
  exception when check_violation then
    raise notice 'gyms_instagram_handle_format rejected a malformed handle, as expected';
  end;

  raise exception 'smoke complete, rolling back';
exception when others then
  if sqlerrm <> 'smoke complete, rolling back' then
    raise;
  end if;
  if v_admin is null then
    raise notice 'set_gym_instagram smoke: column and constraint exercised directly; set_gym_instagram body and its admin guard NOT exercised (no admin profile in scope), all rolled back. READ THE NOTICES ABOVE.';
  else
    raise notice 'set_gym_instagram smoke: function body, admin guard, column and constraint all exercised, all rolled back. READ THE NOTICES ABOVE.';
  end if;
end $$;
