-- A canonical gym registry that climbers can still add to.
--
-- Until now a gym was free text, and because that text is the de facto join
-- key in twelve columns, a misspelling forked the gym: two shared-boulder
-- lists, two beta-points leaderboards, two grading configs, two award rounds,
-- one building. Beta stopped moving between climbers standing next to each
-- other.
--
-- This installs a `gyms` table that owns WHICH NAMES EXIST, while the STRING
-- stays the join key: gyms.label is what still gets written into problems.gym,
-- sessions.location and the rest, so every existing query, RPC, leaderboard
-- and util keeps working untouched. Design:
-- docs/superpowers/specs/2026-09-08-gym-registry-design.md
--
-- Nothing here awards beta_points, and create_gym must never start to: a
-- points path with no guard is farmable, and "type a name, get points" would
-- be the easiest farm in the app.
--
-- RELEASE GATE: apply this before deploying the client that uses GymPicker.
-- The gym_suggestions() rewrite at the foot of this file is deliberately
-- ADDITIVE (name and uses keep their meaning, name returns the label) so the
-- currently deployed client keeps working in between.

-- ── the fold ─────────────────────────────────────────────────────────────────
-- Case, whitespace, punctuation and diacritics folded away. This is the
-- authoritative definition; src/utils/gymRegistry.ts mirrors it for the UI's
-- duplicate hints. If they drift, create_gym's idempotent return means the
-- climber still converges on the existing row.
--
-- IMMUTABLE because lower/replace/translate/regexp_replace all are, and
-- because create_gym uses it inside a lookup.
--
-- The fallback matters: a name in a non-latin script strips to '' under
-- [^a-z0-9], and every such gym would then share the key '' and be treated as
-- one gym — the exact fork this file exists to prevent.
create or replace function public.fold_gym_text(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      btrim(
        regexp_replace(
          translate(
            replace(replace(replace(replace(replace(replace(
              lower(coalesce(p, '')),
              'æ', 'ae'), 'ø', 'o'), 'œ', 'oe'), 'ß', 'ss'), 'đ', 'd'), 'ł', 'l'),
            'åäàáâãöòóôõüùúûèéêëìíîïçñýÿšžčć',
            'aaaaaaooooouuuueeeeiiiicnyyszcc'
          ),
          '[^a-z0-9]+', ' ', 'g'
        )
      ),
      ''
    ),
    btrim(regexp_replace(lower(coalesce(p, '')), '\s+', ' ', 'g'))
  );
$$;

-- ── the registry ─────────────────────────────────────────────────────────────
-- label is the load-bearing column: it is the string every other table stores.
-- Unique on label is what makes two Klatreverket branches distinct rows rather
-- than a collision.
--
-- canonical_key folds ACROSS the name/city boundary (no separator) on purpose:
-- the backfill below puts whole legacy strings into `name` with city null, so
-- 'Klatreverket, Torshov' and a later name 'Klatreverket' + city 'Torshov'
-- must collide. Same label therefore implies same canonical_key, which makes
-- gyms_label_idx a cheap invariant rather than a second line of defence.
--
-- label and canonical_key are plain columns maintained by the RPCs, not
-- generated columns: the fold rules will need tuning, and altering a generated
-- column means dropping it and its unique index — a hand-applied migration
-- best not written twice. The RPCs are the only writer, so drift is
-- unreachable.
create table if not exists gyms (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  city          text,
  label         text not null,
  canonical_key text not null,
  verified      boolean not null default false,
  created_by    uuid references auth.users(id) on delete set null,
  merged_into   uuid references gyms(id),
  created_at    timestamptz not null default now()
);
create unique index if not exists gyms_canonical_key_idx on gyms (canonical_key);
create unique index if not exists gyms_label_idx on gyms (label);
create index if not exists gyms_merged_into_idx on gyms (merged_into) where merged_into is not null;

alter table gyms enable row level security;

-- Everyone signed in can read the registry — the picker needs it.
create policy "gyms readable by authenticated users"
  on gyms for select
  using (auth.role() = 'authenticated');

-- No insert/update/delete policy AT ALL, deliberately. Every write goes
-- through the SECURITY DEFINER functions below, the same shape 071 uses for
-- gym_gradings. A client cannot invent, rename or merge a gym directly.

-- ── the rewrite ──────────────────────────────────────────────────────────────
-- Moves every stored occurrence of one gym string to another. Used by
-- rename_gym, merge_gyms AND the backfill — the backfill is a merge, just many
-- at once.
--
-- Twelve columns hold a gym string. The list was verified by grep against the
-- migrations, and a miss here strands rows on a label with no registry row:
--   sessions.location (001)          problems.gym (011)
--   shared_projects.gym (018)        wall_announcements.location (027)
--   gym_problems.gym (044)           beta_points.gym (046)
--   profiles.default_gyms (060, text[])
--   crews.home_gym (062)             crew_plans.gym (066)
--   gym_gradings.gym (071)           crew_award_rounds.gym (079)
--   session_groups.gym (080)
--
-- Two of those carry a unique constraint the rewrite can collide with:
-- gym_gradings (gym, color_name) and crew_award_rounds (crew_id, round_date,
-- gym). Rule, per the design: THE TARGET'S ROW WINS, the source's is deleted.
-- Deleting an award round cascades to its participants, votes, tags and notes
-- (all four reference crew_award_rounds(id) on delete cascade in 079), so a
-- discarded round takes its voting with it. gym_merge_impact reports the count
-- so an admin sees that before confirming.
--
-- No RLS concerns: SECURITY DEFINER, and it is only reachable from the
-- admin-gated functions below and from this file's own backfill.
create or replace function public.rewrite_gym_label(p_from text, p_to text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(btrim(p_from), '') = '' or coalesce(btrim(p_to), '') = '' then
    raise exception 'rewrite_gym_label: both labels are required';
  end if;
  if p_from = p_to then
    return;
  end if;

  update public.sessions           set location = p_to where location = p_from;
  update public.problems           set gym      = p_to where gym      = p_from;
  update public.shared_projects    set gym      = p_to where gym      = p_from;
  update public.wall_announcements set location = p_to where location = p_from;
  update public.gym_problems       set gym      = p_to where gym      = p_from;
  update public.beta_points        set gym      = p_to where gym      = p_from;
  update public.crews              set home_gym = p_to where home_gym = p_from;
  update public.crew_plans         set gym      = p_to where gym      = p_from;
  update public.session_groups     set gym      = p_to where gym      = p_from;

  -- Target wins per colour: drop the source's row only where the target
  -- already configures that colour, then move what is left.
  delete from public.gym_gradings src
   where src.gym = p_from
     and exists (
       select 1 from public.gym_gradings t
        where t.gym = p_to and t.color_name = src.color_name
     );
  update public.gym_gradings set gym = p_to where gym = p_from;

  -- Target wins per (crew, date). The cascade takes participants and votes
  -- with it; gym_merge_impact reports this as discarded.
  delete from public.crew_award_rounds src
   where src.gym = p_from
     and exists (
       select 1 from public.crew_award_rounds t
        where t.gym = p_to and t.crew_id = src.crew_id and t.round_date = src.round_date
     );
  update public.crew_award_rounds set gym = p_to where gym = p_from;

  -- profiles.default_gyms is an ordered text[] whose FIRST element is the
  -- climber's primary gym, so a naive array_agg(distinct) would silently
  -- reshuffle which gym is primary. Rebuild it with ordinality, keeping each
  -- gym's earliest position and dropping the duplicate a rewrite can create
  -- when a climber had both spellings.
  with expanded as (
    select p.id,
           case when u.g = p_from then p_to else u.g end as gym,
           u.ord
      from public.profiles p,
           unnest(p.default_gyms) with ordinality as u(g, ord)
     where p.default_gyms @> array[p_from]
  ),
  deduped as (
    select distinct on (id, gym) id, gym, ord
      from expanded
     order by id, gym, ord
  ),
  rebuilt as (
    select id, array_agg(gym order by ord) as arr
      from deduped
     group by id
  )
  update public.profiles p
     set default_gyms = r.arr
    from rebuilt r
   where p.id = r.id;
end;
$$;

-- ── create ───────────────────────────────────────────────────────────────────
-- Any signed-in climber can add a gym: someone standing in an unlisted gym is
-- never blocked. IDEMPOTENT rather than erroring — on an existing
-- canonical_key it returns the row that already exists, so two climbers adding
-- the same gym from opposite ends of the bouldering room converge instead of
-- one of them seeing a failure. That is also what makes a TS/SQL fold
-- disagreement benign.
--
-- created_by is recorded (it is what makes a joke name attributable, and what
-- the picker's "new" chip keys off via climber_added) but never returned:
-- gym_suggestions and this function expose a boolean, not a user id.
--
-- Awards nothing. See the file header.
create or replace function public.create_gym(p_name text, p_city text)
returns table (id uuid, name text, city text, label text, verified boolean, climber_added boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_name  text := nullif(btrim(coalesce(p_name, '')), '');
  v_city  text := nullif(btrim(coalesce(p_city, '')), '');
  v_label text;
  v_key   text;
begin
  if v_user is null then
    raise exception 'You must be signed in to add a gym';
  end if;
  if v_name is null then
    raise exception 'A gym name is required';
  end if;
  if length(v_name) > 60 or length(coalesce(v_city, '')) > 60 then
    raise exception 'That name is too long';
  end if;

  v_label := case when v_city is null then v_name else v_name || ', ' || v_city end;
  v_key   := public.fold_gym_text(v_name || ' ' || coalesce(v_city, ''));

  insert into public.gyms (name, city, label, canonical_key, created_by)
  values (v_name, v_city, v_label, v_key, v_user)
  on conflict (canonical_key) do nothing;

  -- Whether we just inserted it or it was already there, resolve through any
  -- merge so the caller is handed the live gym rather than a retired row.
  -- One hop is enough: merge_gyms resolves its target to a live row AND
  -- repoints everything that pointed at the source, so merged_into never
  -- references a retired gym.
  return query
    with resolved as (
      select coalesce(m.id, g.id) as gid
        from public.gyms g
        left join public.gyms m on m.id = g.merged_into
       where g.canonical_key = v_key
    )
    select g.id, g.name, g.city, g.label, g.verified, g.created_by is not null
      from public.gyms g
      join resolved r on r.gid = g.id;
end;
$$;

grant execute on function public.create_gym(text, text) to authenticated;

-- ── admin ────────────────────────────────────────────────────────────────────
-- is_admin only, NOT is_setter. A setter can edit gradings (071), which writes
-- one table; these rewrite twelve columns. Different blast radius, different
-- gate.
create or replace function public.assert_gym_admin()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and is_admin = true
  ) then
    raise exception 'Only admins can manage gyms';
  end if;
end;
$$;

-- Renaming into an existing canonical key RAISES rather than quietly becoming
-- a merge. Renaming 'Klatreverkeet' to 'Klatreverket' when 'Klatreverket'
-- already exists IS a merge, and silently performing one would rewrite data
-- under an admin who asked for a rename.
create or replace function public.rename_gym(p_id uuid, p_name text, p_city text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old   public.gyms;
  v_name  text := nullif(btrim(coalesce(p_name, '')), '');
  v_city  text := nullif(btrim(coalesce(p_city, '')), '');
  v_label text;
  v_key   text;
begin
  perform public.assert_gym_admin();

  select * into v_old from public.gyms where id = p_id;
  if v_old.id is null then
    raise exception 'No such gym';
  end if;
  if v_old.merged_into is not null then
    raise exception 'That gym has been merged away — rename the gym it was merged into';
  end if;
  if v_name is null then
    raise exception 'A gym name is required';
  end if;

  v_label := case when v_city is null then v_name else v_name || ', ' || v_city end;
  v_key   := public.fold_gym_text(v_name || ' ' || coalesce(v_city, ''));

  if exists (select 1 from public.gyms where canonical_key = v_key and id <> p_id) then
    raise exception 'A gym with that name already exists — merge into it instead of renaming';
  end if;

  perform public.rewrite_gym_label(v_old.label, v_label);

  update public.gyms
     set name = v_name, city = v_city, label = v_label, canonical_key = v_key
   where id = p_id;
end;
$$;

-- Merging follows the target's merged_into chain to its final live row, so a
-- chain can never strand rows on an intermediate. The source keeps its row
-- (with merged_into set) so a stale client's string still resolves; the picker
-- drops it via `where merged_into is null`.
create or replace function public.merge_gyms(p_from uuid, p_to uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.gyms;
  v_to   public.gyms;
  v_hops int := 0;
begin
  perform public.assert_gym_admin();

  select * into v_from from public.gyms where id = p_from;
  select * into v_to   from public.gyms where id = p_to;
  if v_from.id is null or v_to.id is null then
    raise exception 'No such gym';
  end if;
  if v_from.merged_into is not null then
    raise exception 'That gym has already been merged';
  end if;

  while v_to.merged_into is not null and v_hops < 10 loop
    select * into v_to from public.gyms where id = v_to.merged_into;
    v_hops := v_hops + 1;
  end loop;
  if v_to.merged_into is not null then
    raise exception 'The target gym is part of a merge chain that is too long';
  end if;
  if v_from.id = v_to.id then
    raise exception 'A gym cannot be merged into itself';
  end if;

  perform public.rewrite_gym_label(v_from.label, v_to.label);
  update public.gyms set merged_into = v_to.id where id = v_from.id;

  -- Keep the invariant that merged_into always points at a LIVE gym. Without
  -- this, merging A into B and later B into C leaves A pointing at a retired
  -- row, and create_gym's single-hop resolve would hand a caller a dead gym.
  update public.gyms set merged_into = v_to.id
   where merged_into = v_from.id and id <> v_to.id;
end;
$$;

create or replace function public.set_gym_verified(p_id uuid, p_verified boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_gym_admin();
  update public.gyms set verified = coalesce(p_verified, false) where id = p_id;
  if not found then
    raise exception 'No such gym';
  end if;
end;
$$;

-- What a merge would rewrite, so the confirm can state the damage before doing
-- it. Read-only, but SECURITY DEFINER because sessions are not globally
-- readable — and admin-gated for the same reason.
create or replace function public.gym_merge_impact(p_from text)
returns table (
  problems bigint, boulders bigint, sessions bigint, session_groups bigint,
  crews bigint, crew_plans bigint, award_rounds bigint, gradings bigint,
  climbers bigint, announcements bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_gym_admin();
  return query
    select
      (select count(*) from public.problems           where gym      = p_from),
      (select count(*) from public.gym_problems       where gym      = p_from),
      (select count(*) from public.sessions           where location = p_from),
      (select count(*) from public.session_groups     where gym      = p_from),
      (select count(*) from public.crews              where home_gym = p_from),
      (select count(*) from public.crew_plans         where gym      = p_from),
      (select count(*) from public.crew_award_rounds  where gym      = p_from),
      (select count(*) from public.gym_gradings       where gym      = p_from),
      (select count(*) from public.profiles           where default_gyms @> array[p_from]),
      (select count(*) from public.wall_announcements where location = p_from);
end;
$$;

grant execute on function public.rename_gym(uuid, text, text)   to authenticated;
grant execute on function public.merge_gyms(uuid, uuid)         to authenticated;
grant execute on function public.set_gym_verified(uuid, boolean) to authenticated;
grant execute on function public.gym_merge_impact(text)          to authenticated;

-- ── backfill ─────────────────────────────────────────────────────────────────
-- One gyms row per distinct canonical key, gathered from every column that
-- holds a gym string, with the MOST-USED spelling winning the display name —
-- the crowd is a decent speller in aggregate.
--
-- The name/city split is deliberately NOT guessed: the whole legacy string
-- goes into `name` with city null. A wrong split is worse than no split, and
-- admin rename fixes it deliberately. This is why canonical_key has to fold
-- across the boundary.
--
-- created_by stays null for these rows, which is what lets the picker show its
-- "new" chip only for gyms a climber added: day one does not paint every gym
-- in the app as unverified, and no existing typo gets auto-blessed as verified
-- either.
do $$
declare
  r record;
begin
  create temp table gym_seed on commit drop as
  select btrim(g) as raw, count(*) as uses
    from (
      select location as g from public.sessions
      union all select gym      from public.problems
      union all select gym      from public.shared_projects
      union all select location from public.wall_announcements
      union all select gym      from public.gym_problems
      union all select gym      from public.beta_points
      union all select home_gym from public.crews
      union all select gym      from public.crew_plans
      union all select gym      from public.gym_gradings
      union all select gym      from public.crew_award_rounds
      union all select gym      from public.session_groups
      union all select unnest(default_gyms) from public.profiles
    ) s(g)
   where coalesce(btrim(g), '') <> ''
   group by btrim(g);

  insert into public.gyms (name, city, label, canonical_key, verified, created_by)
  select distinct on (public.fold_gym_text(s.raw))
         s.raw, null, s.raw, public.fold_gym_text(s.raw), false, null
    from gym_seed s
   order by public.fold_gym_text(s.raw), s.uses desc, s.raw asc
  on conflict (canonical_key) do nothing;

  -- Now collapse the variants for real. Without this the registry would look
  -- clean while the data stayed forked — a nicer picker over the same two
  -- leaderboards.
  for r in
    select s.raw as from_label, g.label as to_label
      from gym_seed s
      join public.gyms g on g.canonical_key = public.fold_gym_text(s.raw)
     where s.raw <> g.label
  loop
    perform public.rewrite_gym_label(r.from_label, r.to_label);
    raise notice 'backfill: % -> %', r.from_label, r.to_label;
  end loop;
end $$;

-- ── suggestions ──────────────────────────────────────────────────────────────
-- Was: distinct strings scraped from sessions and problems — a list derived
-- from the polluted data, so junk kept recommending itself. Now: registry
-- rows, with usage counts, excluding anything merged away.
--
-- ADDITIVE return shape, and this is load-bearing for the release gate.
-- `name` and `uses` keep their existing meaning and `name` returns the LABEL,
-- because the currently deployed client writes g.name straight into
-- problems.gym. It keeps working between this apply and the client deploy;
-- the new columns are simply ignored by it.
--
-- Still SECURITY DEFINER for 050's reason: sessions are not globally readable,
-- and the counts read them.
create or replace function public.gym_suggestions()
returns table (
  name text, uses bigint, id uuid, gym_name text, city text,
  label text, verified boolean, climber_added boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with usage as (
    select g as label, count(*) as uses
      from (
        select location as g from public.sessions
        union all select gym from public.problems
        union all select gym from public.gym_problems
      ) s(g)
     where coalesce(btrim(g), '') <> ''
     group by g
  )
  select gy.label, coalesce(u.uses, 0), gy.id, gy.name, gy.city,
         gy.label, gy.verified, gy.created_by is not null
    from public.gyms gy
    left join usage u on u.label = gy.label
   where gy.merged_into is null
   order by gy.verified desc, coalesce(u.uses, 0) desc, gy.label asc;
$$;

grant execute on function public.gym_suggestions() to authenticated, anon;

-- ── smoke ────────────────────────────────────────────────────────────────────
-- plpgsql bodies are NOT validated at CREATE: every function above could
-- install cleanly and still raise on its first call, under a climber's thumb
-- rather than in front of the operator who can act on it. So call them here,
-- for real, and roll back what they write.
--
-- The fold cases mirror src/utils/__tests__/gymRegistry.test.ts. If these two
-- ever disagree, this is where it should be caught.
do $$
declare
  v_gym    record;
  v_impact record;
begin
  -- fold: the same vectors the Vitest suite asserts
  assert public.fold_gym_text('  Klatreverket ')      = 'klatreverket',        'fold: trim/lower';
  assert public.fold_gym_text('Boulders   Oslo')      = 'boulders oslo',       'fold: whitespace';
  assert public.fold_gym_text('Klatreverket - Torshov') = 'klatreverket torshov', 'fold: punctuation';
  assert public.fold_gym_text('Klatreverket, Torshov') = 'klatreverket torshov', 'fold: comma';
  assert public.fold_gym_text('Bålerud')              = 'balerud',             'fold: a-ring';
  assert public.fold_gym_text('Tøyen')                = 'toyen',               'fold: o-slash';
  assert public.fold_gym_text('Færder')               = 'faerder',             'fold: ae';
  assert public.fold_gym_text('Café Blocs')           = 'cafe blocs',          'fold: acute';
  assert public.fold_gym_text('Blocs 24')             = 'blocs 24',            'fold: digits';
  assert public.fold_gym_text('Скала')                = 'скала',               'fold: non-latin fallback';
  assert public.fold_gym_text('Klatreverket' || ' ' || '') = public.fold_gym_text('Klatreverket'),
         'fold: empty city adds nothing';

  -- create_gym, twice: the second call must return the first row, not fail
  select * into v_gym from public.create_gym('Smoke Test Wall', 'Nowhere');
  assert v_gym.label = 'Smoke Test Wall, Nowhere', 'create_gym: label';
  assert v_gym.climber_added, 'create_gym: climber_added';
  select * into v_gym from public.create_gym('  smoke test wall  ', 'NOWHERE');
  assert v_gym.label = 'Smoke Test Wall, Nowhere', 'create_gym: idempotent on a folded match';
  -- and the legacy single-string form must land on the same row
  select * into v_gym from public.create_gym('Smoke Test Wall, Nowhere', null);
  assert v_gym.label = 'Smoke Test Wall, Nowhere', 'create_gym: legacy form folds to the same key';

  -- rewrite_gym_label: every one of the twelve statements planned and run.
  -- Both labels exist and neither is in use, so this writes nothing while
  -- still forcing parse analysis of every column reference.
  select * into v_gym from public.create_gym('Smoke Test Wall Two', 'Nowhere');
  assert v_gym.label = 'Smoke Test Wall Two, Nowhere', 'create_gym: second smoke gym';
  perform public.rewrite_gym_label('Smoke Test Wall, Nowhere', 'Smoke Test Wall Two, Nowhere');

  -- admin-gated functions: reachable only behind assert_gym_admin, so prove
  -- the guard fires rather than trying to pass it. Three outcomes, and only
  -- one of them is a pass:
  --   no raise           -> the guard is not guarding
  --   the wrong message  -> the body is broken, which is the very thing this
  --                         smoke block exists to catch; a handler that
  --                         accepted any error would mask it
  --   its guard message  -> pass
  begin
    perform public.assert_gym_admin();
    -- Reached only if the guard let a non-admin through. The migration runs
    -- with auth.uid() null, so the guard's select finds no profile and raises.
    raise exception 'assert_gym_admin: expected a raise for a non-admin caller';
  exception when others then
    if sqlerrm = 'assert_gym_admin: expected a raise for a non-admin caller' then
      raise;
    elsif sqlerrm <> 'Only admins can manage gyms' then
      raise exception 'assert_gym_admin raised "%" instead of its guard message — its body is broken, not guarding', sqlerrm;
    end if;
    raise notice 'assert_gym_admin raised as expected: %', sqlerrm;
  end;

  -- gym_merge_impact's body past its guard: run the same ten counts inline so
  -- every column reference in it is parsed and planned here.
  select
    (select count(*) from public.problems           where gym      = 'x'),
    (select count(*) from public.gym_problems       where gym      = 'x'),
    (select count(*) from public.sessions           where location = 'x'),
    (select count(*) from public.session_groups     where gym      = 'x'),
    (select count(*) from public.crews              where home_gym = 'x'),
    (select count(*) from public.crew_plans         where gym      = 'x'),
    (select count(*) from public.crew_award_rounds  where gym      = 'x'),
    (select count(*) from public.gym_gradings       where gym      = 'x'),
    (select count(*) from public.profiles           where default_gyms @> array['x']),
    (select count(*) from public.wall_announcements where location = 'x')
    into v_impact;

  -- gym_suggestions must still answer, and must not list the smoke rows once
  -- they are gone.
  perform 1 from public.gym_suggestions() limit 1;

  delete from public.gyms where canonical_key in (
    public.fold_gym_text('Smoke Test Wall Nowhere'),
    public.fold_gym_text('Smoke Test Wall Two Nowhere')
  );

  raise notice 'gym registry: fold vectors, create_gym (x3, idempotent), rewrite_gym_label (all twelve columns), the admin guard, gym_merge_impact''s ten counts and gym_suggestions all ran; smoke rows removed';
end $$;
