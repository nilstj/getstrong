-- Crews: a small, persistent, invite-only training group of friends. Distinct
-- from the per-boulder "sendtrain" (the old internal "crew"). Phase 1: create,
-- invite/join, membership, and an inside-crew leaderboard.

-- ── Tables ───────────────────────────────────────────────────────────────────
create table if not exists crews (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text,
  home_gym text,
  created_by uuid not null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists crew_members (
  crew_id uuid not null references crews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);
create index if not exists crew_members_user_idx on crew_members (user_id);

create table if not exists crew_invites (
  crew_id uuid not null references crews(id) on delete cascade,
  invited_user uuid not null references auth.users(id) on delete cascade,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (crew_id, invited_user)
);
create index if not exists crew_invites_user_idx on crew_invites (invited_user);

alter table crews enable row level security;
alter table crew_members enable row level security;
alter table crew_invites enable row level security;

-- Membership check as SECURITY DEFINER to avoid recursive RLS on crew_members.
create or replace function public.is_crew_member(p_crew uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from crew_members where crew_id = p_crew and user_id = auth.uid());
$$;

-- ── SELECT policies (writes go through the SECURITY DEFINER RPCs below) ────────
drop policy if exists "crews readable by members and invitees" on crews;
create policy "crews readable by members and invitees" on crews for select using (
  is_crew_member(id)
  or exists (select 1 from crew_invites ci where ci.crew_id = crews.id and ci.invited_user = auth.uid())
);

drop policy if exists "crew_members readable by fellow members" on crew_members;
create policy "crew_members readable by fellow members" on crew_members for select
  using (is_crew_member(crew_id));

drop policy if exists "crew_invites readable by invitee or members" on crew_invites;
create policy "crew_invites readable by invitee or members" on crew_invites for select
  using (invited_user = auth.uid() or is_crew_member(crew_id));

-- ── Mutations (SECURITY DEFINER RPCs) ─────────────────────────────────────────
create or replace function public.create_crew(p_name text, p_emoji text, p_home_gym text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'Crew needs a name'; end if;
  insert into crews (name, emoji, home_gym, created_by)
    values (trim(p_name), nullif(trim(coalesce(p_emoji, '')), ''), nullif(trim(coalesce(p_home_gym, '')), ''), v_user)
    returning id into v_id;
  insert into crew_members (crew_id, user_id, role) values (v_id, v_user, 'owner');
  return v_id;
end; $$;

create or replace function public.invite_to_crew(p_crew uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from crew_members where crew_id = p_crew and user_id = auth.uid()) then
    raise exception 'Only crew members can invite';
  end if;
  if exists (select 1 from crew_members where crew_id = p_crew and user_id = p_user) then
    return;
  end if;
  insert into crew_invites (crew_id, invited_user, invited_by)
    values (p_crew, p_user, auth.uid())
    on conflict (crew_id, invited_user) do nothing;
end; $$;

create or replace function public.accept_crew_invite(p_crew uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from crew_invites where crew_id = p_crew and invited_user = auth.uid()) then
    raise exception 'No invite to this crew';
  end if;
  insert into crew_members (crew_id, user_id, role) values (p_crew, auth.uid(), 'member')
    on conflict (crew_id, user_id) do nothing;
  delete from crew_invites where crew_id = p_crew and invited_user = auth.uid();
end; $$;

create or replace function public.decline_crew_invite(p_crew uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from crew_invites where crew_id = p_crew and invited_user = auth.uid();
end; $$;

create or replace function public.leave_crew(p_crew uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from crew_members where crew_id = p_crew and user_id = auth.uid() and role = 'owner')
     and (select count(*) from crew_members where crew_id = p_crew) > 1 then
    raise exception 'The owner must delete the crew (or hand it over) before leaving';
  end if;
  delete from crew_members where crew_id = p_crew and user_id = auth.uid();
  delete from crews c where c.id = p_crew and not exists (select 1 from crew_members m where m.crew_id = p_crew);
end; $$;

create or replace function public.delete_crew(p_crew uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from crew_members where crew_id = p_crew and user_id = auth.uid() and role = 'owner') then
    raise exception 'Only the owner can delete the crew';
  end if;
  delete from crews where id = p_crew;
end; $$;
