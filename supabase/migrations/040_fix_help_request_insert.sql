-- Fix: the help_requests INSERT policy's inline subquery against `problems`
-- (which has its own RLS) could fail the WITH CHECK, producing
-- "new row violates row-level security policy". Move the media-prerequisite
-- check into a SECURITY DEFINER helper so it evaluates reliably, regardless of
-- the problems table's RLS.

create or replace function public.problem_has_media(p_problem_id uuid)
returns boolean as $$
  select exists (
    select 1 from problems p
    where p.id = p_problem_id
      and (p.image_url is not null or p.beta_video_url is not null)
  );
$$ language sql stable security definer;

drop policy if exists "create own help request" on help_requests;

create policy "create own help request"
  on help_requests for insert
  with check (
    auth.uid() = user_id
    and public.problem_has_media(problem_id)
  );
