-- Crew Projects step 3a: the beta_points ledger (payoff C, points half).
-- Append-only, written only by SECURITY DEFINER functions so points cannot be
-- self-minted. Readable by all authenticated users for the per-gym leaderboard.
-- The monthly leaderboard is computed client-side from these rows (no SQL
-- aggregation function). Bounty (`bounty_won`) points arrive in step 3b.

create table beta_points (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gym text not null,
  gym_problem_id uuid references gym_problems(id) on delete set null,
  points integer not null,
  reason text not null check (reason in ('bounty_won', 'helpful', 'first_logger')),
  cycle_month text not null,          -- 'YYYY-MM' (UTC)
  created_at timestamptz not null default now()
);
alter table beta_points enable row level security;

create index beta_points_leaderboard_idx on beta_points (gym, cycle_month);

create policy "beta_points viewable by authenticated users"
  on beta_points for select
  using (auth.role() = 'authenticated');
-- No insert/update/delete policy: rows are written only by the SECURITY DEFINER
-- functions below.

-- ── first_logger: award the creator when a new shared boulder is created ─────
-- Reproduces migration 044's create_gym_problem and ADDS the beta_points insert.
create or replace function public.create_gym_problem(
  p_gym        text,
  p_color      text,
  p_wall_angle text,
  p_name       text,
  p_image_url  text
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

  insert into public.gym_problems (gym, color, wall_angle, name, image_url, created_by)
  values (trim(p_gym), p_color, p_wall_angle, p_name, p_image_url, v_user_id)
  returning * into v_row;

  -- NEW (step 3a): first_logger points to the creator.
  insert into public.beta_points (user_id, gym, gym_problem_id, points, reason, cycle_month)
  values (v_user_id, v_row.gym, v_row.id, 10, 'first_logger',
          to_char((now() at time zone 'utc'), 'YYYY-MM'));

  return v_row;
end;
$$ language plpgsql security definer;

-- ── helpful: award the helper when their response is marked helpful ──────────
-- Reproduces migration 039's award_helpful_response (notification + badge tiers)
-- and ADDS the beta_points insert for the helper.
create or replace function public.award_helpful_response()
returns trigger as $$
declare
  v_asker   uuid;
  v_count   integer;
  v_tier    record;
  v_gym     text;
  v_gpid    uuid;
begin
  if new.helpful = true and (old.helpful is distinct from true) then
    select user_id into v_asker from help_requests where id = new.request_id;

    perform public.create_notification(
      new.user_id, v_asker, 'help_marked_helpful', new.request_id, '{}'::jsonb
    );

    select count(*) into v_count
      from help_responses
     where user_id = new.user_id and helpful = true;

    for v_tier in
      select * from (values
        ('spotter', 1), ('beta_sprayer', 5), ('crux_crusher', 25), ('beta_legend', 100)
      ) as t(badge, threshold)
    loop
      if v_count >= v_tier.threshold
         and not exists (
           select 1 from user_badges b
           where b.user_id = new.user_id and b.badge = v_tier.badge
         ) then
        insert into user_badges (user_id, badge)
          values (new.user_id, v_tier.badge)
          on conflict do nothing;
        perform public.create_notification(
          new.user_id, v_asker, 'badge_earned', null,
          jsonb_build_object('badge', v_tier.badge)
        );
      end if;
    end loop;

    -- NEW (step 3a): helpful points to the helper, scoped to the asker's gym.
    select p.gym, p.gym_problem_id into v_gym, v_gpid
      from help_requests r
      join problems p on p.id = r.problem_id
     where r.id = new.request_id;

    if v_gym is not null then
      insert into public.beta_points (user_id, gym, gym_problem_id, points, reason, cycle_month)
      values (new.user_id, v_gym, v_gpid, 5, 'helpful',
              to_char((now() at time zone 'utc'), 'YYYY-MM'));
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;
