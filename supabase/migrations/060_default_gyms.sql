-- Multiple default gyms per user. Replaces the single profiles.default_gym text
-- with an ordered array of gym-name strings; element 0 is the primary/prefill gym.
-- Gyms remain free-text (no gyms table) — consistent with sessions.location and
-- problems.gym. See migration 050 for the original single default_gym column.

alter table profiles add column if not exists default_gyms text[] not null default '{}';

-- Backfill: carry each existing single default gym into the new array (one element).
update profiles
set default_gyms = array[trim(default_gym)]
where default_gym is not null
  and trim(default_gym) <> ''
  and default_gyms = '{}';

alter table profiles drop column if exists default_gym;
