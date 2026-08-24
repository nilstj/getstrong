-- Two unrelated fixes that share one theme: a user has to be able to leave,
-- and their files have to be theirs while they're here.
--
-- ── Part 1: deleting an account currently raises an error ────────────────────
-- Two foreign keys to auth.users block the delete, so the right to erasure
-- cannot be honoured at all today:
--
--   * crews.created_by (migration 062) is `not null ... on delete set null`,
--     which is a contradiction -- deleting any crew creator fails on the
--     not-null constraint.
--   * challenge_tags.created_by (migration 034) declares no delete action, so
--     the default NO ACTION blocks deleting any admin who created a tag.
--
-- Both become a working `on delete set null`, matching every other optional
-- authorship column in the schema (044, 064, 066, 079, 080): the crew and the
-- tag outlive the account with the contribution anonymised, rather than
-- cascading and deleting a group other people are still using. Crew ownership
-- already lives in crew_members.role, and useCrews.ts has always typed
-- Crew.created_by as nullable, so no client change is needed.

alter table crews alter column created_by drop not null;

alter table crews drop constraint if exists crews_created_by_fkey;
alter table crews add constraint crews_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table challenge_tags drop constraint if exists challenge_tags_created_by_fkey;
alter table challenge_tags add constraint challenge_tags_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

-- ── Part 2: anyone could overwrite anyone's boulder photo ────────────────────
-- Migration 036 gated insert/update/delete on `auth.uid() is not null`, i.e. on
-- being signed in at all. Uploads use `upsert: true` and the object path is
-- public (it's embedded in image_url), so the path needed to clobber or delete
-- someone else's photo was there for the reading.
--
-- Both writers -- ProblemForm and AddGymBoulderSheet -- already upload to
-- `<user id>/<timestamp>.<ext>`, and always have, so scoping writes to the
-- first path segment covers every object in the bucket. This is the same check
-- the avatars bucket has used since migration 002.
--
-- Reads stay open: the bucket is public and boulder photos are meant to be
-- seen by everyone who finds the boulder.

drop policy if exists "Authenticated users can upload problem images" on storage.objects;
drop policy if exists "Users can update their own problem images" on storage.objects;
drop policy if exists "Users can delete their own problem images" on storage.objects;

drop policy if exists "Users can upload own problem images" on storage.objects;
create policy "Users can upload own problem images"
  on storage.objects for insert
  with check (
    bucket_id = 'problem-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update own problem images" on storage.objects;
create policy "Users can update own problem images"
  on storage.objects for update
  using (
    bucket_id = 'problem-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'problem-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete own problem images" on storage.objects;
create policy "Users can delete own problem images"
  on storage.objects for delete
  using (
    bucket_id = 'problem-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── Part 3: an avatar could be replaced but never removed ───────────────────
-- Migration 002 granted select/insert/update on the avatars bucket and no
-- delete. Erasure has to be able to take the photo down, and a user should be
-- able to remove their face without swapping in another one.

drop policy if exists "users can delete own avatar" on storage.objects;
create policy "users can delete own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- The WITH CHECK on the update policies is deliberate: without it a rename
-- could move an object into another user's folder, re-opening the hole from a
-- different direction.
