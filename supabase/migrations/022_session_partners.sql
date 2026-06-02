-- Partners for sessions
create table session_partners (
  session_id uuid not null references sessions(id) on delete cascade,
  partner_id uuid not null references auth.users(id) on delete cascade,
  primary key (session_id, partner_id)
);
alter table session_partners enable row level security;
create policy "session partners viewable by authenticated users"
  on session_partners for select using (auth.role() = 'authenticated');
create policy "session owner manages partners"
  on session_partners for all
  using (exists (select 1 from sessions where id = session_id and user_id = auth.uid()))
  with check (exists (select 1 from sessions where id = session_id and user_id = auth.uid()));

-- Partners for problems
create table problem_partners (
  problem_id uuid not null references problems(id) on delete cascade,
  partner_id uuid not null references auth.users(id) on delete cascade,
  primary key (problem_id, partner_id)
);
alter table problem_partners enable row level security;
create policy "problem partners viewable by authenticated users"
  on problem_partners for select using (auth.role() = 'authenticated');
create policy "problem owner manages partners"
  on problem_partners for all
  using (exists (select 1 from problems where id = problem_id and user_id = auth.uid()))
  with check (exists (select 1 from problems where id = problem_id and user_id = auth.uid()));

-- Partners for exercises
create table exercise_partners (
  exercise_id uuid not null references exercises(id) on delete cascade,
  partner_id uuid not null references auth.users(id) on delete cascade,
  primary key (exercise_id, partner_id)
);
alter table exercise_partners enable row level security;
create policy "exercise partners viewable by authenticated users"
  on exercise_partners for select using (auth.role() = 'authenticated');
create policy "exercise owner manages partners"
  on exercise_partners for all
  using (exists (select 1 from exercises where id = exercise_id and user_id = auth.uid()))
  with check (exists (select 1 from exercises where id = exercise_id and user_id = auth.uid()));
