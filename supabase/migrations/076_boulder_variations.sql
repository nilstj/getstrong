-- Boulder variations: a challenge can optionally anchor to a shared boulder.
-- An anchored challenge is a "variation" — the same wall with altered rules
-- (no heel hook, eliminate the crimp, static only, link into the red). It shows
-- on the boulder page, anyone may try it, and a video-backed clear pays points.
--
-- Scheme added here (values sit on migration 074's scale):
--    5  variation_taught   to the SETTER, the first time someone ELSE clears one
--                          of their variations on this boulder with a video
--    1  variation_cleared  to the CLEARER, per variation, video required
--
-- Setting a variation pays nothing on its own: an award that needs a second
-- party can't be self-minted.

-- ── 1. the anchor ────────────────────────────────────────────────────────────
alter table challenges
  add column if not exists gym_problem_id uuid
    references gym_problems(id) on delete set null;

-- set null, not cascade: if the boulder is deleted (migration 070) the variation
-- survives as a plain portable challenge and keeps its attempt videos. The
-- movement library outlives the set.
create index if not exists challenges_gym_problem_idx
  on challenges (gym_problem_id) where gym_problem_id is not null;

-- ── 2. you must have SENT the boulder to set a variation on it ────────────────
-- No impossible trolling: the setter has proved it goes. A database constraint
-- rather than a client check, and the direct client insert in useChallenges.ts
-- keeps working unchanged. Portable challenges (null anchor) are unaffected.
drop policy if exists "authenticated users can create challenges" on challenges;
create policy "authenticated users can create challenges"
  on challenges for insert
  with check (
    auth.uid() = creator_id
    and (
      gym_problem_id is null
      or exists (
        select 1 from public.problems p
         where p.user_id = auth.uid()
           and p.gym_problem_id = challenges.gym_problem_id
           and p.sent
      )
    )
  );

-- ── 3. the UPDATE policy challenge_attempts never had ────────────────────────
-- Migration 003 gave the table select/insert/delete only. With RLS on, that
-- means useUpdateChallengeAttempt matches zero rows and fails silently, and
-- migration 038's `after update of video_url` trigger can never fire. Clearing
-- a variation and adding the video afterwards both need updates to work.
drop policy if exists "users update own challenge attempts" on challenge_attempts;
create policy "users update own challenge attempts"
  on challenge_attempts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── 4. ledger: challenge_id, the two new reasons, and their guards ───────────
alter table beta_points
  add column if not exists challenge_id uuid
    references challenges(id) on delete set null;

alter table beta_points drop constraint if exists beta_points_reason_check;
alter table beta_points add constraint beta_points_reason_check
  check (reason in ('bounty_won', 'helpful', 'first_logger', 'beta_posted',
                    'engagement', 'variation_taught', 'variation_cleared'));

-- Setter: capped at one award per boulder, the same shape and cap as
-- beta_points_beta_posted_uniq in migration 074. Set ten variations on one
-- boulder and it is still 5 points.
create unique index if not exists beta_points_variation_taught_uniq
  on beta_points (user_id, gym_problem_id) where reason = 'variation_taught';

-- Clearer: one award per variation.
create unique index if not exists beta_points_variation_cleared_uniq
  on beta_points (user_id, challenge_id) where reason = 'variation_cleared';

-- ── 5. the award trigger ─────────────────────────────────────────────────────
-- beta_points has no insert policy (046), so this is a SECURITY DEFINER trigger
-- rather than a client call. It fires on update as well as insert because an
-- attempt can be ticked first and get its video later.
create or replace function public.award_variation_points()
returns trigger as $$
declare
  v_creator     uuid;
  v_gpid        uuid;
  v_gym         text;
  v_title       text;
  v_clear_award uuid;
begin
  -- Only an evidenced clear pays. An unevidenced tick is still recorded and
  -- still displayed on the boulder — it just earns nothing.
  if not new.completed or new.video_url is null or length(trim(new.video_url)) = 0 then
    return new;
  end if;

  select c.creator_id, c.gym_problem_id, c.title
    into v_creator, v_gpid, v_title
    from public.challenges c
   where c.id = new.challenge_id;

  -- Portable challenges pay nothing, exactly as before this migration.
  if v_gpid is null then
    return new;
  end if;

  select gym into v_gym from public.gym_problems where id = v_gpid;
  if v_gym is null then
    return new;
  end if;

  -- The clearer's row is the idempotency key for the whole event: one per
  -- (user, variation). If it was already there, this is a re-tick or an edit,
  -- so there is nothing new to award and nobody new to tell.
  insert into public.beta_points
    (user_id, gym, gym_problem_id, challenge_id, points, reason, cycle_month)
  values
    (new.user_id, v_gym, v_gpid, new.challenge_id, 1, 'variation_cleared',
     to_char((now() at time zone 'utc'), 'YYYY-MM'))
  on conflict do nothing
  returning id into v_clear_award;

  if v_clear_award is null then
    return new;
  end if;

  -- Setter: 5 points the first time SOMEONE ELSE clears a variation of theirs on
  -- this boulder, plus the notification that brings them back to watch the clip.
  -- create_notification (037) already skips self-notification, but the guard here
  -- keeps the points award honest too.
  if v_creator is not null and v_creator <> new.user_id then
    insert into public.beta_points
      (user_id, gym, gym_problem_id, challenge_id, points, reason, cycle_month)
    values
      (v_creator, v_gym, v_gpid, new.challenge_id, 5, 'variation_taught',
       to_char((now() at time zone 'utc'), 'YYYY-MM'))
    on conflict do nothing;

    perform public.create_notification(
      v_creator, new.user_id, 'variation_cleared', v_gpid,
      jsonb_build_object(
        'challenge_id', new.challenge_id,
        'challenge_title', v_title,
        'video_url', new.video_url
      )
    );
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists on_variation_clear_award on challenge_attempts;
create trigger on_variation_clear_award
  after insert or update on challenge_attempts
  for each row execute procedure public.award_variation_points();
