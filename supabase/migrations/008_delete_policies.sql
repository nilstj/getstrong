create policy "creators can delete own challenges"
  on challenges for delete
  using (auth.uid() = creator_id);
