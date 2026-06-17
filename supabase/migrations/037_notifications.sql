-- Unified notifications center.
-- A single table that every social event writes into via triggers, so the
-- client can show one inbox with real server-side read/unread state instead of
-- the per-source localStorage timestamps the AppBar previously juggled.

create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete cascade,
  type text not null,
  entity_id uuid,            -- the row to navigate to (problem, challenge, request, …)
  data jsonb not null default '{}'::jsonb,  -- denormalized context for rendering
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table notifications enable row level security;

-- Recipients can only see and manage their own notifications.
create policy "users can read own notifications"
  on notifications for select
  using (auth.uid() = recipient_id);

create policy "users can update own notifications"
  on notifications for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

create policy "users can delete own notifications"
  on notifications for delete
  using (auth.uid() = recipient_id);

-- No insert policy: rows are created only by the security-definer triggers
-- below, which run as the table owner and bypass RLS.

create index notifications_recipient_created_idx
  on notifications (recipient_id, created_at desc);

create index notifications_unread_idx
  on notifications (recipient_id)
  where read_at is null;

-- Helper: insert a notification, skipping self-notifications (you don't get
-- pinged for reacting to your own problem, commenting your own challenge, etc).
create or replace function public.create_notification(
  p_recipient uuid,
  p_actor uuid,
  p_type text,
  p_entity uuid,
  p_data jsonb default '{}'::jsonb
)
returns void as $$
begin
  if p_recipient is null or p_recipient = p_actor then
    return;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, entity_id, data)
  values (p_recipient, p_actor, p_type, p_entity, coalesce(p_data, '{}'::jsonb));
end;
$$ language plpgsql security definer;

-- ── problem comments → notify problem owner ─────────────────────────────────
create or replace function public.notify_problem_comment()
returns trigger as $$
declare
  v_owner uuid;
  v_grade text;
  v_location text;
  v_session uuid;
begin
  select p.user_id,
         coalesce(p.grade_value_font, p.grade_value_vscale, p.color),
         s.location,
         p.session_id
    into v_owner, v_grade, v_location, v_session
    from problems p
    join sessions s on s.id = p.session_id
   where p.id = new.problem_id;

  perform public.create_notification(
    v_owner, new.user_id, 'problem_comment', new.problem_id,
    jsonb_build_object('body', new.body, 'grade', v_grade, 'location', v_location, 'session_id', v_session)
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_problem_comment_notify
  after insert on problem_comments
  for each row execute procedure public.notify_problem_comment();

-- ── problem reactions → notify problem owner ────────────────────────────────
create or replace function public.notify_problem_reaction()
returns trigger as $$
declare
  v_owner uuid;
  v_grade text;
  v_location text;
  v_session uuid;
begin
  select p.user_id,
         coalesce(p.grade_value_font, p.grade_value_vscale, p.color),
         s.location,
         p.session_id
    into v_owner, v_grade, v_location, v_session
    from problems p
    join sessions s on s.id = p.session_id
   where p.id = new.problem_id;

  perform public.create_notification(
    v_owner, new.user_id, 'problem_reaction', new.problem_id,
    jsonb_build_object('emoji', new.emoji, 'grade', v_grade, 'location', v_location, 'session_id', v_session)
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_problem_reaction_notify
  after insert on problem_reactions
  for each row execute procedure public.notify_problem_reaction();

-- ── challenge attempt reactions → notify attempt owner ──────────────────────
create or replace function public.notify_attempt_reaction()
returns trigger as $$
declare
  v_owner uuid;
  v_challenge uuid;
  v_title text;
begin
  select a.user_id, a.challenge_id, c.title
    into v_owner, v_challenge, v_title
    from challenge_attempts a
    join challenges c on c.id = a.challenge_id
   where a.id = new.attempt_id;

  perform public.create_notification(
    v_owner, new.user_id, 'attempt_reaction', v_challenge,
    jsonb_build_object('emoji', new.emoji, 'challenge_id', v_challenge, 'challenge_title', v_title)
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_attempt_reaction_notify
  after insert on challenge_attempt_reactions
  for each row execute procedure public.notify_attempt_reaction();

-- ── challenge comments → notify challenge creator ───────────────────────────
create or replace function public.notify_challenge_comment()
returns trigger as $$
declare
  v_creator uuid;
  v_title text;
begin
  select c.creator_id, c.title
    into v_creator, v_title
    from challenges c
   where c.id = new.challenge_id;

  perform public.create_notification(
    v_creator, new.user_id, 'challenge_comment', new.challenge_id,
    jsonb_build_object('content', new.content, 'challenge_id', new.challenge_id, 'challenge_title', v_title)
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_challenge_comment_notify
  after insert on challenge_comments
  for each row execute procedure public.notify_challenge_comment();

-- ── follow requests → notify recipient ──────────────────────────────────────
create or replace function public.notify_follow_request()
returns trigger as $$
begin
  perform public.create_notification(
    new.recipient_id, new.requester_id, 'follow_request', new.id, '{}'::jsonb
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_follow_request_notify
  after insert on follow_requests
  for each row execute procedure public.notify_follow_request();

-- ── new follower → notify the followed user ─────────────────────────────────
create or replace function public.notify_new_follower()
returns trigger as $$
begin
  perform public.create_notification(
    new.following_id, new.follower_id, 'new_follower', new.follower_id, '{}'::jsonb
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_new_follower_notify
  after insert on follows
  for each row execute procedure public.notify_new_follower();

-- ── challenge invitations → notify recipient ────────────────────────────────
create or replace function public.notify_challenge_invitation()
returns trigger as $$
declare
  v_title text;
begin
  select c.title into v_title from challenges c where c.id = new.challenge_id;

  perform public.create_notification(
    new.recipient_id, new.sender_id, 'challenge_invitation', new.challenge_id,
    jsonb_build_object('challenge_id', new.challenge_id, 'challenge_title', v_title)
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_challenge_invitation_notify
  after insert on challenge_invitations
  for each row execute procedure public.notify_challenge_invitation();

-- ── hype → notify the hyped climber ─────────────────────────────────────────
create or replace function public.notify_hype()
returns trigger as $$
begin
  perform public.create_notification(
    new.to_user_id, new.from_user_id, 'hype', new.id, '{}'::jsonb
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_hype_notify
  after insert on hype_messages
  for each row execute procedure public.notify_hype();

-- ── session partner tag → notify the tagged partner ─────────────────────────
create or replace function public.notify_session_tag()
returns trigger as $$
declare
  v_owner uuid;
  v_location text;
  v_date date;
begin
  select s.user_id, s.location, s.date
    into v_owner, v_location, v_date
    from sessions s
   where s.id = new.session_id;

  perform public.create_notification(
    new.partner_id, v_owner, 'session_tag', new.session_id,
    jsonb_build_object('session_id', new.session_id, 'location', v_location, 'date', v_date)
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_session_tag_notify
  after insert on session_partners
  for each row execute procedure public.notify_session_tag();

-- ── wall comments → notify announcement owner ───────────────────────────────
create or replace function public.notify_wall_comment()
returns trigger as $$
declare
  v_owner uuid;
  v_location text;
begin
  select w.user_id, w.location
    into v_owner, v_location
    from wall_announcements w
   where w.id = new.announcement_id;

  perform public.create_notification(
    v_owner, new.user_id, 'wall_comment', new.announcement_id,
    jsonb_build_object('announcement_id', new.announcement_id, 'location', v_location, 'body', new.body)
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_wall_comment_notify
  after insert on wall_comments
  for each row execute procedure public.notify_wall_comment();

-- Stream new notifications to connected clients.
alter publication supabase_realtime add table notifications;
