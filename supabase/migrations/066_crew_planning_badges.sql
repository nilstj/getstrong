-- Crew session planning (propose a date, members RSVP) + auto-earned crew badges.

-- ── Planning ─────────────────────────────────────────────────────────────────
create table if not exists crew_plans (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references crews(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  plan_date date not null,
  gym text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists crew_plans_crew_idx on crew_plans (crew_id, plan_date);

create table if not exists crew_plan_rsvps (
  plan_id uuid not null references crew_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);

alter table crew_plans enable row level security;
alter table crew_plan_rsvps enable row level security;

drop policy if exists "crew_plans readable by members" on crew_plans;
create policy "crew_plans readable by members" on crew_plans for select using (is_crew_member(crew_id));
drop policy if exists "crew_plans insert by members" on crew_plans;
create policy "crew_plans insert by members" on crew_plans for insert
  with check (created_by = auth.uid() and is_crew_member(crew_id));
drop policy if exists "crew_plans delete own" on crew_plans;
create policy "crew_plans delete own" on crew_plans for delete using (created_by = auth.uid());

drop policy if exists "crew_plan_rsvps readable by members" on crew_plan_rsvps;
create policy "crew_plan_rsvps readable by members" on crew_plan_rsvps for select
  using (exists (select 1 from crew_plans cp where cp.id = plan_id and is_crew_member(cp.crew_id)));
drop policy if exists "crew_plan_rsvps insert own" on crew_plan_rsvps;
create policy "crew_plan_rsvps insert own" on crew_plan_rsvps for insert
  with check (user_id = auth.uid() and exists (select 1 from crew_plans cp where cp.id = plan_id and is_crew_member(cp.crew_id)));
drop policy if exists "crew_plan_rsvps delete own" on crew_plan_rsvps;
create policy "crew_plan_rsvps delete own" on crew_plan_rsvps for delete using (user_id = auth.uid());

-- ── Badges (auto-earned, computed on demand) ─────────────────────────────────
-- Aggregate achievement flags for a crew. Non-sensitive (no rosters leak), so
-- any authenticated user may read them. "on_fire" (streak) is computed client-side.
create or replace function public.crew_badges(p_crew uuid)
returns table (crew_send boolean, flash_mob boolean, first_blood boolean, deep_bench boolean)
language plpgsql security definer stable set search_path = public as $$
declare v_members integer;
begin
  v_members := (select count(*) from crew_members where crew_id = p_crew);
  deep_bench := v_members >= 5;

  -- A boulder every member has sent / flashed.
  crew_send := v_members > 0 and exists (
    select 1 from problems p
    join crew_members m on m.user_id = p.user_id and m.crew_id = p_crew
    where p.gym_problem_id is not null and p.sent
    group by p.gym_problem_id
    having count(distinct p.user_id) = v_members
  );
  flash_mob := v_members > 0 and exists (
    select 1 from problems p
    join crew_members m on m.user_id = p.user_id and m.crew_id = p_crew
    where p.gym_problem_id is not null and p.sent and p.attempts = 1
    group by p.gym_problem_id
    having count(distinct p.user_id) = v_members
  );

  -- All-cleared a boulder that was the target of a battle involving this crew.
  first_blood := v_members > 0 and exists (
    select 1 from crew_battles b
    where (b.challenger_crew = p_crew or b.opponent_crew = p_crew)
      and b.battle_type = 'boulder' and b.gym_problem_id is not null
      and (select count(distinct m.user_id) from crew_members m
           where m.crew_id = p_crew
             and exists (select 1 from problems p2 where p2.user_id = m.user_id and p2.gym_problem_id = b.gym_problem_id and p2.sent)) = v_members
  );

  return next;
end; $$;
