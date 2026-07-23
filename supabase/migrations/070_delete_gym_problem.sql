-- Let the setter delete a shared boulder they created by mistake. Distinct from
-- strip_gym_problem (which archives). Only the creator may delete, and only when
-- no one else has logged it (their crews would otherwise lose the project — use
-- strip for that). Child beta/reviews/comments/reactions cascade; linked
-- problems / points / help / battles are ON DELETE SET NULL, so users' own logs
-- survive, just unlinked.
create or replace function public.delete_gym_problem(p_gym_problem_id uuid)
returns void as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from gym_problems where id = p_gym_problem_id and created_by = v_user) then
    raise exception 'Only the setter can delete this boulder';
  end if;
  if exists (
    select 1 from problems
    where gym_problem_id = p_gym_problem_id and user_id <> v_user
  ) then
    raise exception 'Others have logged this boulder — mark it stripped instead';
  end if;
  delete from gym_problems where id = p_gym_problem_id;
end;
$$ language plpgsql security definer;
