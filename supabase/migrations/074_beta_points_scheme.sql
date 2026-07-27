-- Beta points: make the awarded scheme match the intended one, and give the
-- ledger the beta_id it needs to dedupe engagement points.
--
-- Scheme after this migration:
--   10  first_logger   logging a shared boulder WITH a photo (no photo, no award)
--    5  beta_posted    posting a beta — first beta per (user, gym problem)
--    5  helpful        first "worked for me" mark on your beta (unchanged, 053)
--    1  engagement     commenting on, or marking, SOMEONE ELSE'S beta — once per
--                      (user, beta), whichever action lands first
--
-- Betas and beta comments are inserted directly by the client (useBoulderBeta.ts)
-- and beta_points has no insert policy (046), so those two awards are AFTER INSERT
-- triggers rather than client calls. The worked-mark award stays in its RPC.
-- Nothing is backfilled: the ledger is append-only and history stands.

-- ── 1. widen the reason constraint ───────────────────────────────────────────
alter table beta_points drop constraint if exists beta_points_reason_check;
alter table beta_points add constraint beta_points_reason_check
  check (reason in ('bounty_won', 'helpful', 'first_logger', 'beta_posted', 'engagement'));

-- ── 2. beta_id, for the per-beta engagement guard ────────────────────────────
alter table beta_points
  add column if not exists beta_id uuid references boulder_beta(id) on delete set null;

create index if not exists beta_points_engagement_idx
  on beta_points (user_id, beta_id) where reason = 'engagement';

-- ── 3. first_logger only when a photo is attached ────────────────────────────
-- Reproduces 068's 7-arg create_gym_problem. The ONLY change is that the award is
-- wrapped in a photo check (plus search_path hardening). Signature is unchanged so
-- no client call site moves.
create or replace function public.create_gym_problem(
  p_gym            text,
  p_color          text,
  p_wall_angle     text,
  p_name           text,
  p_image_url      text,
  p_beta_video_url text default null,
  p_hold_color     text default null
)
returns gym_problems as $$
declare
  v_user_id uuid := auth.uid();
  v_row     gym_problems;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if p_gym is null or length(trim(p_gym)) = 0 then
    raise exception 'gym is required';
  end if;

  insert into public.gym_problems (gym, color, hold_color, wall_angle, name, image_url, beta_video_url, created_by)
  values (trim(p_gym), p_color, p_hold_color, p_wall_angle, p_name, p_image_url, p_beta_video_url, v_user_id)
  returning * into v_row;

  -- first_logger: 10 points, ONLY with a photo. No photo means no row at all, so
  -- the ledger never claims a zero-point award happened.
  if p_image_url is not null and length(trim(p_image_url)) > 0 then
    insert into public.beta_points (user_id, gym, gym_problem_id, points, reason, cycle_month)
    values (v_user_id, v_row.gym, v_row.id, 10, 'first_logger',
            to_char((now() at time zone 'utc'), 'YYYY-MM'));
  end if;

  return v_row;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- ── 4a. 5 points for posting a beta, first beta per boulder ──────────────────
create or replace function public.award_beta_posted()
returns trigger as $$
declare
  v_gym text;
begin
  -- One beta_posted award per author per boulder; extra betas there pay nothing.
  if exists (
    select 1 from public.beta_points
     where user_id = new.user_id
       and gym_problem_id = new.gym_problem_id
       and reason = 'beta_posted'
  ) then
    return new;
  end if;

  select gym into v_gym from public.gym_problems where id = new.gym_problem_id;
  if v_gym is null then
    return new;
  end if;

  insert into public.beta_points (user_id, gym, gym_problem_id, beta_id, points, reason, cycle_month)
  values (new.user_id, v_gym, new.gym_problem_id, new.id, 5, 'beta_posted',
          to_char((now() at time zone 'utc'), 'YYYY-MM'));
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists on_boulder_beta_award on boulder_beta;
create trigger on_boulder_beta_award
  after insert on boulder_beta
  for each row execute procedure public.award_beta_posted();

-- ── 4b. 1 engagement point for commenting on someone else's beta ─────────────
create or replace function public.award_beta_comment_engagement()
returns trigger as $$
declare
  v_author uuid;
  v_gpid   uuid;
  v_gym    text;
begin
  select b.user_id, b.gym_problem_id into v_author, v_gpid
    from public.boulder_beta b where b.id = new.beta_id;
  if v_author is null or v_author = new.user_id then
    return new;   -- your own beta pays nothing
  end if;

  -- One engagement point per (user, beta), whether earned by a comment or a mark.
  if exists (
    select 1 from public.beta_points
     where user_id = new.user_id and beta_id = new.beta_id and reason = 'engagement'
  ) then
    return new;
  end if;

  select gym into v_gym from public.gym_problems where id = v_gpid;
  if v_gym is null then
    return new;
  end if;

  insert into public.beta_points (user_id, gym, gym_problem_id, beta_id, points, reason, cycle_month)
  values (new.user_id, v_gym, v_gpid, new.beta_id, 1, 'engagement',
          to_char((now() at time zone 'utc'), 'YYYY-MM'));
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists on_beta_comment_award on boulder_beta_comments;
create trigger on_beta_comment_award
  after insert on boulder_beta_comments
  for each row execute procedure public.award_beta_comment_engagement();

-- ── 4c. mark_beta_worked: author keeps 5, marker now earns 1 ─────────────────
-- Reproduces 053's mark_beta_worked and ADDS the marker's engagement point. The
-- author's award keeps its boulder_beta.awarded guard, so toggling still can't
-- farm it, and unmark still never claws anything back.
create or replace function public.mark_beta_worked(p_beta_id uuid)
returns void as $$
declare
  v_user_id uuid := auth.uid();
  v_author  uuid;
  v_gpid    uuid;
  v_gym     text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select b.user_id, b.gym_problem_id into v_author, v_gpid
    from public.boulder_beta b where b.id = p_beta_id;
  if v_author is null then
    raise exception 'beta not found';
  end if;

  insert into public.boulder_beta_worked (beta_id, user_id)
  values (p_beta_id, v_user_id)
  on conflict (beta_id, user_id) do nothing;

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
              to_char((now() at time zone 'utc'), 'YYYY-MM'));
    end if;
  end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;
