-- Allow the recipient (following_id) to insert the follow row when accepting a request
drop policy "users manage own follows" on follows;

create policy "users manage own follows"
  on follows for insert
  with check (auth.uid() = follower_id or auth.uid() = following_id);
