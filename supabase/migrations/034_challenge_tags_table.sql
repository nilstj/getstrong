create table challenge_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table challenge_tags enable row level security;

create policy "Anyone can read challenge tags"
  on challenge_tags for select using (true);

create policy "Admins can insert challenge tags"
  on challenge_tags for insert
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

create policy "Admins can delete challenge tags"
  on challenge_tags for delete
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

-- Seed existing hardcoded tags
insert into challenge_tags (name) values
  ('Power'),
  ('Show-off'),
  ('Power Endurance'),
  ('Endurance'),
  ('Slab'),
  ('Technical');
