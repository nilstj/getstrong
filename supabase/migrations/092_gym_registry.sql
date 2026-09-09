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
--
-- APPLY THIS FILE AS ONE WHOLE-FILE PASTE, NOT STATEMENT BY STATEMENT. The
-- dashboard invites the latter (091 says so explicitly) but it is unsafe here:
-- the paste being one implicit transaction is what makes the gym_suggestions
-- drop-and-recreate below invisible to the live client, and what guarantees a
-- failed backfill rolls back rather than leaving an EMPTY registry behind a
-- registry-backed picker — which would stop every climber logging a session
-- anywhere, at eight surfaces.
-- The gym_suggestions() rewrite at the foot of this file is deliberately
-- ADDITIVE (name and uses keep their meaning, name returns the label) so the
-- currently deployed client keeps working in between.

-- ── requires 060, 071, 079 and 080, checked before anything installs ─────────
-- The backfill and rewrite below read profiles.default_gyms (060),
-- gym_gradings (071), crew_award_rounds (079) and session_groups (080).
-- Without this guard a missing prerequisite surfaces as a bare "relation does
-- not exist" partway through the paste, which reads like a broken file rather
-- than a skipped migration. 091 set this precedent for the same reason.
--
-- pg_class/pg_attribute rather than information_schema: the latter hides
-- objects the querying role holds no privilege on, so it can report "missing"
-- against a database where the migration is in fact applied.
do $$
declare
  v_missing text[] := '{}';
begin
  if to_regclass('public.session_groups') is null then
    v_missing := v_missing || '080_shared_sessions.sql (session_groups)';
  end if;
  if to_regclass('public.crew_award_rounds') is null then
    v_missing := v_missing || '079_session_awards.sql (crew_award_rounds)';
  end if;
  if to_regclass('public.gym_gradings') is null then
    v_missing := v_missing || '071_gym_gradings.sql (gym_gradings)';
  end if;
  -- to_regclass first: a bare 'public.profiles'::regclass THROWS when the
  -- relation is absent, which is the very error this guard exists to replace.
  if to_regclass('public.profiles') is null then
    v_missing := v_missing || '002_profiles_follows.sql (profiles)';
  elsif not exists (
    select 1 from pg_attribute
     where attrelid = to_regclass('public.profiles')
       and attname = 'default_gyms'
       and not attisdropped
  ) then
    v_missing := v_missing || '060_default_gyms.sql (profiles.default_gyms)';
  end if;

  if array_length(v_missing, 1) > 0 then
    raise exception '092 requires migrations that are not applied: %. Apply them first, in order, then re-run this file.',
      array_to_string(v_missing, ', ');
  end if;
end $$;

-- ── the fold ─────────────────────────────────────────────────────────────────
-- Case, whitespace, punctuation and diacritics folded away. This is the
-- authoritative definition; src/utils/gymRegistry.ts mirrors it for the UI's
-- duplicate hints. If they drift, create_gym's idempotent return means the
-- climber still converges on the existing row.
--
-- Two known limits, worth knowing before anyone tunes these rules. The
-- enumerated translate() list is narrower than the TypeScript mirror's
-- NFD-strip, so a diacritic outside the list survives folding there and not
-- here ('Ściana' -> 'ciana' in SQL, 'sciana' in TS) — a missed duplicate hint,
-- the benign direction. And the fallback fires only when folding empties the
-- string completely, so a mixed-script name keeps just its ASCII: 'Скала 24'
-- and 'Вертикаль 24' both fold to '24' and would collide. Irrelevant for
-- Norwegian gyms; a trap if the app ever ships somewhere else.
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
-- Dropped first so the whole file stays re-runnable after a failed apply,
-- which is the property the rest of its DDL already advertises.
drop policy if exists "gyms readable by authenticated users" on gyms;
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
-- SECURITY DEFINER with NO authorization check of its own, because its callers
-- do the checking. That makes it the most dangerous function in this file, so
-- its EXECUTE grant is revoked below: CREATE FUNCTION grants EXECUTE to PUBLIC
-- by default, and left alone that is an unauthenticated remote path to a
-- twelve-column rewrite plus cascading deletes. Grants are cumulative, so
-- revoking from anon and authenticated is not enough on its own — see the same
-- note in 079_session_awards.sql.
create or replace function public.rewrite_gym_label(p_from text, p_to text)
returns void
language plpgsql
security definer
-- NOT search_path = '', and this is load-bearing rather than a style choice.
-- A SET clause applies for the whole call INCLUDING nested ones, and a trigger
-- function with no SET clause of its own inherits it. Updating public.problems
-- below fires on_problem_crew_send (045), whose notify_crew_send() declares
-- `v_boulder gym_problems` unqualified and carries no SET clause — and plpgsql
-- resolves DECLARE types on function ENTRY, before that function's own
-- early-return guard gets a chance to skip the work. Under an empty
-- search_path it therefore raises `type "gym_problems" does not exist` (42704),
-- which aborts the backfill at the foot of this file and would abort every
-- admin merge and rename in production too.
--
-- pg_catalog, public is still a fixed, caller-proof value, so the hardening
-- that search_path = '' provides is not given up: every reference in this
-- function's own body is already public.-qualified. Do not "tidy" this back.
set search_path = pg_catalog, public
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

-- Client-unreachable after this: anon and authenticated are the roles a
-- browser can present. service_role keeps its default grant, as it does for
-- the same revokes in 079/082/083 — it is a server-side secret, never shipped
-- to a client. The definer chain is unaffected: rename_gym and merge_gyms run
-- as this function's owner, and the backfill runs as the operator.
revoke execute on function public.rewrite_gym_label(text, text) from public;
revoke execute on function public.rewrite_gym_label(text, text) from anon, authenticated;

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

revoke execute on function public.assert_gym_admin() from public;
revoke execute on function public.assert_gym_admin() from anon, authenticated;

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

  if exists (
    select 1 from public.gyms
     where canonical_key = v_key and id <> p_id and merged_into is null
  ) then
    raise exception 'A gym with that name already exists — merge into it instead of renaming';
  elsif exists (select 1 from public.gyms where canonical_key = v_key and id <> p_id) then
    -- A retired row keeps its label so a stale client's string still resolves,
    -- and canonical_key is unique across retired rows too. Say which case this
    -- is: the previous message sent the admin looking for a gym that is gone.
    raise exception 'That name belongs to a gym that was merged away, and its row still holds the name so a stale client can resolve it. Pick a different name';
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
--
-- p_to is load-bearing, not decoration. Almost every row here MOVES to the
-- target; the only rows a merge destroys are those that would collide on a
-- unique constraint, which rewrite_gym_label deletes so the target's row wins
-- — per colour for gym_gradings, per (crew, date) for crew_award_rounds. How
-- many that is depends entirely on which target was chosen, so counting the
-- source alone would show an admin a number that never changes and is almost
-- always larger than the real loss. Pass null before a target is picked: the
-- discarded counts then read 0, which is the truth, because nothing is
-- destroyed until there is a target to collide with.
--
-- Counts eleven of the twelve columns rewrite_gym_label touches.
-- shared_projects.gym is omitted deliberately: its hook has no consumer, so
-- the number would always be 0 and would only add noise to the confirm.
create or replace function public.gym_merge_impact(p_from text, p_to text)
returns table (
  problems bigint, boulders bigint, sessions bigint, session_groups bigint,
  crews bigint, crew_plans bigint, award_rounds bigint, gradings bigint,
  climbers bigint, announcements bigint, beta_points bigint,
  gradings_discarded bigint, award_rounds_discarded bigint
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
      (select count(*) from public.wall_announcements where location = p_from),
      (select count(*) from public.beta_points        where gym      = p_from),
      -- Exactly the rows rewrite_gym_label deletes rather than moves.
      (select count(*) from public.gym_gradings src
        where p_to is not null
          and src.gym = p_from
          and exists (
            select 1 from public.gym_gradings t
             where t.gym = p_to and t.color_name = src.color_name
          )),
      (select count(*) from public.crew_award_rounds src
        where p_to is not null
          and src.gym = p_from
          and exists (
            select 1 from public.crew_award_rounds t
             where t.gym = p_to
               and t.crew_id = src.crew_id
               and t.round_date = src.round_date
          ));
end;
$$;

grant execute on function public.rename_gym(uuid, text, text)   to authenticated;
grant execute on function public.merge_gyms(uuid, uuid)         to authenticated;
grant execute on function public.set_gym_verified(uuid, boolean) to authenticated;
grant execute on function public.gym_merge_impact(text, text)    to authenticated;

-- Same posture as rewrite_gym_label above. CREATE FUNCTION grants EXECUTE to
-- PUBLIC and grants are cumulative, so the explicit grants above narrow
-- nothing by themselves. Each of these guards itself (auth.uid() is null, or
-- assert_gym_admin), so anon only ever got a clean raise — but revoking on two
-- functions and not the other five is the kind of gap that reads as an
-- oversight a year later.
revoke execute on function public.create_gym(text, text)         from public, anon;
revoke execute on function public.rename_gym(uuid, text, text)    from public, anon;
revoke execute on function public.merge_gyms(uuid, uuid)          from public, anon;
revoke execute on function public.set_gym_verified(uuid, boolean) from public, anon;
revoke execute on function public.gym_merge_impact(text, text)    from public, anon;

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
  v_lost_gradings bigint;
  v_lost_rounds   bigint;
begin
  -- Seed BOTH the stored value and its trimmed form. rewrite_gym_label matches
  -- on exact string equality, so a stored 'Klatreverket ' can only be rewritten
  -- if the loop below drives off the stored value; grouping on btrim alone
  -- would leave it forked AND invisible, since the new gym_suggestions returns
  -- registry rows rather than scraped strings.
  create temp table gym_seed on commit drop as
  select g as stored, btrim(g) as raw, count(*) as uses
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
   group by g;

  -- One row per canonical key, display name = the most-used TRIMMED spelling,
  -- summing the uses of its padded variants so the winner is chosen on real
  -- popularity rather than on whichever variant happened to be tidy.
  insert into public.gyms (name, city, label, canonical_key, verified, created_by)
  select distinct on (w.key) w.raw, null, w.raw, w.key, false, null
    from (
      select public.fold_gym_text(s.raw) as key, s.raw, sum(s.uses) as uses
        from gym_seed s
       group by public.fold_gym_text(s.raw), s.raw
    ) w
   order by w.key, w.uses desc, w.raw asc
  on conflict (canonical_key) do nothing;

  -- Now collapse the variants for real. Without this the registry would look
  -- clean while the data stayed forked — a nicer picker over the same two
  -- leaderboards. Driven off `stored`, so padded values are rewritten too.
  for r in
    select s.stored as from_label, g.label as to_label
      from gym_seed s
      join public.gyms g on g.canonical_key = public.fold_gym_text(s.raw)
     where s.stored <> g.label
  loop
    -- Counted BEFORE the rewrite, with the same collision predicates
    -- rewrite_gym_label deletes on. Everything else moves across; these are
    -- the only rows a collapse destroys, and an operator gets no other chance
    -- to see them.
    select count(*) into v_lost_gradings
      from public.gym_gradings src
     where src.gym = r.from_label
       and exists (
         select 1 from public.gym_gradings t
          where t.gym = r.to_label and t.color_name = src.color_name
       );
    select count(*) into v_lost_rounds
      from public.crew_award_rounds src
     where src.gym = r.from_label
       and exists (
         select 1 from public.crew_award_rounds t
          where t.gym = r.to_label
            and t.crew_id = src.crew_id
            and t.round_date = src.round_date
       );

    perform public.rewrite_gym_label(r.from_label, r.to_label);

    if v_lost_gradings > 0 or v_lost_rounds > 0 then
      -- WARNING, not NOTICE: this line is the only record that data was lost.
      raise warning 'backfill: % -> % — DISCARDED % grading colour(s) and % award round(s) with their votes',
        r.from_label, r.to_label, v_lost_gradings, v_lost_rounds;
    else
      raise notice 'backfill: % -> %', r.from_label, r.to_label;
    end if;
  end loop;
end $$;

-- ── suggestions ──────────────────────────────────────────────────────────────
-- Was: distinct strings scraped from sessions and problems — a list derived
-- from the polluted data, so junk kept recommending itself. Now: registry
-- rows, with usage counts, excluding anything merged away.
--
-- ADDITIVE return shape, and this is load-bearing for the release gate:
-- `name` still carries the string the deployed client writes into problems.gym
-- (the LABEL), `uses` is still a count, and the six new columns are simply
-- ignored by it. So the live app keeps working between this apply and the
-- client deploy.
--
-- `uses` is not identical to 050's, though: this counts gym_problems as well
-- as sessions and problems, so magnitudes and therefore ordering shift. The
-- shape is compatible; the numbers are not the same numbers.
--
-- DROP before CREATE, and this is NOT optional. 050 declared
-- `returns table (name text, uses bigint)`; RETURNS TABLE columns are OUT
-- parameters, so adding columns changes the function's return type and
-- `create or replace` raises "cannot change return type of existing function".
-- Applied as one paste (see the header), the drop and the create are in the
-- same transaction, so the deployed client never sees a window without the
-- function; the grant below restores what the drop removes. Applied statement
-- by statement they are NOT, and the live client's picker errors in between —
-- which is one of the reasons the header insists on a whole-file paste.
--
-- Still SECURITY DEFINER for 050's reason: sessions are not globally readable,
-- and the counts read them.
drop function if exists public.gym_suggestions();
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
-- for real. Nothing here is wrapped in a rollback — the enclosing whole-file
-- paste IS the transaction, so a failure anywhere in this file rolls all of
-- it back — so the smoke rows this writes are deleted explicitly at the foot
-- of the block, after the checks that need them to still exist have run.
--
-- The fold cases mirror src/utils/__tests__/gymRegistry.test.ts. If these two
-- ever disagree, this is where it should be caught.
do $$
declare
  v_gym    record;
  v_impact record;
  v_user   uuid;
  v_admin  uuid;
  v_a      uuid;
  v_b      uuid;
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

  -- The three exact labels this block creates, never a prefix: a LIKE would
  -- also match a climber's gym that happens to start the same way, deleting
  -- its registry row while twelve columns still hold its label — and it would
  -- raise an FK violation if a real gym had been merged into a leftover smoke
  -- row, since the update below clears merged_into ON these rows, not pointers
  -- TO them.
  update public.gyms set merged_into = null
   where label in ('Smoke Test Wall, Nowhere', 'Smoke Test Wall Two, Nowhere', 'Smoke Test Wall Two, Elsewhere');
  delete from public.gyms
   where label in ('Smoke Test Wall, Nowhere', 'Smoke Test Wall Two, Nowhere', 'Smoke Test Wall Two, Elsewhere');

  -- Everything below that touches create_gym or an admin function needs a
  -- session identity. Applied by hand there is no JWT, so auth.uid() is null
  -- and create_gym would raise 'You must be signed in to add a gym'. Borrow a
  -- real profiles.id: gyms.created_by carries an FK to auth.users(id), so a
  -- synthetic uuid would fail the insert rather than the guard.
  select p.id into v_user  from public.profiles p order by p.id limit 1;
  select p.id into v_admin from public.profiles p where p.is_admin = true order by p.id limit 1;

  if v_user is null then
    raise notice 'smoke: profiles is empty, so create_gym, rewrite_gym_label and all four admin bodies are NOT exercised here — they are parsed for the first time on their first real call. Watch the first add, rename and merge.';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_user)::text, true);

    select * into v_gym from public.create_gym('Smoke Test Wall', 'Nowhere');
    assert v_gym.label = 'Smoke Test Wall, Nowhere', 'create_gym: label';
    assert v_gym.climber_added, 'create_gym: climber_added';
    v_a := v_gym.id;

    -- the second and third calls must return the FIRST row, not fail
    select * into v_gym from public.create_gym('  smoke test wall  ', 'NOWHERE');
    assert v_gym.id = v_a, 'create_gym: idempotent on a folded match';
    select * into v_gym from public.create_gym('Smoke Test Wall, Nowhere', null);
    assert v_gym.id = v_a, 'create_gym: legacy single-string form folds to the same key';

    select * into v_gym from public.create_gym('Smoke Test Wall Two', 'Nowhere');
    assert v_gym.label = 'Smoke Test Wall Two, Nowhere', 'create_gym: second smoke gym';
    v_b := v_gym.id;

    -- rewrite_gym_label: every one of the twelve statements planned and run.
    -- Both labels exist and neither is in use, so this writes nothing while
    -- still forcing parse analysis of every column reference.
    perform public.rewrite_gym_label('Smoke Test Wall, Nowhere', 'Smoke Test Wall Two, Nowhere');

    if v_admin is null then
      raise notice 'smoke: no profile has is_admin, so rename_gym, merge_gyms, set_gym_verified and gym_merge_impact are NOT exercised — their bodies are parsed for the first time on their first real call. Watch the first rename and merge.';
    else
      -- Impersonate an admin so those four bodies actually run rather than
      -- stopping at their guard. Every write below is confined to the two
      -- smoke gyms, which are removed at the foot of this block.
      perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

      perform public.set_gym_verified(v_b, true);
      assert (select verified from public.gyms where id = v_b), 'set_gym_verified';

      perform public.rename_gym(v_b, 'Smoke Test Wall Two', 'Elsewhere');
      assert (select label from public.gyms where id = v_b) = 'Smoke Test Wall Two, Elsewhere',
             'rename_gym: label rewritten';

      select * into v_impact from public.gym_merge_impact('Smoke Test Wall, Nowhere', null);
      assert v_impact.problems = 0 and v_impact.climbers = 0,
             'gym_merge_impact: counts for a label nothing uses';

      perform public.merge_gyms(v_a, v_b);
      assert (select merged_into from public.gyms where id = v_a) = v_b, 'merge_gyms: merged_into set';
    end if;

    -- Drop the borrowed identity before anything else runs.
    perform set_config('request.jwt.claims', json_build_object('sub', null)::text, true);
  end if;

  -- The guard fires for a caller who is not an admin. A random uuid has no
  -- profiles row, so this is deterministic whoever applies the file — it does
  -- not depend on the operator's own admin flag. Three outcomes, one pass:
  --   no raise          -> the guard is not guarding
  --   the wrong message -> the body is broken, which is the very thing this
  --                        block exists to catch; a handler that accepted any
  --                        error would mask it
  --   its guard message -> pass
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid())::text, true);
  begin
    perform public.assert_gym_admin();
    raise exception 'assert_gym_admin: expected a raise for a non-admin caller';
  exception when others then
    if sqlerrm = 'assert_gym_admin: expected a raise for a non-admin caller' then
      raise;
    elsif sqlerrm <> 'Only admins can manage gyms' then
      raise exception 'assert_gym_admin raised "%" instead of its guard message — its body is broken, not guarding', sqlerrm;
    end if;
    raise notice 'assert_gym_admin raised as expected: %', sqlerrm;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', null)::text, true);

  -- gym_suggestions must answer...
  perform 1 from public.gym_suggestions() limit 1;

  -- ...and must not still be listing the smoke gyms after they go. merged_into
  -- is a self-FK, so it has to be cleared before the delete.
  if v_a is not null then
    update public.gyms set merged_into = null where id in (v_a, v_b);
    delete from public.gyms where id in (v_a, v_b);
    assert not exists (
      select 1 from public.gym_suggestions() where label like 'Smoke Test Wall%'
    ), 'gym_suggestions: smoke rows still listed after delete';
  end if;

  raise notice 'gym registry smoke: 11 fold vectors, create_gym x4 (idempotent + legacy form), rewrite_gym_label across all twelve columns, the admin guard, and — where a profile and an admin exist — set_gym_verified, rename_gym, gym_merge_impact and merge_gyms all ran, on smoke rows since removed. READ THE NOTICES ABOVE: anything reported as NOT exercised is still unvalidated.';
end $$;
