-- Caution beta: a "watch out" on a shared boulder is a KIND OF BETA, not a
-- hazard flag. The climber names the move that hurts people and says what to do
-- instead, which is movement knowledge; "careful on this one" is not.
--
-- It lives on boulder_beta rather than in a table of its own so it inherits
-- that table's own-writes RLS, its `on delete cascade` to gym_problems (a
-- caution dies when the boulder is stripped or expires, so there is no stale
-- warning to retire), and the beta_posted guard that stops points being farmed.
--
-- The move is the subject, never the injury: no body part, no severity, no
-- diagnosis, and nothing about a third party. Corroboration count carries the
-- weight a severity scale would, and asks nobody for their medical history.

-- ── 1. columns ───────────────────────────────────────────────────────────────
alter table boulder_beta
  add column if not exists kind text not null default 'beta',
  add column if not exists risk_move text;

alter table boulder_beta drop constraint if exists boulder_beta_kind_check;
alter table boulder_beta add constraint boulder_beta_kind_check
  check (kind in ('beta', 'caution'));

-- A caution needs a move AND words about it; a plain beta carries no move.
-- Existing rows take kind='beta' with risk_move null, so this validates against
-- live data with no backfill.
alter table boulder_beta drop constraint if exists boulder_beta_caution_shape;
alter table boulder_beta add constraint boulder_beta_caution_shape check (
  (kind = 'beta' and risk_move is null)
  or (kind = 'caution'
      and risk_move is not null and btrim(risk_move) <> ''
      and body is not null and btrim(body) <> '')
);

-- Mirrors gym_problem_help_open_idx (057): the badge counts cautions per boulder.
create index if not exists boulder_beta_caution_idx
  on boulder_beta (gym_problem_id) where kind = 'caution';

-- ── 2. "me too" is free ──────────────────────────────────────────────────────
-- Reproduces 074 §4c's mark_beta_worked and adds ONE guard: a caution pays
-- nobody for being confirmed. Paying would put a price on the count that drives
-- the ⚠️ badge, which is the one number here that must not be worth farming.
-- Posting is unaffected — award_beta_posted (074 §4a) is untouched, so a caution
-- pays the normal 5 when it's the author's first beta on that boulder.
create or replace function public.mark_beta_worked(p_beta_id uuid)
returns void as $$
declare
  v_user_id uuid := auth.uid();
  v_author  uuid;
  v_gpid    uuid;
  v_gym     text;
  v_kind    text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select b.user_id, b.gym_problem_id, b.kind into v_author, v_gpid, v_kind
    from public.boulder_beta b where b.id = p_beta_id;
  if v_author is null then
    raise exception 'beta not found';
  end if;

  insert into public.boulder_beta_worked (beta_id, user_id)
  values (p_beta_id, v_user_id)
  on conflict (beta_id, user_id) do nothing;

  -- The mark is recorded; the awards below are not paid on a caution.
  if v_kind = 'caution' then
    return;
  end if;

  if v_author <> v_user_id then
    select gym into v_gym from public.gym_problems where id = v_gpid;

    -- Author: 5 points, once ever per beta (preserved from 053).
    update public.boulder_beta set awarded = true
      where id = p_beta_id and awarded = false;
    if found and v_gym is not null then
      insert into public.beta_points (user_id, gym, gym_problem_id, beta_id, points, reason, cycle_month)
      values (v_author, v_gym, v_gpid, p_beta_id, 5, 'helpful',
              to_char((now() at time zone 'utc'), 'YYYY-MM'));
    end if;

    -- Marker: 1 engagement point, once per (user, beta).
    if v_gym is not null and not exists (
      select 1 from public.beta_points
       where user_id = v_user_id and beta_id = p_beta_id and reason = 'engagement'
    ) then
      insert into public.beta_points (user_id, gym, gym_problem_id, beta_id, points, reason, cycle_month)
      values (v_user_id, v_gym, v_gpid, p_beta_id, 1, 'engagement',
              to_char((now() at time zone 'utc'), 'YYYY-MM'))
      on conflict do nothing;
    end if;
  end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- ── 3. tell the gym's setters ────────────────────────────────────────────────
-- gym_problems.setter is a community-editable TEXT NAME (056), not a user
-- reference, so there is no single setter to notify. Target instead every
-- setter-role profile whose default_gyms holds this boulder's gym.
create or replace function public.notify_setters_of_caution()
returns trigger as $$
declare
  v_gym    text;
  v_setter uuid;
begin
  if new.kind <> 'caution' then
    return new;
  end if;

  select gym into v_gym from public.gym_problems where id = new.gym_problem_id;
  if v_gym is null then
    return new;
  end if;

  -- Gym strings are compared case-insensitively everywhere else in this schema.
  for v_setter in
    select p.id from public.profiles p
     where p.is_setter = true
       and exists (
         select 1 from unnest(p.default_gyms) g where lower(g) = lower(v_gym)
       )
  loop
    -- create_notification (037) no-ops when recipient = actor, so a setter
    -- flagging their own boulder doesn't ping themselves.
    perform public.create_notification(
      v_setter, new.user_id, 'boulder_caution', new.gym_problem_id,
      jsonb_build_object('risk_move', new.risk_move, 'gym', v_gym)
    );
  end loop;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists on_boulder_caution_notify on boulder_beta;
create trigger on_boulder_caution_notify
  after insert on boulder_beta
  for each row execute procedure public.notify_setters_of_caution();

-- ── 4. removal ───────────────────────────────────────────────────────────────
-- An RPC rather than an admin RLS DELETE policy, deliberately: a client delete
-- that no policy permits removes zero rows and returns NO error, so the admin
-- would see a success toast and watch the beta stay on screen. This raises.
--
-- Scope is any beta, not only cautions — an abusive tip needs removing just as
-- much. The author's own retraction needs nothing here: "users manage own
-- boulder_beta" (052) is `for all`, so RLS has always permitted it.
create or replace function public.admin_delete_beta(p_beta_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (
    select 1 from profiles where id = auth.uid() and is_admin = true
  ) then
    raise exception 'Only admins can remove beta';
  end if;
  -- boulder_beta_worked (053), boulder_beta_comments and boulder_beta_reactions
  -- (058) all cascade on beta_id, and comment reactions cascade through the
  -- comment. beta_points.beta_id is `on delete set null` (074 §2), so points
  -- already earned stay — and the beta_posted guard keys on
  -- (user_id, gym_problem_id), which survives, so removal can't re-earn the 5.
  delete from boulder_beta where id = p_beta_id;
end;
$$;

revoke all on function public.admin_delete_beta(uuid) from public, anon;
grant execute on function public.admin_delete_beta(uuid) to authenticated;

-- ── 5. smoke test ────────────────────────────────────────────────────────────
-- A plpgsql body is NOT validated at create time: this can all apply perfectly
-- clean and still raise on the first real call. Exercise it here.
do $$
declare
  v_uid uuid;
  v_gp  uuid;
begin
  select id into v_uid from auth.users limit 1;
  select id into v_gp  from gym_problems limit 1;
  if v_uid is null or v_gp is null then
    raise notice '090 smoke test skipped: no users or boulders to test with';
    return;
  end if;

  begin
    insert into boulder_beta (gym_problem_id, user_id, body, kind, risk_move)
    values (v_gp, v_uid, 'smoke test', 'caution', 'heel_hook');
    -- This BEGIN block is an implicit savepoint, so raising here undoes the
    -- insert AND every notification the trigger just wrote. No residue.
    raise exception 'rollback smoke test';
  exception when others then
    if sqlerrm <> 'rollback smoke test' then raise; end if;
  end;

  begin
    insert into boulder_beta (gym_problem_id, user_id, body, kind)
    values (v_gp, v_uid, 'caution with no move', 'caution');
    raise exception 'boulder_beta_caution_shape did not fire';
  exception
    when check_violation then null;
    when others then
      if sqlerrm = 'boulder_beta_caution_shape did not fire' then raise; end if;
  end;

  raise notice '090 ok: caution insert, setter fan-out and shape constraint all behaved';
end $$;
