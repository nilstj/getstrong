create table problem_tag_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'general',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(name)
);

alter table problem_tag_definitions enable row level security;

create policy "problem tags viewable by authenticated users"
  on problem_tag_definitions for select using (auth.role() = 'authenticated');

create policy "admins can manage problem tags"
  on problem_tag_definitions for all
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

create table problem_tag_assignments (
  problem_id uuid not null references problems(id) on delete cascade,
  tag_id uuid not null references problem_tag_definitions(id) on delete cascade,
  primary key (problem_id, tag_id)
);

alter table problem_tag_assignments enable row level security;

create policy "problem tag assignments viewable by authenticated users"
  on problem_tag_assignments for select using (auth.role() = 'authenticated');

create policy "users manage own problem tag assignments"
  on problem_tag_assignments for all
  using (
    exists (select 1 from problems where id = problem_id and user_id = auth.uid())
  )
  with check (
    exists (select 1 from problems where id = problem_id and user_id = auth.uid())
  );
