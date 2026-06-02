-- Problem reactions (fire, crush, ghost, silent feet, clean)
create table problem_reactions (
  id uuid primary key default gen_random_uuid(),
  problem_id uuid not null references problems(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique(problem_id, user_id, emoji)
);
alter table problem_reactions enable row level security;
create policy "reactions viewable by authenticated users"
  on problem_reactions for select using (auth.role() = 'authenticated');
create policy "users manage own reactions"
  on problem_reactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- On-the-wall status (stored on profile)
alter table profiles add column on_wall_at timestamptz;
alter table profiles add column on_wall_label text;

-- Hype messages
create table hype_messages (
  id uuid primary key default gen_random_uuid(),
  to_user_id uuid not null references auth.users(id) on delete cascade,
  from_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table hype_messages enable row level security;
create policy "users can see own hype"
  on hype_messages for select
  using (auth.uid() = to_user_id or auth.uid() = from_user_id);
create policy "authenticated users can send hype"
  on hype_messages for insert with check (auth.uid() = from_user_id);

-- Shared projects (climbers working the same problem together)
create table shared_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  grade_value_font text,
  grade_value_vscale text,
  board text,
  board_angle integer,
  gym text,
  creator_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table shared_projects enable row level security;
create policy "shared projects viewable by authenticated users"
  on shared_projects for select using (auth.role() = 'authenticated');
create policy "authenticated users can create projects"
  on shared_projects for insert with check (auth.uid() = creator_id);
create policy "creator can delete projects"
  on shared_projects for delete using (auth.uid() = creator_id);

create table project_attempts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references shared_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sent boolean not null default false,
  created_at timestamptz not null default now()
);
alter table project_attempts enable row level security;
create policy "project attempts viewable by authenticated users"
  on project_attempts for select using (auth.role() = 'authenticated');
create policy "users manage own project attempts"
  on project_attempts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Challenge betas
create table challenge_betas (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  crux text,
  footwork text,
  sequence text,
  created_at timestamptz not null default now()
);
alter table challenge_betas enable row level security;
create policy "betas viewable by authenticated users"
  on challenge_betas for select using (auth.role() = 'authenticated');
create policy "authenticated users can post betas"
  on challenge_betas for insert with check (auth.uid() = user_id);
create policy "users can delete own betas"
  on challenge_betas for delete using (auth.uid() = user_id);

create table beta_helpful (
  beta_id uuid not null references challenge_betas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (beta_id, user_id)
);
alter table beta_helpful enable row level security;
create policy "beta helpful viewable by authenticated"
  on beta_helpful for select using (auth.role() = 'authenticated');
create policy "users manage own helpful marks"
  on beta_helpful for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
