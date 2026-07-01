-- "Help wanted" on a shared boulder: a climber asks for beta, and the request
-- stays open until they mark a beta that worked. One open request per user per
-- boulder (open = resolved_at is null).
create table if not exists gym_problem_help (
  gym_problem_id uuid not null references gym_problems(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key (gym_problem_id, user_id)
);
alter table gym_problem_help enable row level security;
create index if not exists gym_problem_help_open_idx on gym_problem_help (gym_problem_id) where resolved_at is null;

drop policy if exists "gym_problem_help viewable by authenticated users" on gym_problem_help;
create policy "gym_problem_help viewable by authenticated users"
  on gym_problem_help for select using (auth.role() = 'authenticated');
drop policy if exists "users manage own gym_problem_help" on gym_problem_help;
create policy "users manage own gym_problem_help"
  on gym_problem_help for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Ask for beta help (idempotent; reopens if a prior request was resolved).
create or replace function public.request_beta_help(p_gym_problem_id uuid)
returns void as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;
  insert into gym_problem_help (gym_problem_id, user_id, created_at, resolved_at)
  values (p_gym_problem_id, v_user, now(), null)
  on conflict (gym_problem_id, user_id)
  do update set created_at = now(), resolved_at = null;
end;
$$ language plpgsql security definer;

-- When a climber marks a beta as worked, resolve their open help request on
-- that boulder (the beta's gym_problem).
create or replace function public.resolve_help_on_beta_worked()
returns trigger as $$
declare
  v_gpid uuid;
begin
  select gym_problem_id into v_gpid from boulder_beta where id = new.beta_id;
  if v_gpid is not null then
    update gym_problem_help set resolved_at = now()
     where gym_problem_id = v_gpid and user_id = new.user_id and resolved_at is null;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_beta_worked_resolve_help on boulder_beta_worked;
create trigger on_beta_worked_resolve_help
  after insert on boulder_beta_worked
  for each row execute procedure public.resolve_help_on_beta_worked();
