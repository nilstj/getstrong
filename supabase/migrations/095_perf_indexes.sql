-- Indexes for the queries the app actually runs.
--
-- `problems` and `sessions` are the two busiest tables in the app and between
-- them carried three indexes, all on columns added late (044, 080). A foreign
-- key does not create an index in Postgres, so every lookup by `user_id` — the
-- home page, the dashboard, the friends feed, the `my_gyms` CTE inside
-- get_crew_feed — was a sequential scan over the whole table. That is invisible
-- at a few hundred rows and is the first thing to fall over as the table grows.
--
-- Applying this by hand: these are plain CREATE INDEX, which takes a write lock
-- for the duration. On today's row counts that is milliseconds. If a table here
-- has grown large by the time this is applied, run that statement instead as
-- `create index concurrently` — which cannot run inside a transaction block, so
-- it has to be sent on its own, outside the rest of this file.

-- Every per-climber read of problems: dashboard, discover, get_crew_feed's
-- my_gyms CTE. The trailing created_at also serves the friends feed, which is
-- `user_id in (...) order by created_at desc limit 300`.
create index if not exists problems_user_created_idx
  on problems (user_id, created_at desc);

-- The gym grade leaderboard: one gym, sent only, one month of created_at.
create index if not exists problems_gym_sent_created_idx
  on problems (gym, created_at desc)
  where sent and gym is not null;

-- get_crew_feed's `send` branch, which walks one boulder at a time newest-first
-- (see 096). The existing problems_gym_problem_idx is a prefix of this one but
-- stops short of the ordering, so the branch would have to sort.
create index if not exists problems_boulder_sent_created_idx
  on problems (gym_problem_id, created_at desc)
  where sent and gym_problem_id is not null;

-- The session list and the dashboard, both "mine, newest first".
create index if not exists sessions_user_date_idx
  on sessions (user_id, date desc);

-- follows' primary key is (follower_id, following_id), which answers "who do I
-- follow" but cannot answer "who follows me" without a scan.
create index if not exists follows_following_idx
  on follows (following_id);

-- get_crew_feed's `boulder_new` branch. gym_problems_gym_active_idx (044) is on
-- (gym) where status = 'active' — it finds the rows but carries no ordering, so
-- the branch sorts every boulder in the gym to return the newest few.
create index if not exists gym_problems_gym_created_idx
  on gym_problems (gym, created_at desc);

-- get_crew_feed's `beta_worked` branch scans this newest-first; the table's
-- primary key is (beta_id, user_id) and there is no index on created_at.
create index if not exists boulder_beta_worked_created_idx
  on boulder_beta_worked (created_at desc);
