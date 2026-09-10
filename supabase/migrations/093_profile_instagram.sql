-- A climber's Instagram handle, shown beside their name on beta they post.
-- Stored as the bare handle, never a URL: the client builds the href from it
-- (src/utils/instagram.ts), so this column cannot point anywhere but Instagram.
alter table profiles add column if not exists instagram_handle text;

-- Instagram's own handle rule, and the real guard on this field — the client
-- regex in src/utils/instagram.ts is a courtesy, this is what a bypassed client
-- still has to satisfy. Kept identical to that regex.
alter table profiles drop constraint if exists profiles_instagram_handle_format;
alter table profiles add constraint profiles_instagram_handle_format
  check (instagram_handle is null or instagram_handle ~ '^[A-Za-z0-9._]{1,30}$');

-- No new RLS policy: profiles already carries "users can update own profile"
-- from migration 002, so a client update of this column lands rather than
-- silently no-opping. export_my_data (088) serialises the row with to_jsonb,
-- so the handle reaches the data export with no change there.
