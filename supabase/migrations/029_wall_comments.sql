create table wall_comments (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references wall_announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table wall_comments enable row level security;

create policy "authenticated users can read comments"
  on wall_comments for select
  using (auth.role() = 'authenticated');

create policy "users can post own comments"
  on wall_comments for insert
  with check (auth.uid() = user_id);

create policy "users can delete own comments"
  on wall_comments for delete
  using (auth.uid() = user_id);
