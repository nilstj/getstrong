-- Deleting a shared boulder must never leave a variation orphaned.
--
-- challenges.gym_problem_id is ON DELETE SET NULL (076), so before this migration
-- deleting a boulder silently turned every variation on it into a portable
-- challenge with no gym, no colour and no marker -- a challenge titled "no heel
-- hook on the arête" that nobody can place. Worse, 070's guard could not see it:
-- clearing a variation writes only challenge_attempts, never a problems row, so
-- other climbers' clears never blocked the delete.
--
-- Reproduces 070's delete_gym_problem and adds one guard plus one cleanup step.
-- Table references are qualified and search_path is pinned, matching the
-- hardening the newer migrations use. Signature unchanged, so no client call
-- site moves.
--
-- ORDER: apply after 074, 075, 076 and 077.

create or replace function public.delete_gym_problem(p_gym_problem_id uuid)
returns void as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.gym_problems
     where id = p_gym_problem_id and created_by = v_user
  ) then
    raise exception 'Only the setter can delete this boulder';
  end if;

  if exists (
    select 1 from public.problems
     where gym_problem_id = p_gym_problem_id and user_id <> v_user
  ) then
    raise exception 'Others have logged this boulder — mark it stripped instead';
  end if;

  -- Never destroy another climber's work. Refuse if any variation here was set by
  -- someone else, or if anyone else has cleared one, commented on one, added
  -- beta to one, or marked one of its beta entries helpful -- all of which
  -- cascade off challenges. Strip archives the boulder instead and keeps every
  -- one of those.
  if exists (
    select 1 from public.challenges c
     where c.gym_problem_id = p_gym_problem_id
       and (
         c.creator_id <> v_user
         or exists (
           select 1 from public.challenge_attempts a
            where a.challenge_id = c.id and a.user_id <> v_user
         )
         or exists (
           select 1 from public.challenge_comments m
            where m.challenge_id = c.id and m.user_id <> v_user
         )
         or exists (
           select 1 from public.challenge_betas b
            where b.challenge_id = c.id and b.user_id <> v_user
         )
         or exists (
           select 1 from public.challenge_betas b
             join public.beta_helpful h on h.beta_id = b.id
            where b.challenge_id = c.id and h.user_id <> v_user
         )
       )
  ) then
    raise exception 'Other climbers are on a variation of this boulder — mark it stripped instead';
  end if;

  -- Otherwise every variation here is guaranteed to be the setter's own and
  -- untouched by anyone else -- the guard above just proved it -- so take them
  -- with the boulder rather than letting ON DELETE SET NULL orphan them.
  -- challenge_attempts, challenge_comments and challenge_betas all cascade off
  -- challenges (003, 009, 018), and beta_helpful cascades off challenge_betas
  -- in turn (018), so one delete here is enough.
  delete from public.challenges where gym_problem_id = p_gym_problem_id;

  delete from public.gym_problems where id = p_gym_problem_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;
