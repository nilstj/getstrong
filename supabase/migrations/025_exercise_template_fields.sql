alter table exercise_templates
  add column video_url text,
  add column device text,
  add column preset_sets integer,
  add column preset_reps integer,
  add column preset_pause_seconds integer,
  add column preset_rest_seconds integer;
