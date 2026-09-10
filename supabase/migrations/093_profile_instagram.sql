-- A climber's Instagram handle, shown beside their name on beta they post.
-- Stored as the bare handle, never a URL: the client builds the href from it
-- (src/utils/instagram.ts), so this column cannot point anywhere but Instagram.
alter table profiles add column if not exists instagram_handle text;

-- A charset-and-length guard, not Instagram's actual handle rule — a lone
-- '.', '..', 'nils.' and '.nils' all pass this and Instagram issues none of
-- them. Its real job is narrower: a stored value can never contain the
-- characters that would let it escape the https://instagram.com/ prefix the
-- client builds links from. A well-formed-but-unissued handle can still be
-- stored and will simply render a dead link. Kept character-identical to the
-- regex in src/utils/instagram.ts so client and database always agree, even
-- if the client is bypassed.
alter table profiles drop constraint if exists profiles_instagram_handle_format;
alter table profiles add constraint profiles_instagram_handle_format
  check (instagram_handle is null or instagram_handle ~ '^[A-Za-z0-9._]{1,30}$');

-- No new RLS policy: profiles already carries "users can update own profile"
-- from migration 002, so a client update of this column lands rather than
-- silently no-opping. export_my_data (088) serialises the row with to_jsonb,
-- so the handle reaches the data export with no change there.
