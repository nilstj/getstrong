-- Beta tab redesign: section/body-type tags on beta, threaded text replies, and
-- emoji reactions on both beta and replies.

-- 1. Coaching tags on a beta (both optional).
alter table boulder_beta add column if not exists section text check (section in ('start', 'crux', 'top'));
alter table boulder_beta add column if not exists body_type text check (body_type in ('tall', 'short', 'neutral'));

-- 2. Threaded text replies on a beta.
create table if not exists boulder_beta_comments (
  id uuid primary key default gen_random_uuid(),
  beta_id uuid not null references boulder_beta(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
alter table boulder_beta_comments enable row level security;
create index if not exists boulder_beta_comments_beta_idx on boulder_beta_comments (beta_id, created_at);
drop policy if exists "boulder_beta_comments viewable by authenticated users" on boulder_beta_comments;
create policy "boulder_beta_comments viewable by authenticated users"
  on boulder_beta_comments for select using (auth.role() = 'authenticated');
drop policy if exists "users manage own boulder_beta_comments" on boulder_beta_comments;
create policy "users manage own boulder_beta_comments"
  on boulder_beta_comments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. Emoji reactions on a beta.
create table if not exists boulder_beta_reactions (
  beta_id uuid not null references boulder_beta(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (beta_id, user_id, emoji)
);
alter table boulder_beta_reactions enable row level security;
drop policy if exists "boulder_beta_reactions viewable by authenticated users" on boulder_beta_reactions;
create policy "boulder_beta_reactions viewable by authenticated users"
  on boulder_beta_reactions for select using (auth.role() = 'authenticated');
drop policy if exists "users manage own boulder_beta_reactions" on boulder_beta_reactions;
create policy "users manage own boulder_beta_reactions"
  on boulder_beta_reactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4. Emoji reactions on a reply.
create table if not exists boulder_beta_comment_reactions (
  comment_id uuid not null references boulder_beta_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);
alter table boulder_beta_comment_reactions enable row level security;
drop policy if exists "boulder_beta_comment_reactions viewable by authenticated users" on boulder_beta_comment_reactions;
create policy "boulder_beta_comment_reactions viewable by authenticated users"
  on boulder_beta_comment_reactions for select using (auth.role() = 'authenticated');
drop policy if exists "users manage own boulder_beta_comment_reactions" on boulder_beta_comment_reactions;
create policy "users manage own boulder_beta_comment_reactions"
  on boulder_beta_comment_reactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
