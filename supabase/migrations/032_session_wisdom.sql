alter table sessions add column wisdom text;
alter table sessions add column wisdom_shared boolean not null default false;

-- Allow followers to read sessions that have shared wisdom
create policy "followers can read shared wisdom sessions"
  on sessions for select
  using (
    wisdom_shared = true
    and exists (
      select 1 from follows
      where follows.follower_id = auth.uid()
        and follows.following_id = sessions.user_id
    )
  );
