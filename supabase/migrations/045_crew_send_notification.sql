-- Crew Projects step 2: notify crewmates when a member sends a shared boulder
-- ("Anna sent the Blue overhang"). Membership and crew state are DERIVED from
-- problems (a member = any user with a problem claimed onto the boulder), so
-- there is no gym_problem_members table — this trigger reads problems directly.

create or replace function public.notify_crew_send()
returns trigger as $$
declare
  v_boulder gym_problems;
  v_grade   text;
  v_flashed boolean;
  v_member  uuid;
begin
  -- Only when the problem is both claimed and sent, at the moment that
  -- combination first becomes true: either `sent` just flipped to true, or the
  -- problem was just claimed while already sent. If it was already
  -- claimed-and-sent, do nothing (avoids duplicate pings on unrelated edits).
  if new.gym_problem_id is null or new.sent is not true then
    return new;
  end if;
  if old.sent is not distinct from true
     and old.gym_problem_id is not distinct from new.gym_problem_id then
    return new;
  end if;

  select * into v_boulder from gym_problems where id = new.gym_problem_id;
  if not found then
    return new;
  end if;

  v_grade   := coalesce(new.grade_value_font, new.grade_value_vscale, v_boulder.community_grade);
  v_flashed := (new.attempts = 1);

  -- Notify every OTHER user with a problem on this boulder (the derived crew).
  for v_member in
    select distinct p.user_id
      from problems p
     where p.gym_problem_id = new.gym_problem_id
       and p.user_id <> new.user_id
  loop
    perform public.create_notification(
      v_member, new.user_id, 'crew_send', new.gym_problem_id,
      jsonb_build_object(
        'color',   v_boulder.color,
        'name',    v_boulder.name,
        'grade',   v_grade,
        'flashed', v_flashed
      )
    );
  end loop;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_problem_crew_send on problems;
create trigger on_problem_crew_send
  after update on problems
  for each row execute procedure public.notify_crew_send();
