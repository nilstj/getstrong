-- IG redesign: the home activity feed. Unifies four event kinds over the boulders
-- in gyms the caller climbs at (any gym they've logged a problem in), newest
-- first, keyset-paged by event_at < p_before. SECURITY DEFINER for a stable read
-- across the joined tables; every row is public-readable data anyway.
create or replace function public.get_crew_feed(
  p_limit  int default 20,
  p_before timestamptz default null
)
returns table (
  event_type        text,
  event_at          timestamptz,
  actor_id          uuid,
  gym_problem_id    uuid,
  boulder_name      text,
  boulder_color     text,
  boulder_grade     text,
  boulder_image_url text,
  gym               text,
  beta_id           uuid,
  beta_snippet      text,
  beta_video_url    text
) as $$
declare
  v_user_id uuid := auth.uid();
  v_before  timestamptz := coalesce(p_before, now());
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  return query
  with my_gyms as (
    select distinct gym from problems
     where user_id = v_user_id and gym is not null
  )
  select * from (
    -- new boulder
    select 'boulder_new'::text, gp.created_at, gp.created_by, gp.id,
           gp.name, gp.color, gp.community_grade, gp.image_url, gp.gym,
           null::uuid, null::text, null::text
      from gym_problems gp
     where gp.gym in (select gym from my_gyms) and gp.created_by is not null

    union all
    -- send (someone logged a sent problem linked to a boulder)
    select 'send'::text, p.created_at, p.user_id, gp.id,
           gp.name, gp.color, gp.community_grade, gp.image_url, gp.gym,
           null::uuid, null::text, null::text
      from problems p
      join gym_problems gp on gp.id = p.gym_problem_id
     where gp.gym in (select gym from my_gyms) and p.sent = true

    union all
    -- beta added
    select 'beta_added'::text, bb.created_at, bb.user_id, gp.id,
           gp.name, gp.color, gp.community_grade, gp.image_url, gp.gym,
           bb.id, left(bb.body, 140), bb.video_url
      from boulder_beta bb
      join gym_problems gp on gp.id = bb.gym_problem_id
     where gp.gym in (select gym from my_gyms)

    union all
    -- beta worked for someone
    select 'beta_worked'::text, w.created_at, w.user_id, gp.id,
           gp.name, gp.color, gp.community_grade, gp.image_url, gp.gym,
           bb.id, left(bb.body, 140), bb.video_url
      from boulder_beta_worked w
      join boulder_beta bb on bb.id = w.beta_id
      join gym_problems gp on gp.id = bb.gym_problem_id
     where gp.gym in (select gym from my_gyms)
  ) feed
  where feed.event_at < v_before
  order by feed.event_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$ language plpgsql security definer;
