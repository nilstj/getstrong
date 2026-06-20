-- Crew Projects step 3b: beta bounties. A help request on a shared boulder can
-- carry a points bounty (capped by a monthly staking budget); marking a response
-- helpful awards that bounty once. Also hardens 3a's point awards (idempotent
-- helpful points, gym sourced from gym_problems, no self-award).

alter table help_requests add column if not exists bounty integer not null default 0;
alter table help_requests add column if not exists gym_problem_id uuid references gym_problems(id) on delete set null;
alter table help_requests add column if not exists bounty_awarded boolean not null default false;
alter table beta_points add column if not exists response_id uuid references help_responses(id) on delete set null;

-- ── create_help_request: extended with an optional bounty + boulder scope ─────
-- Reproduces migration 042 and ADDS bounty params + monthly budget enforcement.
-- Drop the old 3-arg overload first: adding defaulted params creates a separate
-- function, and a 3-arg call would then be ambiguous ("function is not unique").
-- The 5-arg version below still serves 3-arg named calls via its defaults.
drop function if exists public.create_help_request(uuid, text, text);

create or replace function public.create_help_request(
  p_problem_id     uuid,
  p_message        text,
  p_visibility     text,
  p_bounty         integer default 0,
  p_gym_problem_id uuid default null
)
returns uuid as $$
declare
  v_user_id uuid := auth.uid();
  v_id      uuid;
  v_staked  integer;
  v_cycle   text := to_char((now() at time zone 'utc'), 'YYYY-MM');
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if p_visibility not in ('friends', 'global') then
    raise exception 'Invalid visibility value: %', p_visibility;
  end if;
  if p_bounty < 0 then
    raise exception 'Bounty must be non-negative';
  end if;
  if p_bounty > 0 and p_gym_problem_id is null then
    raise exception 'A bounty requires a shared boulder';
  end if;

  if p_bounty > 0 then
    select coalesce(sum(bounty), 0) into v_staked
      from public.help_requests
     where user_id = v_user_id
       and bounty > 0
       and to_char((created_at at time zone 'utc'), 'YYYY-MM') = v_cycle;
    if v_staked + p_bounty > 100 then  -- BOUNTY_BUDGET (keep in sync with TS)
      raise exception 'Monthly bounty budget exceeded: % staked of 100', v_staked;
    end if;
  end if;

  insert into public.help_requests (problem_id, user_id, message, visibility, bounty, gym_problem_id)
  values (p_problem_id, v_user_id, p_message, p_visibility, p_bounty, p_gym_problem_id)
  returning id into v_id;

  return v_id;
end;
$$ language plpgsql security definer;

-- ── award_helpful_response: extended for bounty + hardened 3a awards ──────────
-- Reproduces migration 046 (notification + badges + helpful points) and ADDS:
-- bounty award (once), idempotent helpful points (via beta_points.response_id),
-- gym sourced from gym_problems, and a no-self-award guard.
create or replace function public.award_helpful_response()
returns trigger as $$
declare
  v_asker   uuid;
  v_count   integer;
  v_tier    record;
  v_gym     text;
  v_gpid    uuid;
  v_bounty  integer;
  v_awarded boolean;
  v_cycle   text := to_char((now() at time zone 'utc'), 'YYYY-MM');
begin
  if new.helpful = true and (old.helpful is distinct from true) then
    select r.user_id, r.bounty, r.bounty_awarded,
           coalesce(r.gym_problem_id, p.gym_problem_id),
           coalesce(gp.gym, p.gym)
      into v_asker, v_bounty, v_awarded, v_gpid, v_gym
      from public.help_requests r
      join public.problems p on p.id = r.problem_id
      left join public.gym_problems gp on gp.id = coalesce(r.gym_problem_id, p.gym_problem_id)
     where r.id = new.request_id;

    perform public.create_notification(
      new.user_id, v_asker, 'help_marked_helpful', new.request_id, '{}'::jsonb
    );

    select count(*) into v_count
      from public.help_responses
     where user_id = new.user_id and helpful = true;

    for v_tier in
      select * from (values
        ('spotter', 1), ('beta_sprayer', 5), ('crux_crusher', 25), ('beta_legend', 100)
      ) as t(badge, threshold)
    loop
      if v_count >= v_tier.threshold
         and not exists (
           select 1 from public.user_badges b
           where b.user_id = new.user_id and b.badge = v_tier.badge
         ) then
        insert into public.user_badges (user_id, badge)
          values (new.user_id, v_tier.badge)
          on conflict do nothing;
        perform public.create_notification(
          new.user_id, v_asker, 'badge_earned', null,
          jsonb_build_object('badge', v_tier.badge)
        );
      end if;
    end loop;

    -- helpful points: 5 to the helper, idempotent per response, never to the asker.
    if v_gym is not null and new.user_id <> v_asker
       and not exists (
         select 1 from public.beta_points bp
         where bp.reason = 'helpful' and bp.response_id = new.id
       ) then
      insert into public.beta_points (user_id, gym, gym_problem_id, points, reason, cycle_month, response_id)
      values (new.user_id, v_gym, v_gpid, 5, 'helpful', v_cycle, new.id);
    end if;

    -- bounty: award the request's bounty once, to the helper, never to the asker.
    if v_bounty > 0 and not v_awarded and v_gym is not null and new.user_id <> v_asker then
      insert into public.beta_points (user_id, gym, gym_problem_id, points, reason, cycle_month, response_id)
      values (new.user_id, v_gym, v_gpid, v_bounty, 'bounty_won', v_cycle, new.id);
      update public.help_requests set bounty_awarded = true where id = new.request_id;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;
