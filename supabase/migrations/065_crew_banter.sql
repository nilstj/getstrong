-- Crew banter: a simple message thread on a crew, members only. Writes go
-- straight through RLS (is_crew_member is SECURITY DEFINER, so no recursion).
create table if not exists crew_messages (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references crews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists crew_messages_crew_idx on crew_messages (crew_id, created_at);

alter table crew_messages enable row level security;

drop policy if exists "crew_messages readable by members" on crew_messages;
create policy "crew_messages readable by members" on crew_messages for select
  using (is_crew_member(crew_id));

drop policy if exists "crew_messages insert by members" on crew_messages;
create policy "crew_messages insert by members" on crew_messages for insert
  with check (user_id = auth.uid() and is_crew_member(crew_id));

drop policy if exists "crew_messages delete own" on crew_messages;
create policy "crew_messages delete own" on crew_messages for delete
  using (user_id = auth.uid());
