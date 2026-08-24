-- Versioned record of "this climber was told what the app does". Versioned so a
-- future revision of the notice can re-prompt everyone; without the version
-- there is no way to tell who read which text.

alter table profiles add column if not exists policy_version     text;
alter table profiles add column if not exists policy_accepted_at timestamptz;
alter table profiles add column if not exists age_confirmed_at    timestamptz;

-- Email signups tick the box before the account exists, so the acceptance
-- rides along in signUp's metadata and lands here -- otherwise they would tick
-- it at registration and then be asked again by PolicyGate on first login.
--
-- Google signups have no checkbox to tick (the button goes straight to Google)
-- and existing accounts predate all of this, so both still fall to PolicyGate.
-- The username line is unchanged from migration 002.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (
    id, username, policy_version, policy_accepted_at, age_confirmed_at
  )
  values (
    new.id,
    split_part(new.email, '@', 1),
    nullif(new.raw_user_meta_data->>'policy_version', ''),
    case when nullif(new.raw_user_meta_data->>'policy_version', '') is not null
         then now() end,
    case when (new.raw_user_meta_data->>'age_confirmed') = 'true'
         then now() end
  );
  return new;
end;
$$ language plpgsql security definer;
