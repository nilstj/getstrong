-- Stop the home feed reading the gym's entire history on every load.
--
-- 055 (and its faithful re-creations 072) built the feed as a four-way UNION ALL
-- and then applied `where event_at < p_before`, `order by event_at desc` and
-- `limit 50` *outside* the union. That shape forces Postgres to materialise
-- every send, every published boulder and every piece of beta the caller's gyms
-- have ever produced, sort the lot, and discard all but 50 rows. The work grows
-- with the gym's total activity, so it gets slower with every climber who joins
-- — which is exactly backwards for the app's first screen.
--
-- This rewrite pushes the keyset predicate and the limit into each branch, so
-- every branch contributes at most v_limit rows and the final sort is over
-- 4 * v_limit rows.
--
-- Why that returns the same rows: if event E belongs in the global top v_limit,
-- then fewer than v_limit events anywhere are newer than E, so fewer than
-- v_limit events *in E's own branch* are newer than E — and E therefore survives
-- its branch's local limit. The per-branch limit has to be the full v_limit for
-- that to hold; anything smaller would start dropping rows the old query
-- returned. It holds per page too, since p_before only moves the window. The `send` and `beta_added` branches walk one boulder at a
-- time (LATERAL) so they ride the (gym_problem_id, created_at desc) indexes and
-- never sort a climber-scale row set.
--
-- The cost is now bounded by *how many boulders your gyms have*, not by how
-- many climbers log on them. That is the property worth having: a gym going
-- from 50 to 5000 members no longer changes what this function does.
--
-- Output rows are identical to 072's — same columns, same order, same
-- semantics. Only the plan changes.
--
-- RELEASE GATE: 095 must be applied first. Without its indexes the LATERAL
-- branches still work but fall back to sorting, so the win is partial.
--
-- Identifiers inside the body are deliberately aliased away from the RETURNS
-- TABLE column names (`gym`, `event_at`, `beta_id`, …). Those names are in
-- scope as plpgsql variables, and an unqualified reference to a column sharing
-- one of them is an ambiguity error raised on first call, not at CREATE.

create or replace function public.get_crew_feed(
  p_limit  int default 20,
  p_before timestamptz default null
)
returns table (
  event_type         text,
  event_at           timestamptz,
  actor_id           uuid,
  gym_problem_id     uuid,
  boulder_name       text,
  boulder_color      text,
  boulder_hold_color text,
  boulder_grade      text,
  boulder_image_url  text,
  gym                text,
  beta_id            uuid,
  beta_snippet       text,
  beta_video_url     text
) as $$
declare
  v_user_id uuid := auth.uid();
  v_before  timestamptz := coalesce(p_before, now());
  v_limit   int := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  return query
  with my_gyms as materialized (
    select distinct p.gym as gym_label
      from problems p
     where p.user_id = v_user_id and p.gym is not null
  ),
  -- Every boulder at a gym the caller climbs at, resolved once and reused by
  -- all four branches. Bounded by the gym's boulder count (hundreds), never by
  -- its membership. No status filter: 055 had none, and an archived boulder's
  -- events stay in the feed's history.
  my_boulders as materialized (
    select b.id          as b_id,
           b.name        as b_name,
           b.color       as b_color,
           b.hold_color  as b_hold,
           b.community_grade as b_grade,
           b.image_url   as b_image,
           b.gym         as b_gym,
           b.created_at  as b_created_at,
           b.created_by  as b_created_by
      from gym_problems b
      join my_gyms g on g.gym_label = b.gym
  )
  select f.e_type, f.e_at, f.e_actor, f.e_boulder, f.e_name, f.e_color,
         f.e_hold, f.e_grade, f.e_image, f.e_gym, f.e_beta, f.e_snippet, f.e_video
    from (
      -- new boulder
      (select 'boulder_new'::text as e_type, b.b_created_at as e_at,
              b.b_created_by as e_actor, b.b_id as e_boulder, b.b_name as e_name,
              b.b_color as e_color, b.b_hold as e_hold, b.b_grade as e_grade,
              b.b_image as e_image, b.b_gym as e_gym,
              null::uuid as e_beta, null::text as e_snippet, null::text as e_video
         from my_boulders b
        where b.b_created_by is not null
          and b.b_created_at < v_before
        order by b.b_created_at desc
        limit v_limit)

      union all

      -- send (someone logged a sent problem linked to a boulder)
      (select 'send'::text, s.created_at, s.user_id, b.b_id, b.b_name,
              b.b_color, b.b_hold, b.b_grade, b.b_image, b.b_gym,
              null::uuid, null::text, null::text
         from my_boulders b
         cross join lateral (
           select p.created_at, p.user_id
             from problems p
            where p.gym_problem_id = b.b_id
              and p.sent
              and p.created_at < v_before
            order by p.created_at desc
            limit v_limit
         ) s
        order by s.created_at desc
        limit v_limit)

      union all

      -- beta added
      (select 'beta_added'::text, bb.created_at, bb.user_id, b.b_id, b.b_name,
              b.b_color, b.b_hold, b.b_grade, b.b_image, b.b_gym,
              bb.id, left(bb.body, 140), bb.video_url
         from my_boulders b
         cross join lateral (
           select bt.id, bt.created_at, bt.user_id, bt.body, bt.video_url
             from boulder_beta bt
            where bt.gym_problem_id = b.b_id
              and bt.created_at < v_before
            order by bt.created_at desc
            limit v_limit
         ) bb
        order by bb.created_at desc
        limit v_limit)

      union all

      -- beta worked for someone. Two hops from the boulder and the rarest event
      -- of the four, so this one scans boulder_beta_worked newest-first (095's
      -- created_at index) and lets the joins filter, rather than nesting a
      -- LATERAL inside a LATERAL for a table this quiet.
      (select 'beta_worked'::text, w.created_at, w.user_id, b.b_id, b.b_name,
              b.b_color, b.b_hold, b.b_grade, b.b_image, b.b_gym,
              bb.id, left(bb.body, 140), bb.video_url
         from boulder_beta_worked w
         join boulder_beta bb on bb.id = w.beta_id
         join my_boulders b on b.b_id = bb.gym_problem_id
        where w.created_at < v_before
        order by w.created_at desc
        limit v_limit)
    ) f
   order by f.e_at desc
   limit v_limit;
end;
$$ language plpgsql security definer;

-- A plpgsql body is parsed at CREATE but its queries are only planned on first
-- call, so a clean apply proves nothing. Force a plan with a caller that looks
-- authenticated: set_config(..., true) is transaction-local and the uuid owns
-- no rows, so this reads nothing and leaves nothing behind.
do $$
declare
  v_rows int;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}',
    true
  );
  begin
    select count(*) into v_rows from public.get_crew_feed(5, null);
    raise notice 'get_crew_feed planned and ran: % rows for a climber with no problems', v_rows;
  exception when others then
    -- Only the auth guard is allowed to be survivable here: it fires before the
    -- query is planned, so it means this session could not fake a caller, not
    -- that the function is broken. Anything else is a real fault and must stop
    -- the apply.
    if sqlerrm = 'Not authenticated' then
      raise warning 'get_crew_feed was NOT planned (auth.uid() is null in this session). Open the home page once and confirm the feed loads before trusting this migration.';
    else
      raise;
    end if;
  end;
end;
$$;
