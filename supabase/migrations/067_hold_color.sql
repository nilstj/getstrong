-- Problems already have `color` = the gym grading colour (circuit/tag, free text).
-- Add a separate `hold_color` = the physical colour of the holds, shown as a
-- tinted hold graphic. Nullable text; no backfill.
alter table problems add column if not exists hold_color text;
