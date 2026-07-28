-- Let the publisher state a boulder's grade at creation.
--
-- community_grade has existed since 044 ("crowd consensus; null until enough
-- data") but nothing ever wrote it, so every consumer — the home story strip,
-- CrewsSection, GymBoulderPicker, CreateBattleSheet — has been rendering a blank
-- grade. The climber standing at the wall publishing the boulder is the
-- best-placed person in the system to say what it is.
--
-- Adding a parameter does NOT replace a function, it creates a second signature,
-- and a 7-arg call against both would be ambiguous. So drop the 7-arg version and
-- create an 8-arg one whose new parameter defaults to null — which also means a
-- client still sending only the old 7 named arguments resolves here cleanly, so
-- this migration is safe to apply before the new client is deployed.
--
-- Body is 074's verbatim, including the first_logger photo gate; the only changes
-- are the new parameter and community_grade in the insert.

drop function if exists public.create_gym_problem(text, text, text, text, text, text, text);

create or replace function public.create_gym_problem(
  p_gym             text,
  p_color           text,
  p_wall_angle      text,
  p_name            text,
  p_image_url       text,
  p_beta_video_url  text default null,
  p_hold_color      text default null,
  p_community_grade text default null
)
returns gym_problems as $$
declare
  v_user_id uuid := auth.uid();
  v_row     gym_problems;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if p_gym is null or length(trim(p_gym)) = 0 then
    raise exception 'gym is required';
  end if;

  insert into public.gym_problems
    (gym, color, hold_color, wall_angle, name, image_url, beta_video_url, community_grade, created_by)
  values
    (trim(p_gym), p_color, p_hold_color, p_wall_angle, p_name, p_image_url, p_beta_video_url,
     nullif(trim(coalesce(p_community_grade, '')), ''), v_user_id)
  returning * into v_row;

  -- first_logger: 10 points, ONLY with a photo. No photo means no row at all, so
  -- the ledger never claims a zero-point award happened.
  if p_image_url is not null and length(trim(p_image_url)) > 0 then
    insert into public.beta_points (user_id, gym, gym_problem_id, points, reason, cycle_month)
    values (v_user_id, v_row.gym, v_row.id, 10, 'first_logger',
            to_char((now() at time zone 'utc'), 'YYYY-MM'));
  end if;

  return v_row;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;
