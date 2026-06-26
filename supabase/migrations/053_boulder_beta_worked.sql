-- IG redesign: the "✓ worked for me" signal that ranks beta and credits authors.
-- One mark per (beta, user). The FIRST time any climber marks a beta worked, the
-- author is credited once (beta_points 'helpful', 5 pts), guarded by
-- boulder_beta.awarded so toggling can't farm points. Marking your own beta does
-- not pay you. Counting "worked for N" = count(*) of rows for the beta.
create table if not exists boulder_beta_worked (
  beta_id uuid not null references boulder_beta(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (beta_id, user_id)
);
alter table boulder_beta_worked enable row level security;

create policy "boulder_beta_worked viewable by authenticated users"
  on boulder_beta_worked for select using (auth.role() = 'authenticated');
create policy "users manage own worked marks"
  on boulder_beta_worked for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Mark a beta as "worked for me". Idempotent (PK). On the first-ever mark of the
-- beta, credit the author once. SECURITY DEFINER so it can write beta_points
-- (which has no insert policy).
create or replace function public.mark_beta_worked(p_beta_id uuid)
returns void as $$
declare
  v_user_id uuid := auth.uid();
  v_author  uuid;
  v_gpid    uuid;
  v_gym     text;
  v_first   boolean := false;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select b.user_id, b.gym_problem_id into v_author, v_gpid
    from boulder_beta b where b.id = p_beta_id;
  if v_author is null then
    raise exception 'beta not found';
  end if;

  insert into boulder_beta_worked (beta_id, user_id)
  values (p_beta_id, v_user_id)
  on conflict (beta_id, user_id) do nothing;

  -- Award the author once, the first time this beta works for anyone (not self).
  if v_author <> v_user_id then
    update boulder_beta set awarded = true
      where id = p_beta_id and awarded = false;
    if found then
      select gym into v_gym from gym_problems where id = v_gpid;
      if v_gym is not null then
        insert into public.beta_points (user_id, gym, gym_problem_id, points, reason, cycle_month)
        values (v_author, v_gym, v_gpid, 5, 'helpful',
                to_char((now() at time zone 'utc'), 'YYYY-MM'));
      end if;
    end if;
  end if;
end;
$$ language plpgsql security definer;

-- Remove your "worked" mark (drops the count). Reputation already earned by the
-- author is intentionally not clawed back.
create or replace function public.unmark_beta_worked(p_beta_id uuid)
returns void as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  delete from boulder_beta_worked where beta_id = p_beta_id and user_id = v_user_id;
end;
$$ language plpgsql security definer;
