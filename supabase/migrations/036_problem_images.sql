alter table problems add column image_url text;

-- Storage bucket
insert into storage.buckets (id, name, public)
values ('problem-images', 'problem-images', true)
on conflict (id) do nothing;

create policy "Anyone can read problem images"
  on storage.objects for select
  using (bucket_id = 'problem-images');

create policy "Authenticated users can upload problem images"
  on storage.objects for insert
  with check (bucket_id = 'problem-images' and auth.uid() is not null);

create policy "Users can update their own problem images"
  on storage.objects for update
  using (bucket_id = 'problem-images' and auth.uid() is not null);

create policy "Users can delete their own problem images"
  on storage.objects for delete
  using (bucket_id = 'problem-images' and auth.uid() is not null);
