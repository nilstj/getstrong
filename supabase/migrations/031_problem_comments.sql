create table problem_comments (
  id uuid primary key default gen_random_uuid(),
  problem_id uuid not null references problems(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table problem_comments enable row level security;

create policy "authenticated users can read problem comments"
  on problem_comments for select
  using (auth.role() = 'authenticated');

create policy "users can post own problem comments"
  on problem_comments for insert
  with check (auth.uid() = user_id);

create policy "users can delete own problem comments"
  on problem_comments for delete
  using (auth.uid() = user_id);
