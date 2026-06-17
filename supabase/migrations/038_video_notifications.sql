-- Video notifications into the unified inbox.
-- Unlike the other events (which notify a single owner), a new beta/proof video
-- fans out to everyone who follows the author — matching the old
-- useFriendBetaVideos / useFriendProofVideos behavior. Videos are set as a
-- column update on an existing row, so these fire on INSERT *or* UPDATE of the
-- relevant column rather than on a dedicated insert like comments/reactions.

-- ── beta video added to a problem → notify the author's followers ───────────
create or replace function public.notify_beta_video()
returns trigger as $$
begin
  if new.beta_video_url is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.beta_video_url is not distinct from old.beta_video_url then
    return new;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, entity_id, data)
  select f.follower_id,
         new.user_id,
         'beta_video',
         new.id,
         jsonb_build_object(
           'video_url', new.beta_video_url,
           'grade', coalesce(new.grade_value_font, new.grade_value_vscale, new.color),
           'location', s.location,
           'session_id', new.session_id
         )
    from follows f
    join sessions s on s.id = new.session_id
   where f.following_id = new.user_id
     and f.follower_id <> new.user_id;

  return new;
end;
$$ language plpgsql security definer;

create trigger on_beta_video_notify
  after insert or update of beta_video_url on problems
  for each row execute procedure public.notify_beta_video();

-- ── proof video added to a challenge attempt → notify the author's followers ─
create or replace function public.notify_proof_video()
returns trigger as $$
begin
  if new.video_url is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.video_url is not distinct from old.video_url then
    return new;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, entity_id, data)
  select f.follower_id,
         new.user_id,
         'proof_video',
         new.challenge_id,
         jsonb_build_object(
           'video_url', new.video_url,
           'challenge_id', new.challenge_id,
           'challenge_title', c.title
         )
    from follows f
    join challenges c on c.id = new.challenge_id
   where f.following_id = new.user_id
     and f.follower_id <> new.user_id;

  return new;
end;
$$ language plpgsql security definer;

create trigger on_proof_video_notify
  after insert or update of video_url on challenge_attempts
  for each row execute procedure public.notify_proof_video();
