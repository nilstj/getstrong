-- The awards belong to a session, not a crew.
--
-- 079 keyed a round on (crew_id, round_date, gym) and snapshotted participants by
-- matching sessions on a trimmed gym string. That inference is why the feature
-- showed nothing on its first day in production. A round now points at a
-- session_groups row, and participation is live group membership: anyone with a
-- sessions row carrying that group_id, crew member or not.
--
-- 079 and 080 are already applied, so every function this replaces is re-created
-- with `create or replace`, and the one policy this replaces is dropped and
-- re-created.
--
-- Rows predating this migration keep group_id = null. They are not deleted and not
-- matched to groups by date and gym -- that is the guessing being removed. They
-- simply stop being reachable, because the surfaces that linked to them are gone.
--
-- Nothing here awards beta_points.

-- ── Schema ───────────────────────────────────────────────────────────────────
alter table crew_award_rounds add column if not exists group_id uuid references session_groups(id) on delete cascade;
alter table crew_award_rounds add column if not exists unlocked_at timestamptz;

-- One round per group. Partial, so the pre-existing rows (group_id null) stay out
-- of the index and it cannot fail on legacy data.
create unique index if not exists crew_award_rounds_group_idx
  on crew_award_rounds (group_id) where group_id is not null;

-- A group of friends need not be a crew, so a round may have no crew at all. The
-- old composite key is meaningless now that the group identifies the round.
alter table crew_award_rounds alter column crew_id drop not null;
alter table crew_award_rounds drop constraint if exists crew_award_rounds_crew_id_round_date_gym_key;

-- crew_id was ownership under 079 (`references crews(id) on delete cascade`):
-- deleting the crew rightly deleted its round. It is now a derived streak tag,
-- stamped by open_award_round below whenever every CURRENT group member
-- happens to share exactly one crew -- the round's real owner is
-- session_groups, via group_id. A crew going away (deleted by its owner, or by
-- its last member leaving) must not cascade into destroying an unrelated
-- session's votes, tags, notes, thread and reactions, so the crew deletion
-- nulls the tag instead of taking the round with it. Dropped and re-added by
-- its default single-column name so this is safe to re-run.
alter table crew_award_rounds drop constraint if exists crew_award_rounds_crew_id_fkey;
alter table crew_award_rounds add constraint crew_award_rounds_crew_id_fkey
  foreign key (crew_id) references crews(id) on delete set null;

-- ── The read gate ────────────────────────────────────────────────────────────
-- 079 gated every read on is_crew_member(r.crew_id). With crew_id now nullable,
-- that returns false for a crewless group -- nobody could read the round, the
-- roster, the thread or the reactions. Group membership is the gate now; a legacy
-- row (group_id null) falls back to its crew so old data stays readable to the
-- crew it belonged to.
create or replace function public.is_award_round_member(p_round uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from crew_award_rounds r
     where r.id = p_round
       and (
         (r.group_id is not null and is_session_group_member(r.group_id))
         or (r.group_id is null and r.crew_id is not null and is_crew_member(r.crew_id))
       )
  );
$$;

drop policy if exists "award rounds readable by crew" on crew_award_rounds;
create policy "award rounds readable by the session or crew" on crew_award_rounds for select using (
  (group_id is not null and is_session_group_member(group_id))
  or (group_id is null and crew_id is not null and is_crew_member(crew_id))
);

-- 079 described crew_award_messages' thread as "open to the whole crew, not
-- just the climbers who were there" -- true under 079's is_award_round_member
-- (gated on is_crew_member(r.crew_id) alone). The redefinition above changes
-- that for any round with a group: reading or posting to the thread (both
-- policies in 079 are `using/with check (is_award_round_member(round_id))`)
-- now requires live session-group membership, so a crew member who was not in
-- that session can no longer read or post there. Intended under the owner's
-- brief for this migration -- the thread now follows the session, not the
-- whole crew -- but recorded here explicitly since 079's own comment still
-- describes the old, wider-open behaviour.

-- ── Participation and status ─────────────────────────────────────────────────
-- Live participation: everyone with a session in the round's group. Replaces the
-- crew_award_participants snapshot, which is retained but no longer read (this
-- project keeps data when removing a code path).
create or replace function public.award_round_participants(p_round uuid)
returns setof uuid language sql security definer stable set search_path = public as $$
  select s.user_id
    from sessions s
    join crew_award_rounds r on r.id = p_round
   where r.group_id is not null and s.group_id = r.group_id;
$$;

-- One definition of progress and of "unlocked". A participant counts as having
-- voted on their GOAT vote; the donkey vote is optional, so an abstainer cannot
-- hold a round hostage. unlocked_at makes unlocking ONE-WAY: with live membership
-- a climber joining after the last vote would otherwise push participants above
-- voted and re-lock a verdict people have already read.
--
-- v.cnt counts only voters who are STILL a current participant (p.ids, the same
-- roster computed for p.cnt, reused rather than re-queried). Participation is
-- live group membership now: without this filter, a voter who stops being a
-- participant (e.g. deletes their session) would stay counted as "voted"
-- forever, so the last real participant's vote could complete the round on a
-- departed member's behalf while someone who is actually still there never got
-- a say. 079 protected this same invariant by deleting a departed member's
-- votes outright on every re-snapshot; 083 keeps rows instead of deleting them,
-- so the count is filtered at read time here instead.
create or replace function public.award_round_status(p_round uuid)
returns table (participants integer, voted integer, unlocked boolean)
language sql security definer stable set search_path = public as $$
  select p.cnt, v.cnt,
         coalesce(
           r.unlocked_at is not null
           or (p.cnt > 0 and v.cnt >= p.cnt)
           or now() > r.closes_at,
           false)
    from crew_award_rounds r
    cross join lateral (
      select coalesce(array_agg(u), array[]::uuid[]) as ids, count(*)::integer as cnt
        from award_round_participants(p_round) u
    ) p
    cross join lateral (
      select count(distinct voter_id)::integer as cnt
        from crew_award_votes
       where round_id = p_round and kind = 'goat' and voter_id = any(p.ids)
    ) v
   where r.id = p_round;
$$;

-- ── Write guards ─────────────────────────────────────────────────────────────
-- 079 asked crew_award_participants; participation is live group membership now.
create or replace function public.assert_award_voter(p_round uuid, p_subject uuid, p_what text)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_closes timestamptz;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from award_round_participants(p_round) u where u = v_user) then
    raise exception 'Only climbers from that session can %', p_what;
  end if;
  if not exists (select 1 from award_round_participants(p_round) u where u = p_subject) then
    raise exception 'That climber was not in the session';
  end if;
  select closes_at into v_closes from crew_award_rounds where id = p_round;
  if v_closes is null then raise exception 'No such round'; end if;
  if now() > v_closes then raise exception 'Voting has closed'; end if;
end; $$;

-- Same shape as 079's apart from the guard call and the unlocked_at latch --
-- not the same body, though: 079 also wrote first_vote_at here, read back by
-- its own open_award_round to gate the re-snapshot-until-first-vote window.
-- 083's open_award_round drops that whole re-snapshot path (participation is
-- live now, not a snapshot), so first_vote_at is dead: nothing anywhere writes
-- or reads it any more. The column itself is left in place, unwritten.
create or replace function public.cast_award_vote(p_round uuid, p_kind text, p_subject uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_unlocked boolean;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if p_kind not in ('goat', 'donkey') then raise exception 'Unknown award'; end if;
  perform assert_award_voter(p_round, p_subject, 'vote');

  insert into crew_award_votes (round_id, voter_id, kind, subject_id)
    values (p_round, v_user, p_kind, p_subject)
    on conflict (round_id, voter_id, kind)
      do update set subject_id = excluded.subject_id, created_at = now();

  -- Latch the reveal the moment the round becomes unlocked by EITHER branch of
  -- award_round_status -- vote completion or the deadline passing -- not only
  -- vote completion, so a round that timed out and then gets one more vote
  -- (e.g. a straggler casting theirs after closes_at) also gets its
  -- unlocked_at stamped instead of leaving session_group_verdict_is_out (082)
  -- blind to a verdict that is, in fact, already out. get_award_round is
  -- stable and cannot write, which is why the latch is stamped here.
  select unlocked into v_unlocked from award_round_status(p_round);
  if v_unlocked then
    update crew_award_rounds set unlocked_at = coalesce(unlocked_at, now())
     where id = p_round and unlocked_at is null;
  end if;
end; $$;

-- ── Props and notes ──────────────────────────────────────────────────────────
-- Faithful reproduction of 079's toggle_award_tag: the tag vocabulary is
-- enforced by crew_award_tags' own check constraint (untouched by this
-- migration), and the delete-then-insert with its `get diagnostics` read is
-- unchanged. Only the guard call site and the auth.uid() capture are new.
-- Returns true when the tag ended up ON, false when it was removed.
create or replace function public.toggle_award_tag(p_round uuid, p_subject uuid, p_tag text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_deleted integer;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  perform assert_award_voter(p_round, p_subject, 'give props');

  delete from crew_award_tags
   where round_id = p_round and voter_id = v_user and subject_id = p_subject and tag = p_tag;
  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then return false; end if;

  insert into crew_award_tags (round_id, voter_id, subject_id, tag)
    values (p_round, v_user, p_subject, p_tag);
  return true;
end; $$;

-- Faithful reproduction of 079's set_award_note: an empty body still clears the
-- note. Only the guard call site and the auth.uid() capture are new.
create or replace function public.set_award_note(p_round uuid, p_subject uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_body text;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  perform assert_award_voter(p_round, p_subject, 'comment');

  v_body := nullif(trim(coalesce(p_body, '')), '');
  if v_body is null then
    delete from crew_award_notes
     where round_id = p_round and voter_id = v_user and subject_id = p_subject;
    return;
  end if;

  insert into crew_award_notes (round_id, voter_id, subject_id, body)
    values (p_round, v_user, p_subject, v_body)
    on conflict (round_id, voter_id, subject_id)
      do update set body = excluded.body, created_at = now();
end; $$;

-- ── Opening a round ──────────────────────────────────────────────────────────
-- Rounds are opened for a GROUP now, lazily, by anyone in the session. The old
-- three-argument version discovered a round from (crew, date, gym); that whole
-- discovery path is gone.
drop function if exists public.open_award_round(uuid, date, text);
drop function if exists public.crew_award_candidates(uuid);

create or replace function public.open_award_round(p_group uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_id uuid; v_date date; v_gym text; v_crew uuid; v_members integer;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not is_session_group_member(p_group) then
    raise exception 'Only climbers from that session can open its awards';
  end if;

  select id into v_id from crew_award_rounds where group_id = p_group;
  if v_id is not null then
    -- A round already exists, so this call is just a lazy lookup -- but if
    -- the deadline has since passed (the timeout branch of
    -- award_round_status) and nobody has cast a vote since, cast_award_vote's
    -- latch above never ran and unlocked_at is still null. Catching it here
    -- too closes some of that gap: whichever member's client next opens the
    -- awards screen for this group latches the reveal. It cannot close it
    -- fully -- a round that times out and is never revisited through either
    -- this function or cast_award_vote keeps unlocked_at NULL indefinitely;
    -- see this migration's header note / the review report for that residual
    -- case.
    if (select unlocked from award_round_status(v_id)) then
      update crew_award_rounds set unlocked_at = coalesce(unlocked_at, now())
       where id = v_id and unlocked_at is null;
    end if;
    return v_id;
  end if;

  select date, gym into v_date, v_gym from session_groups where id = p_group;
  select count(*) into v_members from sessions where group_id = p_group;
  if v_members < 2 then
    raise exception 'Awards need at least two climbers in the session';
  end if;

  -- The streak's scope. session_groups.crew_id is never written by 080, so the
  -- crew is derived here: exactly one crew that EVERY current member belongs to,
  -- otherwise none. A crew climbing together gets a streak; a mixed group does
  -- not, which is what "crew-scoped where a crew exists" means.
  select case when count(*) = 1 then min(c.crew_id) end into v_crew
    from (
      select cm.crew_id
        from crew_members cm
       where cm.user_id in (select user_id from sessions where group_id = p_group)
       group by cm.crew_id
      having count(distinct cm.user_id) = v_members
    ) c;

  insert into crew_award_rounds (crew_id, group_id, round_date, gym, opened_by, closes_at)
    values (v_crew, p_group, v_date, v_gym, v_user, now() + interval '24 hours')
    on conflict (group_id) where group_id is not null do nothing
    returning id into v_id;
  if v_id is null then
    select id into v_id from crew_award_rounds where group_id = p_group;
  end if;
  return v_id;
end; $$;

-- ── The unlock gate ──────────────────────────────────────────────────────────
-- Reproduction of 079's get_award_round payload -- 'mine', the 'voters' list and
-- the withheld votes/tags/notes behind the unlock check are unchanged in shape.
-- Three things differ: the gate is the group-or-legacy-crew membership check
-- instead of is_crew_member(v_crew); participants/voted/unlocked already came
-- from award_round_status in 079 and still do; and am_participant now reads
-- live group membership instead of the crew_award_participants snapshot,
-- alongside a new roster field so the client no longer needs a separate
-- participants query.
--
-- v_roster is computed once, up front, and reused everywhere "current
-- participant" matters, so it can never drift from award_round_participants:
-- it backs am_participant and roster below, and it filters 'voters' and, once
-- unlocked, 'votes'/'tags'/'notes' to rows whose voter AND subject are both
-- still current participants. Without that filter a departed member's row
-- still renders once unlocked with its author missing from 'roster' -- which
-- the client resolves authors against and falls back to "Someone" for -- the
-- exact anonymous dig 079 built its re-snapshot delete to prevent. 083 keeps
-- rows instead of deleting them, so the same guarantee is made here, at read
-- time, instead.
create or replace function public.get_award_round(p_round uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  v_closes timestamptz; v_participants integer; v_voted integer;
  v_unlocked boolean; v_out jsonb; v_me uuid := auth.uid(); v_roster uuid[];
begin
  if not is_award_round_member(p_round) then raise exception 'Not your session'; end if;

  select closes_at into v_closes from crew_award_rounds where id = p_round;

  -- Counts and unlock state come from the one shared computation, so this
  -- payload's "voted"/"unlocked" can never drift from what actually gates the
  -- write guards.
  select participants, voted, unlocked into v_participants, v_voted, v_unlocked
    from award_round_status(p_round);

  select coalesce(array_agg(u), array[]::uuid[]) into v_roster
    from award_round_participants(p_round) u;

  v_out := jsonb_build_object(
    'round_id', p_round,
    'participants', v_participants,
    'voted', v_voted,
    'closes_at', v_closes,
    'unlocked', v_unlocked,
    'voters', (select coalesce(jsonb_agg(distinct voter_id), '[]'::jsonb)
                 from crew_award_votes
                where round_id = p_round and kind = 'goat' and voter_id = any(v_roster)),
    'am_participant', v_me = any(v_roster),
    'roster', to_jsonb(v_roster),
    'mine', jsonb_build_object(
      'votes', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'subject_id', subject_id)), '[]'::jsonb)
                  from crew_award_votes where round_id = p_round and voter_id = v_me),
      'tags',  (select coalesce(jsonb_agg(jsonb_build_object('subject_id', subject_id, 'tag', tag)), '[]'::jsonb)
                  from crew_award_tags where round_id = p_round and voter_id = v_me),
      'notes', (select coalesce(jsonb_agg(jsonb_build_object('subject_id', subject_id, 'body', body)), '[]'::jsonb)
                  from crew_award_notes where round_id = p_round and voter_id = v_me)
    )
  );

  if not v_unlocked then return v_out; end if;

  return v_out || jsonb_build_object(
    'votes', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'voter_id', voter_id, 'subject_id', subject_id)), '[]'::jsonb)
                from crew_award_votes
               where round_id = p_round and voter_id = any(v_roster) and subject_id = any(v_roster)),
    'tags',  (select coalesce(jsonb_agg(jsonb_build_object('voter_id', voter_id, 'subject_id', subject_id, 'tag', tag)), '[]'::jsonb)
                from crew_award_tags
               where round_id = p_round and voter_id = any(v_roster) and subject_id = any(v_roster)),
    'notes', (select coalesce(jsonb_agg(jsonb_build_object('voter_id', voter_id, 'subject_id', subject_id, 'body', body)), '[]'::jsonb)
                from crew_award_notes
               where round_id = p_round and voter_id = any(v_roster) and subject_id = any(v_roster))
  );
end; $$;

-- ── History (for the repeat-donkey streak) ───────────────────────────────────
-- Stays crew-scoped and keeps its shape. Two changes from 079: only rounds with
-- a group_id are considered (a legacy round has nothing live to recount), and
-- the unlock filter reads award_round_status directly rather than going through
-- the untouched award_round_unlocked wrapper.
create or replace function public.crew_award_history(p_crew uuid, p_limit int default 12)
returns table (round_id uuid, round_date date, kind text, subject_id uuid, votes integer)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_crew_member(p_crew) then raise exception 'Not your crew'; end if;
  return query
  with recent as (
    select r.id, r.round_date
      from crew_award_rounds r
     where r.crew_id = p_crew
       and r.group_id is not null
       and (select unlocked from award_round_status(r.id))
     order by r.round_date desc, r.gym
     limit least(coalesce(p_limit, 12), 52)
  )
  select ro.id, ro.round_date, v.kind, v.subject_id, count(*)::integer
    from recent ro
    join crew_award_votes v on v.round_id = ro.id
   group by ro.id, ro.round_date, v.kind, v.subject_id;
end; $$;

-- ── Closing the internal helpers ─────────────────────────────────────────────
-- Internal only, and each trusts its argument without an ownership check.
-- Revoking from the roles alone leaves the PUBLIC grant standing, because
-- CREATE FUNCTION grants EXECUTE to PUBLIC by default (established in 079).
--
-- is_award_round_member is NOT revoked: it is referenced inside the RLS policy
-- bodies of crew_award_participants, crew_award_messages and
-- crew_award_reactions, which evaluate as the querying role, so revoking it
-- would deny every read of those tables. (This migration's first draft also
-- defined award_round_group, a round-to-group lookup with no ownership check
-- and no caller anywhere in this file or in src/; it is deleted outright
-- rather than kept and revoked, since there is nothing left to protect by
-- keeping it.)
revoke execute on function public.award_round_participants(uuid) from anon, authenticated;
revoke execute on function public.award_round_participants(uuid) from public;
revoke execute on function public.award_round_status(uuid) from anon, authenticated;
revoke execute on function public.award_round_status(uuid) from public;
revoke execute on function public.assert_award_voter(uuid, uuid, text) from anon, authenticated;
revoke execute on function public.assert_award_voter(uuid, uuid, text) from public;
