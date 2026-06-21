-- Hold highlighting: store the sampled hold color (HSV) + tolerance per problem
-- so the highlight persists and is visible to anyone viewing the photo.
-- Additive; problems is already owner-writable (001) and world-readable (015),
-- so no new policy is needed.
alter table problems
  add column if not exists hold_highlight jsonb;
