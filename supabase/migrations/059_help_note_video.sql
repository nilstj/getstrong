-- Beta help requests can carry a message + a video link (e.g. "stuck on the
-- crux crimp" + a clip of the attempt), so responders know what to help with.
alter table gym_problem_help add column if not exists note text;
alter table gym_problem_help add column if not exists video_url text;

-- Replace the 1-arg request_beta_help with a 3-arg version (note + video).
drop function if exists public.request_beta_help(uuid);

create or replace function public.request_beta_help(
  p_gym_problem_id uuid,
  p_note text default null,
  p_video_url text default null
)
returns void as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;
  insert into gym_problem_help (gym_problem_id, user_id, note, video_url, created_at, resolved_at)
  values (
    p_gym_problem_id,
    v_user,
    nullif(trim(coalesce(p_note, '')), ''),
    nullif(trim(coalesce(p_video_url, '')), ''),
    now(),
    null
  )
  on conflict (gym_problem_id, user_id)
  do update set
    note = excluded.note,
    video_url = excluded.video_url,
    created_at = now(),
    resolved_at = null;
end;
$$ language plpgsql security definer;
