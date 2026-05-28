-- Sessions
create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  location text not null,
  duration_minutes integer,
  notes text,
  created_at timestamptz not null default now()
);

alter table sessions enable row level security;
create policy "users manage own sessions"
  on sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Problems
create table problems (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  grade_system text not null check (grade_system in ('v_scale', 'font', 'color')),
  grade_value text,
  color text,
  attempts integer not null default 1,
  sent boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

alter table problems enable row level security;
create policy "users manage own problems"
  on problems for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Exercises
create table exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('reps', 'time')),
  sets integer,
  reps integer,
  duration_seconds integer,
  notes text,
  created_at timestamptz not null default now()
);

alter table exercises enable row level security;
create policy "users manage own exercises"
  on exercises for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Grade mappings (static lookup, readable by all authenticated users)
create table grade_mappings (
  v_scale text primary key,
  font_equivalent text not null
);

alter table grade_mappings enable row level security;
create policy "grade_mappings readable by authenticated users"
  on grade_mappings for select
  using (auth.role() = 'authenticated');
