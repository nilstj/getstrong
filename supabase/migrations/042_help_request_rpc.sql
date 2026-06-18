-- Bypass the RLS auth.uid() evaluation issue on help_requests by routing
-- inserts through a SECURITY DEFINER function that captures auth.uid() in
-- PL/pgSQL execution context, where it reliably reflects the caller's JWT.

create or replace function public.create_help_request(
  p_problem_id uuid,
  p_message     text,
  p_visibility  text
)
returns uuid as $$
declare
  v_user_id uuid := auth.uid();
  v_id      uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_visibility not in ('friends', 'global') then
    raise exception 'Invalid visibility value: %', p_visibility;
  end if;

  insert into public.help_requests (problem_id, user_id, message, visibility)
  values (p_problem_id, v_user_id, p_message, p_visibility)
  returning id into v_id;

  return v_id;
end;
$$ language plpgsql security definer;
