create table challenge_invitations (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (challenge_id, sender_id, recipient_id)
);

alter table challenge_invitations enable row level security;

create policy "sender and recipient can view invitations"
  on challenge_invitations for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

create policy "authenticated users can send invitations"
  on challenge_invitations for insert
  with check (auth.uid() = sender_id);

create policy "sender can delete invitations"
  on challenge_invitations for delete
  using (auth.uid() = sender_id);
