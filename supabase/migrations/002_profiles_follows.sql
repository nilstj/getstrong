-- Profiles
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles viewable by authenticated users"
  on profiles for select
  using (auth.role() = 'authenticated');

create policy "users can insert own profile"
  on profiles for insert
  with check (auth.uid() = id);

create policy "users can update own profile"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create profile on sign up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Follows
create table follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id)
);

alter table follows enable row level security;

create policy "follows viewable by authenticated users"
  on follows for select
  using (auth.role() = 'authenticated');

create policy "users manage own follows"
  on follows for insert
  with check (auth.uid() = follower_id);

create policy "users delete own follows"
  on follows for delete
  using (auth.uid() = follower_id);

-- Avatars storage bucket (run separately if bucket doesn't exist)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatar images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "users can upload own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "users can update own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
