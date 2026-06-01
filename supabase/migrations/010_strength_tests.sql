create table strength_tests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  unit text not null default 'kg',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table strength_tests enable row level security;

create policy "strength tests viewable by authenticated users"
  on strength_tests for select
  using (auth.role() = 'authenticated');

create policy "admins can manage strength tests"
  on strength_tests for all
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

create table test_results (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references strength_tests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  value numeric not null,
  session_id uuid references sessions(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table test_results enable row level security;

create policy "test results viewable by authenticated users"
  on test_results for select
  using (auth.role() = 'authenticated');

create policy "users manage own test results"
  on test_results for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table exercise_templates add column test_id uuid references strength_tests(id) on delete set null;

alter table exercises add column weight_kg numeric;
