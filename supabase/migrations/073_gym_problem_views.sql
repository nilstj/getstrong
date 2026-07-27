-- "Seen" state for the Latest Gym Problems strip on the home page: one row per
-- (user, boulder) the moment the user opens that boulder's page. Unseen rings
-- render blue, seen rings render grey. Per-user (not per-device) so the strip
-- looks the same on phone and desktop.
create table if not exists gym_problem_views (
  user_id uuid not null references auth.users(id) on delete cascade,
  gym_problem_id uuid not null references gym_problems(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (user_id, gym_problem_id)
);
alter table gym_problem_views enable row level security;
create index if not exists gym_problem_views_user_idx on gym_problem_views (user_id);

-- Strictly private: a view is only ever readable and writable by its owner.
drop policy if exists "users read own gym_problem_views" on gym_problem_views;
create policy "users read own gym_problem_views"
  on gym_problem_views for select using (auth.uid() = user_id);
drop policy if exists "users manage own gym_problem_views" on gym_problem_views;
create policy "users manage own gym_problem_views"
  on gym_problem_views for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Idempotent "I opened this boulder". Re-opening refreshes viewed_at rather
-- than erroring on the primary key.
create or replace function public.mark_gym_problem_viewed(p_gym_problem_id uuid)
returns void as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;
  insert into gym_problem_views (user_id, gym_problem_id, viewed_at)
  values (v_user, p_gym_problem_id, now())
  on conflict (user_id, gym_problem_id) do update set viewed_at = now();
end;
$$ language plpgsql security definer;
