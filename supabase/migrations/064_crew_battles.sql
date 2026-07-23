-- Crew vs crew battles. A crew challenges another to either a boulder all-clear
-- (first crew where every member sends it) or a most-sends sprint over a window.
-- Rosters are private under RLS, so scoring is done in a SECURITY DEFINER
-- function that returns only the two aggregate scores.

create table if not exists crew_battles (
  id uuid primary key default gen_random_uuid(),
  challenger_crew uuid not null references crews(id) on delete cascade,
  opponent_crew uuid not null references crews(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  battle_type text not null check (battle_type in ('boulder', 'sends')),
  gym_problem_id uuid references gym_problems(id) on delete set null,
  duration_days integer not null check (duration_days > 0),
  status text not null default 'pending' check (status in ('pending', 'active', 'declined')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  check (challenger_crew <> opponent_crew)
);
create index if not exists crew_battles_challenger_idx on crew_battles (challenger_crew);
create index if not exists crew_battles_opponent_idx on crew_battles (opponent_crew);

alter table crew_battles enable row level security;
drop policy if exists "crew_battles readable by either crew" on crew_battles;
create policy "crew_battles readable by either crew" on crew_battles for select
  using (is_crew_member(challenger_crew) or is_crew_member(opponent_crew));

create or replace function public.create_crew_battle(
  p_challenger uuid, p_opponent uuid, p_type text, p_gym_problem uuid, p_duration integer
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not exists (select 1 from crew_members where crew_id = p_challenger and user_id = auth.uid()) then
    raise exception 'You must be in the challenging crew';
  end if;
  if p_challenger = p_opponent then raise exception 'Pick a different crew to battle'; end if;
  if p_type not in ('boulder', 'sends') then raise exception 'Unknown battle type'; end if;
  if p_type = 'boulder' and p_gym_problem is null then raise exception 'Pick a boulder for the battle'; end if;
  if coalesce(p_duration, 0) <= 0 then raise exception 'Set a deadline'; end if;
  insert into crew_battles (challenger_crew, opponent_crew, created_by, battle_type, gym_problem_id, duration_days)
    values (p_challenger, p_opponent, auth.uid(), p_type,
            case when p_type = 'boulder' then p_gym_problem else null end, p_duration)
    returning id into v_id;
  return v_id;
end; $$;

create or replace function public.respond_crew_battle(p_battle uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare b crew_battles;
begin
  select * into b from crew_battles where id = p_battle;
  if b.id is null then raise exception 'battle not found'; end if;
  if not exists (select 1 from crew_members where crew_id = b.opponent_crew and user_id = auth.uid()) then
    raise exception 'Only the challenged crew can respond';
  end if;
  if b.status <> 'pending' then raise exception 'This battle was already answered'; end if;
  if p_accept then
    update crew_battles
       set status = 'active', starts_at = now(), ends_at = now() + (b.duration_days || ' days')::interval
     where id = p_battle;
  else
    update crew_battles set status = 'declined' where id = p_battle;
  end if;
end; $$;

-- Aggregate score for a battle, visible only to the two crews. Returns member
-- counts and each crew's progress (sends of the target boulder, or sends in the
-- window) without exposing who is on either roster.
create or replace function public.crew_battle_score(p_battle uuid)
returns table (challenger_score integer, challenger_total integer, opponent_score integer, opponent_total integer)
language plpgsql security definer stable set search_path = public as $$
declare b crew_battles;
begin
  select * into b from crew_battles where id = p_battle;
  if b.id is null then raise exception 'battle not found'; end if;
  if not (is_crew_member(b.challenger_crew) or is_crew_member(b.opponent_crew)) then
    raise exception 'not your battle';
  end if;
  challenger_total := (select count(*) from crew_members where crew_id = b.challenger_crew);
  opponent_total := (select count(*) from crew_members where crew_id = b.opponent_crew);
  if b.battle_type = 'boulder' then
    challenger_score := (select count(distinct m.user_id) from crew_members m
      where m.crew_id = b.challenger_crew
        and exists (select 1 from problems p where p.user_id = m.user_id and p.gym_problem_id = b.gym_problem_id and p.sent));
    opponent_score := (select count(distinct m.user_id) from crew_members m
      where m.crew_id = b.opponent_crew
        and exists (select 1 from problems p where p.user_id = m.user_id and p.gym_problem_id = b.gym_problem_id and p.sent));
  else
    challenger_score := (select count(*) from crew_members m join problems p on p.user_id = m.user_id
      where m.crew_id = b.challenger_crew and p.sent and p.created_at >= b.starts_at and p.created_at <= b.ends_at);
    opponent_score := (select count(*) from crew_members m join problems p on p.user_id = m.user_id
      where m.crew_id = b.opponent_crew and p.sent and p.created_at >= b.starts_at and p.created_at <= b.ends_at);
  end if;
  return next;
end; $$;
