-- Allow authenticated users to read all problems and exercises (social feed)
create policy "problems readable by authenticated users"
  on problems for select
  using (auth.role() = 'authenticated');

create policy "exercises readable by authenticated users"
  on exercises for select
  using (auth.role() = 'authenticated');
