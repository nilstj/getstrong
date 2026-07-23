-- Setter role: a per-user permission (like is_admin) plus a "setter's intention"
-- note on shared boulders that only admins or setters can edit.

-- 1. New per-user role flag, mirroring is_admin (migration 007).
alter table profiles add column if not exists is_setter boolean not null default false;

-- 2. Admins grant/revoke the setter role. profiles UPDATE RLS is self-only, so
--    this goes through a SECURITY DEFINER RPC that checks the caller is an admin.
create or replace function public.set_user_setter(p_user_id uuid, p_is_setter boolean)
returns void as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Only admins can change the setter role';
  end if;
  update profiles set is_setter = coalesce(p_is_setter, false) where id = p_user_id;
  if not found then
    raise exception 'user not found';
  end if;
end;
$$ language plpgsql security definer;

-- 3. Setter's intention on a shared boulder — what the boulder is meant to test /
--    how it should be climbed, authored by the setter. Distinct from the
--    community-editable `setter` name (migration 056). gym_problems has no general
--    update policy, so edits go through this SECURITY DEFINER RPC, which enforces
--    that the caller is an admin or a setter.
alter table gym_problems add column if not exists setter_intention text;

create or replace function public.set_boulder_setter_intention(p_gym_problem_id uuid, p_intention text)
returns void as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_setter = true)) then
    raise exception 'Only admins or setters can edit the setter intention';
  end if;
  update gym_problems
     set setter_intention = nullif(trim(coalesce(p_intention, '')), '')
   where id = p_gym_problem_id;
  if not found then
    raise exception 'boulder not found';
  end if;
end;
$$ language plpgsql security definer;
