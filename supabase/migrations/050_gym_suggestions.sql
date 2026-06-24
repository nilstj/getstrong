-- Gym-name autocomplete + default gym. Additive: a per-user default gym, and a
-- read-only function exposing distinct gym names (with usage counts) across all
-- users so the Location typeahead can converge spellings. Sessions aren't
-- globally readable, so the function is SECURITY DEFINER and returns ONLY the
-- name strings + counts (no session/problem rows).

alter table profiles add column if not exists default_gym text;

create or replace function public.gym_suggestions()
returns table (name text, uses bigint) as $$
  select g.name, count(*) as uses
  from (
    select trim(location) as name from public.sessions where coalesce(trim(location), '') <> ''
    union all
    select trim(gym)      as name from public.problems where coalesce(trim(gym), '') <> ''
  ) g
  group by g.name
  order by uses desc, g.name asc;
$$ language sql stable security definer;
