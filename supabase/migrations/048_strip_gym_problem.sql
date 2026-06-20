-- Crew Projects step 4a: community "this got stripped" action. Any crew member
-- (a user with a problem claimed onto the boulder) can archive it early. The
-- RPC is the only write path to gym_problems.status (no update RLS policy), and
-- it notifies the rest of the crew. Natural expiry is handled read-time in the
-- client (no job); this covers early archival.

create or replace function public.strip_gym_problem(p_gym_problem_id uuid)
returns void as $$
declare
  v_user_id uuid := auth.uid();
  v_boulder gym_problems;
  v_member  uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Caller must be a crew member: have a problem claimed onto this boulder.
  if not exists (
    select 1 from public.problems
    where gym_problem_id = p_gym_problem_id and user_id = v_user_id
  ) then
    raise exception 'Only a crew member can strip this boulder';
  end if;

  update public.gym_problems
     set status = 'archived'
   where id = p_gym_problem_id and status = 'active'
  returning * into v_boulder;

  if not found then
    return;  -- already archived (or gone); nothing to do
  end if;

  -- Notify the rest of the crew that their project is gone.
  for v_member in
    select distinct p.user_id
      from public.problems p
     where p.gym_problem_id = p_gym_problem_id
       and p.user_id <> v_user_id
  loop
    perform public.create_notification(
      v_member, v_user_id, 'crew_stripped', p_gym_problem_id,
      jsonb_build_object('name', v_boulder.name, 'color', v_boulder.color)
    );
  end loop;
end;
$$ language plpgsql security definer;
