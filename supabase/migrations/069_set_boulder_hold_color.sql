-- Keep a shared boulder's hold colour in sync when a linked problem's hold
-- colour is edited. gym_problems has no general update policy, so this goes
-- through a SECURITY DEFINER RPC (same pattern as set_boulder_setter).
create or replace function public.set_boulder_hold_color(p_gym_problem_id uuid, p_hold_color text)
returns void as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update gym_problems
     set hold_color = nullif(trim(coalesce(p_hold_color, '')), '')
   where id = p_gym_problem_id;
end;
$$ language plpgsql security definer;
