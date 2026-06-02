create table challenge_attempt_reactions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references challenge_attempts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique(attempt_id, user_id, emoji)
);

alter table challenge_attempt_reactions enable row level security;

create policy "attempt reactions viewable by authenticated users"
  on challenge_attempt_reactions for select using (auth.role() = 'authenticated');

create policy "users manage own attempt reactions"
  on challenge_attempt_reactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
