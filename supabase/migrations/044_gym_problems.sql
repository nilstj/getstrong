-- Crew Projects step 1: the shared, crowd-created boulder identity the schema
-- lacks. A personal `problems` row can optionally *claim* onto one of these.
-- All changes are additive. Inserts/claims route through SECURITY DEFINER
-- functions (see migration 042) because auth.uid() does not evaluate reliably
-- inside RLS WITH CHECK here.

create table gym_problems (
  id uuid primary key default gen_random_uuid(),
  gym text not null,
  wall_angle text,                       -- descriptive free text, e.g. "overhang"
  color text,
  community_grade text,                  -- crowd consensus; null until enough data
  name text,                             -- first logger names it
  image_url text,                        -- canonical photo from first logger
  created_by uuid references auth.users(id) on delete set null,
  set_at date not null default current_date,
  expires_at date not null default (current_date + 30),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);
alter table gym_problems enable row level security;

-- Discovery queries filter on gym + active status.
create index gym_problems_gym_active_idx
  on gym_problems (gym) where status = 'active';

-- Link a personal problem to a shared boulder. null = not claimed (current behavior).
alter table problems
  add column gym_problem_id uuid references gym_problems(id) on delete set null;
create index problems_gym_problem_idx on problems (gym_problem_id);

-- Any authenticated user may read shared boulders (they are public by nature).
create policy "gym_problems viewable by authenticated users"
  on gym_problems for select
  using (auth.role() = 'authenticated');
-- No direct insert/update policy: writes go through the RPCs below only.

-- Create a new shared boulder. Caller becomes created_by.
create or replace function public.create_gym_problem(
  p_gym        text,
  p_color      text,
  p_wall_angle text,
  p_name       text,
  p_image_url  text
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

  insert into public.gym_problems (gym, color, wall_angle, name, image_url, created_by)
  values (trim(p_gym), p_color, p_wall_angle, p_name, p_image_url, v_user_id)
  returning * into v_row;

  return v_row;
end;
$$ language plpgsql security definer;

-- Claim (or unclaim, with null) a personal problem onto a shared boulder.
-- Only the problem's owner may do this.
create or replace function public.claim_gym_problem(
  p_problem_id     uuid,
  p_gym_problem_id uuid
)
returns void as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.problems
     set gym_problem_id = p_gym_problem_id
   where id = p_problem_id
     and user_id = v_user_id;

  if not found then
    raise exception 'Problem not found or not owned by caller';
  end if;
end;
$$ language plpgsql security definer;
