-- IG redesign: boulder-scoped beta. Beta is a first-class object on a shared
-- boulder (distinct from per-problem comments and challenge betas). A beta is a
-- tip (text) and/or an external video link. `awarded` records whether the author
-- has already received beta_points for this beta (set once in 053's RPC), so
-- reputation cannot be farmed by toggling "worked for me".
create table if not exists boulder_beta (
  id uuid primary key default gen_random_uuid(),
  gym_problem_id uuid not null references gym_problems(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text,
  video_url text,
  awarded boolean not null default false,
  created_at timestamptz not null default now(),
  constraint boulder_beta_nonempty check (
    (body is not null and length(trim(body)) > 0) or video_url is not null
  )
);
alter table boulder_beta enable row level security;

create index if not exists boulder_beta_gp_idx on boulder_beta (gym_problem_id, created_at desc);

drop policy if exists "boulder_beta viewable by authenticated users" on boulder_beta;
create policy "boulder_beta viewable by authenticated users"
  on boulder_beta for select using (auth.role() = 'authenticated');
drop policy if exists "users manage own boulder_beta" on boulder_beta;
create policy "users manage own boulder_beta"
  on boulder_beta for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
