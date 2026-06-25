-- Boulder picker: shared boulders can carry a beta video. Adds the column and
-- captures it at creation. Reproduces migration 046's create_gym_problem body
-- (first_logger points) and only adds beta_video_url. The old 5-arg signature
-- is dropped so the 6-arg version isn't an ambiguous overload.

alter table gym_problems add column if not exists beta_video_url text;

drop function if exists public.create_gym_problem(text, text, text, text, text);

create or replace function public.create_gym_problem(
  p_gym            text,
  p_color          text,
  p_wall_angle     text,
  p_name           text,
  p_image_url      text,
  p_beta_video_url text default null
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

  insert into public.gym_problems (gym, color, wall_angle, name, image_url, beta_video_url, created_by)
  values (trim(p_gym), p_color, p_wall_angle, p_name, p_image_url, p_beta_video_url, v_user_id)
  returning * into v_row;

  -- first_logger points to the creator (preserved from migration 046).
  insert into public.beta_points (user_id, gym, gym_problem_id, points, reason, cycle_month)
  values (v_user_id, v_row.gym, v_row.id, 10, 'first_logger',
          to_char((now() at time zone 'utc'), 'YYYY-MM'));

  return v_row;
end;
$$ language plpgsql security definer;
