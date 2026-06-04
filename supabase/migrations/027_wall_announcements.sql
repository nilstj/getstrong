create table wall_announcements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location text not null,
  label text,
  starts_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table wall_announcements enable row level security;

create policy "authenticated users can read announcements"
  on wall_announcements for select
  using (auth.role() = 'authenticated');

create policy "users can create own announcements"
  on wall_announcements for insert
  with check (auth.uid() = user_id);

create policy "users can delete own announcements"
  on wall_announcements for delete
  using (auth.uid() = user_id);

create table wall_joins (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references wall_announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(announcement_id, user_id)
);

alter table wall_joins enable row level security;

create policy "authenticated users can read joins"
  on wall_joins for select
  using (auth.role() = 'authenticated');

create policy "users can create own joins"
  on wall_joins for insert
  with check (auth.uid() = user_id);

create policy "users can delete own joins"
  on wall_joins for delete
  using (auth.uid() = user_id);
