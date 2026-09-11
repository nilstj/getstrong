-- Aggregate the discover/home boulder stats in the database instead of on the phone.
--
-- useDiscoverBoulders built two numbers per boulder — how many climbers have
-- been on it, and the crowd-consensus grade — by downloading *every* problem row
-- linked to *every* boulder at the caller's gyms and reducing them in
-- JavaScript. The two values are a distinct count and a histogram; the rows
-- themselves were never wanted. At a gym with 5000 members that is tens of
-- thousands of rows over 4G to render a number on a tile.
--
-- This returns one row per boulder instead: the distinct-climber count, and the
-- grade histogram as jsonb. The payload is bounded by (boulders x distinct
-- grades logged on them) — single-digit rows per boulder — rather than by the
-- number of climbers.
--
-- The consensus *ranking* stays in TypeScript (utils/consensusGrade.ts). Only
-- the counting moves. Picking the winner needs the Font grade ladder to break
-- ties toward the harder grade, and a second copy of that ladder in SQL is a
-- divergence waiting to happen — so the database counts and the client ranks.
--
-- SECURITY INVOKER (the default) on purpose: `problems` is already readable by
-- any authenticated user (migration 015), and letting that policy run means an
-- anon caller gets zero rows without this function needing an auth guard of its
-- own. There is nothing here to justify a DEFINER's privilege escalation.
--
-- `language sql` on purpose too: a SQL body is validated when it is created,
-- unlike plpgsql, whose queries are only planned on first call.

create or replace function public.get_boulder_crew_stats(p_ids uuid[])
returns table (
  gym_problem_id uuid,
  crew_count     integer,
  grade_counts   jsonb
)
language sql
stable
set search_path = public, pg_temp
as $$
  with linked as (
    select p.gym_problem_id as b_id, p.user_id as u_id, p.grade_value_font as g
      from problems p
     where p.gym_problem_id = any(p_ids)
  ),
  crew as (
    select l.b_id, count(distinct l.u_id)::integer as n
      from linked l
     group by l.b_id
  ),
  grades as (
    select t.b_id, jsonb_object_agg(t.g, t.n) as counts
      from (
        select l.b_id, l.g, count(*)::integer as n
          from linked l
         where l.g is not null
         group by l.b_id, l.g
      ) t
     group by t.b_id
  )
  select c.b_id, c.n, coalesce(g.counts, '{}'::jsonb)
    from crew c
    left join grades g on g.b_id = c.b_id;
$$;

-- A boulder nobody has logged produces no row at all; the client reads an
-- absent boulder as a crew count of 0, which is what the old client-side
-- reduction did too.
do $$
declare
  v_rows int;
begin
  select count(*) into v_rows
    from public.get_boulder_crew_stats(array[]::uuid[]);
  if v_rows <> 0 then
    raise exception 'get_boulder_crew_stats returned % rows for an empty id list', v_rows;
  end if;
  raise notice 'get_boulder_crew_stats ok';
end;
$$;
