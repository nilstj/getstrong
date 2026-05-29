-- Challenges
create table challenges (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  created_at timestamptz not null default now()
);

alter table challenges enable row level security;

create policy "challenges viewable by authenticated users"
  on challenges for select
  using (auth.role() = 'authenticated');

create policy "authenticated users can create challenges"
  on challenges for insert
  with check (auth.uid() = creator_id);

-- Challenge attempts
create table challenge_attempts (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  session_id uuid references sessions(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  completed boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

alter table challenge_attempts enable row level security;

create policy "challenge attempts viewable by authenticated users"
  on challenge_attempts for select
  using (auth.role() = 'authenticated');

create policy "users manage own challenge attempts"
  on challenge_attempts for insert
  with check (auth.uid() = user_id);

create policy "users delete own challenge attempts"
  on challenge_attempts for delete
  using (auth.uid() = user_id);
