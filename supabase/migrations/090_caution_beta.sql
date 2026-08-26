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
--
-- risk_move must also be one of the ids in src/utils/riskMoves.ts's RISK_MOVES
-- (precedent: 058's `check (body_type in ('tall', 'short', 'neutral'))`).
-- Without this, an anon-key caller can insert arbitrary risk_move strings,
-- which bypasses the unique index below entirely (each insert has a "new"
-- value), fans out an unbounded number of setter notifications, and — since
-- the client's label helper falls back to the raw stored value — can put
-- arbitrary text, including injury or body-part wording, into the visible
-- chip label. Deliberate consequence: the vocabulary now lives in both the
-- client util and this constraint, so adding a move later needs a migration.
alter table boulder_beta drop constraint if exists boulder_beta_caution_shape;
alter table boulder_beta add constraint boulder_beta_caution_shape check (
  (kind = 'beta' and risk_move is null)
  or (kind = 'caution'
      and risk_move is not null and btrim(risk_move) <> ''
      and risk_move in ('heel_hook', 'big_span', 'crimp', 'slap', 'top_out', 'swing', 'landing')
      and body is not null and btrim(body) <> '')
);

-- One climber, one caution per move per boulder. This stops the SAME climber
-- posting the SAME move twice on the same boulder (a double-tap, a retry, or
-- deliberate re-posting) — it does NOT cap the number of distinct-move
-- cautions one account can post. That total is bounded instead by the
-- risk_move value constraint above: with only seven valid moves, one account
-- can post at most seven cautions per boulder, ever, which in turn bounds the
-- ⚠️ badge inflation and setter notification fan-out one account can cause.
-- gym_problem_id leads the column list, so this index also serves any count
-- query filtered on (gym_problem_id, kind = 'caution') — the plain single-column
-- partial index that query would otherwise need is a redundant subset of this
-- one and is deliberately not added.
create unique index if not exists boulder_beta_caution_unique_idx
  on boulder_beta (gym_problem_id, user_id, risk_move) where kind = 'caution';

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

-- ── 2b. a "me too" on a caution must not close someone's help request ────────
-- resolve_help_on_beta_worked (057) fires AFTER INSERT on boulder_beta_worked
-- for every mark, including a caution's "me too" — and that insert happens
-- before mark_beta_worked's own caution guard above ever runs, so the trigger
-- fires regardless. Left alone: Alice asks for beta help, then taps "Me too"
-- on someone else's caution, and her still-unanswered help request silently
-- resolves. Faithful reproduction of 057's body, plus one early-return guard.
create or replace function public.resolve_help_on_beta_worked()
returns trigger as $$
declare
  v_gpid uuid;
  v_kind text;
begin
  select gym_problem_id, kind into v_gpid, v_kind from boulder_beta where id = new.beta_id;
  if v_kind = 'caution' then
    return new;
  end if;
  if v_gpid is not null then
    update gym_problem_help set resolved_at = now()
     where gym_problem_id = v_gpid and user_id = new.user_id and resolved_at is null;
  end if;
  return new;
end;
$$ language plpgsql security definer;

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

-- ── 4b. a "me too" on a caution isn't a feed brag ────────────────────────────
-- get_crew_feed's `beta_worked` branch (055, carried through 072) fires for
-- every boulder_beta_worked row. Left alone, a caution's "me too" reads on the
-- home feed as "<name> nailed the beta on <boulder>" with the caution's own
-- words as the snippet — exactly backwards for a watch-out.
--
-- Faithful reproduction of 072's body — the return type is unchanged this time,
-- so no drop is needed — with one added predicate: the `beta_worked` branch now
-- joins only betas of kind = 'beta'. `beta_added` is untouched: a caution
-- showing up there as "shared beta on" is still true, since it is a kind of
-- beta; only "worked" is the wrong word for a caution's corroboration.
create or replace function public.get_crew_feed(
  p_limit  int default 20,
  p_before timestamptz default null
)
returns table (
  event_type         text,
  event_at           timestamptz,
  actor_id           uuid,
  gym_problem_id     uuid,
  boulder_name       text,
  boulder_color      text,
  boulder_hold_color text,
  boulder_grade      text,
  boulder_image_url  text,
  gym                text,
  beta_id            uuid,
  beta_snippet       text,
  beta_video_url     text
) as $$
declare
  v_user_id uuid := auth.uid();
  v_before  timestamptz := coalesce(p_before, now());
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  return query
  with my_gyms as (
    select distinct gym from problems
     where user_id = v_user_id and gym is not null
  )
  select * from (
    -- new boulder
    select 'boulder_new'::text, gp.created_at, gp.created_by, gp.id,
           gp.name, gp.color, gp.hold_color, gp.community_grade, gp.image_url, gp.gym,
           null::uuid, null::text, null::text
      from gym_problems gp
     where gp.gym in (select gym from my_gyms) and gp.created_by is not null

    union all
    -- send (someone logged a sent problem linked to a boulder)
    select 'send'::text, p.created_at, p.user_id, gp.id,
           gp.name, gp.color, gp.hold_color, gp.community_grade, gp.image_url, gp.gym,
           null::uuid, null::text, null::text
      from problems p
      join gym_problems gp on gp.id = p.gym_problem_id
     where gp.gym in (select gym from my_gyms) and p.sent = true

    union all
    -- beta added
    select 'beta_added'::text, bb.created_at, bb.user_id, gp.id,
           gp.name, gp.color, gp.hold_color, gp.community_grade, gp.image_url, gp.gym,
           bb.id, left(bb.body, 140), bb.video_url
      from boulder_beta bb
      join gym_problems gp on gp.id = bb.gym_problem_id
     where gp.gym in (select gym from my_gyms)

    union all
    -- beta worked for someone (a plain tip only — a caution's "me too" is
    -- corroboration, not a climber reporting that the caution "worked")
    select 'beta_worked'::text, w.created_at, w.user_id, gp.id,
           gp.name, gp.color, gp.hold_color, gp.community_grade, gp.image_url, gp.gym,
           bb.id, left(bb.body, 140), bb.video_url
      from boulder_beta_worked w
      join boulder_beta bb on bb.id = w.beta_id
      join gym_problems gp on gp.id = bb.gym_problem_id
     where gp.gym in (select gym from my_gyms) and bb.kind = 'beta'
  ) feed
  where feed.event_at < v_before
  order by feed.event_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$ language plpgsql security definer;

-- ── 5. smoke test ────────────────────────────────────────────────────────────
-- A plpgsql body is NOT validated at create time: this can all apply perfectly
-- clean and still raise on the first real call. Exercise it here.
do $$
declare
  v_uid     uuid;
  v_gp      uuid;
  v_beta_id uuid;
begin
  select id into v_uid from auth.users limit 1;
  select id into v_gp  from gym_problems limit 1;
  if v_uid is null or v_gp is null then
    raise notice '090 smoke test skipped: no users or boulders to test with';
    return;
  end if;

  begin
    insert into boulder_beta (gym_problem_id, user_id, body, kind, risk_move)
    values (v_gp, v_uid, 'smoke test', 'caution', 'heel_hook')
    returning id into v_beta_id;

    -- Also exercise resolve_help_on_beta_worked (057, reproduced in §2b above):
    -- open a help request for this same user/boulder, then mark the caution
    -- "worked" as that same user, and assert the request is STILL open. If
    -- the kind = 'caution' early-return guard in §2b were missing or wrong,
    -- this "me too" would wrongly close it.
    insert into gym_problem_help (gym_problem_id, user_id, created_at, resolved_at)
    values (v_gp, v_uid, now(), null)
    on conflict (gym_problem_id, user_id) do update set resolved_at = null;

    insert into boulder_beta_worked (beta_id, user_id)
    values (v_beta_id, v_uid);

    if not exists (
      select 1 from gym_problem_help
       where gym_problem_id = v_gp and user_id = v_uid and resolved_at is null
    ) then
      raise exception '090 smoke test: a caution "me too" wrongly resolved an open help request';
    end if;

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
    -- The expected pass: the shape constraint rejected the insert.
    when check_violation then null;
    -- Anything else — including the sentinel above, meaning the constraint
    -- didn't fire, or any unrelated real error — must not read as a pass.
    when others then raise;
  end;

  raise notice '090 ok: caution insert, setter fan-out, help guard and shape constraint all behaved';
end $$;
