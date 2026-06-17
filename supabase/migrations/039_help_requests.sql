-- "Call for help" on a problem: a climber asks for beta on a problem that has
-- an image or video, scoped to friends or globally. Others respond with beta;
-- responses the asker marks helpful earn the responder tiered badges. Ties into
-- the notifications table from migration 037.

create table help_requests (
  id uuid primary key default gen_random_uuid(),
  problem_id uuid not null references problems(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,  -- asker
  message text,
  visibility text not null check (visibility in ('friends', 'global')),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
alter table help_requests enable row level security;

create index help_requests_problem_idx on help_requests (problem_id);
create index help_requests_open_idx on help_requests (created_at desc) where resolved = false;

-- Can the current user see a given help request? Global → anyone; friends →
-- the asker or someone with a follow edge in either direction. SECURITY DEFINER
-- so it bypasses RLS internally (no recursion with the policies that call it).
create or replace function public.can_see_help_request(req_id uuid)
returns boolean as $$
  select exists (
    select 1 from help_requests r
    where r.id = req_id
      and (
        r.visibility = 'global'
        or r.user_id = auth.uid()
        or exists (
          select 1 from follows f
          where (f.follower_id = auth.uid() and f.following_id = r.user_id)
             or (f.follower_id = r.user_id and f.following_id = auth.uid())
        )
      )
  );
$$ language sql stable security definer;

create policy "view visible help requests"
  on help_requests for select
  using (public.can_see_help_request(id));

-- Prerequisite enforced server-side: the problem must have an image or video.
create policy "create own help request"
  on help_requests for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from problems p
      where p.id = problem_id
        and (p.image_url is not null or p.beta_video_url is not null)
    )
  );

create policy "asker updates own help request"
  on help_requests for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "asker deletes own help request"
  on help_requests for delete
  using (auth.uid() = user_id);

-- ── Responses ───────────────────────────────────────────────────────────────
create table help_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references help_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,  -- helper
  body text not null,
  video_url text,
  helpful boolean not null default false,  -- marked by the asker
  created_at timestamptz not null default now()
);
alter table help_responses enable row level security;

create index help_responses_request_idx on help_responses (request_id);

create policy "view responses to visible requests"
  on help_responses for select
  using (public.can_see_help_request(request_id));

create policy "create own response on visible request"
  on help_responses for insert
  with check (auth.uid() = user_id and public.can_see_help_request(request_id));

-- Only the asker can update a response (i.e. toggle the helpful flag).
create policy "asker marks response helpful"
  on help_responses for update
  using (auth.uid() = (select user_id from help_requests where id = request_id))
  with check (auth.uid() = (select user_id from help_requests where id = request_id));

create policy "helper or asker deletes response"
  on help_responses for delete
  using (
    auth.uid() = user_id
    or auth.uid() = (select user_id from help_requests where id = request_id)
  );

-- ── Badges ──────────────────────────────────────────────────────────────────
create table user_badges (
  user_id uuid not null references auth.users(id) on delete cascade,
  badge text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge)
);
alter table user_badges enable row level security;

create policy "badges viewable by authenticated users"
  on user_badges for select using (auth.role() = 'authenticated');
-- Rows are inserted only by the security-definer trigger below.

-- ── Triggers → notifications ────────────────────────────────────────────────

-- A new response notifies the asker.
create or replace function public.notify_help_response()
returns trigger as $$
declare
  v_asker uuid;
  v_problem uuid;
  v_grade text;
  v_location text;
begin
  select r.user_id, r.problem_id into v_asker, v_problem
    from help_requests r where r.id = new.request_id;

  select coalesce(p.grade_value_font, p.grade_value_vscale, p.color), s.location
    into v_grade, v_location
    from problems p join sessions s on s.id = p.session_id
   where p.id = v_problem;

  perform public.create_notification(
    v_asker, new.user_id, 'help_response', new.request_id,
    jsonb_build_object('grade', v_grade, 'location', v_location, 'body', new.body)
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_help_response_notify
  after insert on help_responses
  for each row execute procedure public.notify_help_response();

-- Marking a response helpful notifies the helper and awards any newly-crossed
-- badge tier (counting that helper's helpful-marked responses).
create or replace function public.award_helpful_response()
returns trigger as $$
declare
  v_asker uuid;
  v_count integer;
  v_tier record;
begin
  if new.helpful = true and (old.helpful is distinct from true) then
    select user_id into v_asker from help_requests where id = new.request_id;

    perform public.create_notification(
      new.user_id, v_asker, 'help_marked_helpful', new.request_id, '{}'::jsonb
    );

    select count(*) into v_count
      from help_responses
     where user_id = new.user_id and helpful = true;

    for v_tier in
      select * from (values
        ('spotter', 1), ('beta_sprayer', 5), ('crux_crusher', 25), ('beta_legend', 100)
      ) as t(badge, threshold)
    loop
      if v_count >= v_tier.threshold
         and not exists (
           select 1 from user_badges b
           where b.user_id = new.user_id and b.badge = v_tier.badge
         ) then
        insert into user_badges (user_id, badge)
          values (new.user_id, v_tier.badge)
          on conflict do nothing;
        perform public.create_notification(
          new.user_id, v_asker, 'badge_earned', null,
          jsonb_build_object('badge', v_tier.badge)
        );
      end if;
    end loop;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_help_response_helpful
  after update of helpful on help_responses
  for each row execute procedure public.award_helpful_response();
