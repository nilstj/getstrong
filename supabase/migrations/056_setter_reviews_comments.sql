-- Sendtrain page: a community-maintained setter name, star reviews, and a
-- text comment thread on a shared boulder.

-- 1. Setter name on the boulder (community-editable, like beta). gym_problems
--    has no general update policy, so edits go through a SECURITY DEFINER RPC.
alter table gym_problems add column if not exists setter text;

create or replace function public.set_boulder_setter(p_gym_problem_id uuid, p_setter text)
returns void as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;
  update gym_problems
     set setter = nullif(trim(coalesce(p_setter, '')), '')
   where id = p_gym_problem_id;
  if not found then
    raise exception 'boulder not found';
  end if;
end;
$$ language plpgsql security definer;

-- 2. Star ratings + optional written review, one per user per boulder.
create table if not exists gym_problem_reviews (
  gym_problem_id uuid not null references gym_problems(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  review text,
  created_at timestamptz not null default now(),
  primary key (gym_problem_id, user_id)
);
alter table gym_problem_reviews enable row level security;

drop policy if exists "gym_problem_reviews viewable by authenticated users" on gym_problem_reviews;
create policy "gym_problem_reviews viewable by authenticated users"
  on gym_problem_reviews for select using (auth.role() = 'authenticated');
drop policy if exists "users manage own gym_problem_reviews" on gym_problem_reviews;
create policy "users manage own gym_problem_reviews"
  on gym_problem_reviews for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. Text comments on the boulder (beta discussion).
create table if not exists gym_problem_comments (
  id uuid primary key default gen_random_uuid(),
  gym_problem_id uuid not null references gym_problems(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
alter table gym_problem_comments enable row level security;
create index if not exists gym_problem_comments_gp_idx on gym_problem_comments (gym_problem_id, created_at);

drop policy if exists "gym_problem_comments viewable by authenticated users" on gym_problem_comments;
create policy "gym_problem_comments viewable by authenticated users"
  on gym_problem_comments for select using (auth.role() = 'authenticated');
drop policy if exists "users manage own gym_problem_comments" on gym_problem_comments;
create policy "users manage own gym_problem_comments"
  on gym_problem_comments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
