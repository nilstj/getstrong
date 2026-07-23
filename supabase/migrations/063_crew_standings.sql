-- Cross-crew leaderboard: rank crews against each other. Crew rosters are private
-- under RLS, so this aggregates in a SECURITY DEFINER function that returns only
-- crew-level totals (no individual members leak). Ranked by average points per
-- member so a small crew isn't buried under a big one.
create or replace function public.crew_standings(p_gym text, p_cycle text)
returns table (
  crew_id uuid,
  name text,
  emoji text,
  home_gym text,
  member_count integer,
  total_points bigint,
  avg_points numeric
)
language sql security definer stable set search_path = public as $$
  select
    c.id,
    c.name,
    c.emoji,
    c.home_gym,
    count(distinct m.user_id)::integer as member_count,
    coalesce(sum(bp.points), 0)::bigint as total_points,
    case when count(distinct m.user_id) > 0
         then round(coalesce(sum(bp.points), 0)::numeric / count(distinct m.user_id))
         else 0 end as avg_points
  from crews c
  join crew_members m on m.crew_id = c.id
  left join beta_points bp on bp.user_id = m.user_id and bp.cycle_month = p_cycle
  where (p_gym is null or c.home_gym = p_gym)
  group by c.id, c.name, c.emoji, c.home_gym
  having count(distinct m.user_id) > 0
  order by avg_points desc, total_points desc, c.created_at
  limit 50;
$$;
