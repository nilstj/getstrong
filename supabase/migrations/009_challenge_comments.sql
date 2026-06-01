create table challenge_comments (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

alter table challenge_comments enable row level security;

create policy "comments viewable by authenticated users"
  on challenge_comments for select
  using (auth.role() = 'authenticated');

create policy "authenticated users can comment"
  on challenge_comments for insert
  with check (auth.uid() = user_id);

create policy "users can delete own comments"
  on challenge_comments for delete
  using (auth.uid() = user_id);
