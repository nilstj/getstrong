create table app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

create policy "authenticated users can read settings"
  on app_settings for select
  using (auth.role() = 'authenticated');

create policy "admins can insert settings"
  on app_settings for insert
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

create policy "admins can update settings"
  on app_settings for update
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

insert into app_settings (key, value) values (
  'coach_prompt',
  'You are an expert climbing coach. Analyze this athlete''s last 90 days and provide a focused coaching report. Be specific and concise. Respond in exactly three sections with these exact headings:

## Insights
3-5 bullet points flagging patterns (grade trends, session frequency, strengths, weaknesses, recovery).

## Training Recommendations
What the athlete should prioritize over the next 2-4 weeks. Reference their weak move types, grade targets, and exercise gaps.

## Next Session Plan
A concrete session: warm-up, main exercises (sets/reps/load), problems to attempt (grade range per board), cool-down. Be specific.'
);
