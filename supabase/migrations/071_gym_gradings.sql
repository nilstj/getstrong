-- Per-gym grading colours. A "gym" is a free-text string (there is no gyms
-- table), so config is keyed by that string. Each row is one colour the gym
-- uses: `rank` orders colours easiest -> hardest (max rank = hardest), `points`
-- is what a climber earns for sending a problem of this colour. Colour names
-- come from HOLD_COLORS (src/utils/holdColors.ts).
create table if not exists gym_gradings (
  id          uuid primary key default gen_random_uuid(),
  gym         text not null,
  color_name  text not null,
  rank        int  not null,
  points      int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (gym, color_name)
);

alter table gym_gradings enable row level security;

-- Everyone signed in can read grading config (needed by the picker + leaderboard).
create policy "gym_gradings readable by authenticated users"
  on gym_gradings for select
  using (auth.role() = 'authenticated');

-- No direct writes: the whole colour set for a gym is saved atomically via this
-- RPC, gated on is_admin OR is_setter (same check as set_boulder_setter_intention,
-- migration 061). Delete-then-insert inside the function is transactional.
create or replace function public.save_gym_gradings(p_gym text, p_rows jsonb)
returns void as $$
declare
  v_gym text := nullif(trim(coalesce(p_gym, '')), '');
begin
  if v_gym is null then
    raise exception 'gym is required';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and (is_admin = true or is_setter = true)
  ) then
    raise exception 'Only admins or setters can edit gym gradings';
  end if;

  delete from public.gym_gradings where gym = v_gym;

  insert into public.gym_gradings (gym, color_name, rank, points)
  select v_gym,
         elem->>'color_name',
         (elem->>'rank')::int,
         coalesce((elem->>'points')::int, 0)
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as elem
  where nullif(trim(coalesce(elem->>'color_name', '')), '') is not null;
end;
$$ language plpgsql security definer set search_path = '';
