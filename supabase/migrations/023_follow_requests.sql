create table follow_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(requester_id, recipient_id)
);

alter table follow_requests enable row level security;

create policy "requester and recipient can view requests"
  on follow_requests for select
  using (auth.uid() = requester_id or auth.uid() = recipient_id);

create policy "authenticated users can send requests"
  on follow_requests for insert
  with check (auth.uid() = requester_id);

create policy "requester or recipient can delete requests"
  on follow_requests for delete
  using (auth.uid() = requester_id or auth.uid() = recipient_id);
