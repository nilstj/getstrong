-- IG redesign: reactions / "digs" on a shared boulder. Mirrors problem_reactions
-- (migration 018) but keyed to gym_problems so banter lives on the shared object.
create table if not exists gym_problem_reactions (
  id uuid primary key default gen_random_uuid(),
  gym_problem_id uuid not null references gym_problems(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (gym_problem_id, user_id, emoji)
);
alter table gym_problem_reactions enable row level security;

create index if not exists gym_problem_reactions_gp_idx on gym_problem_reactions (gym_problem_id);

create policy "gym_problem_reactions viewable by authenticated users"
  on gym_problem_reactions for select using (auth.role() = 'authenticated');
create policy "users manage own gym_problem_reactions"
  on gym_problem_reactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
