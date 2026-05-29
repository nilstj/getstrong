alter table profiles add column is_admin boolean not null default false;

create table exercise_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'reps' check (type in ('reps', 'time')),
  description text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table exercise_templates enable row level security;

create policy "exercise templates viewable by authenticated users"
  on exercise_templates for select
  using (auth.role() = 'authenticated');

create policy "admins can insert exercise templates"
  on exercise_templates for insert
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

create policy "admins can update exercise templates"
  on exercise_templates for update
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

create policy "admins can delete exercise templates"
  on exercise_templates for delete
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));
