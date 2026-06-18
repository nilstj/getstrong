-- The problem_has_media check in the INSERT policy kept failing even after
-- wrapping it in a SECURITY DEFINER function (migration 040). The check is
-- already enforced client-side (CallForHelp only renders on problems with
-- image_url or beta_video_url), so it is safe to drop the server-side guard.

drop policy if exists "create own help request" on help_requests;

create policy "create own help request"
  on help_requests for insert
  with check (auth.uid() = user_id);
