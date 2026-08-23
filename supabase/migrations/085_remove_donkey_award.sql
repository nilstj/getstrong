-- 085: remove the donkey award, server side
--
-- The client half is gone: no donkey picker, no verdict card, no repeat-donkey
-- streak, and cast_award_vote is now called with a hardcoded 'goat'. This is the
-- server catching up, so the capability is actually removed rather than merely
-- unrendered.
--
-- Three changes, and deliberately nothing else:
--
-- 1. cast_award_vote accepts 'goat' only. p_kind STAYS in the signature: a
--    `create or replace` cannot change it, and dropping and recreating with one
--    argument would 404 every request from the currently deployed client. So the
--    argument remains and the value is rejected.
--
-- 2. get_award_round withholds donkey rows from both 'votes' and 'mine.votes'.
--    Rounds voted on before this migration keep theirs, and the client's
--    awardTally skips them anyway -- but sending them is pointless disclosure,
--    and filtering here is what lets AwardVoteRow.kind stop being a union later.
--
-- 3. crew_award_history is dropped. It existed only to feed the donkey streak
--    and has no caller left anywhere in src/.
--
-- What is deliberately NOT touched, following how outdoor bouldering, exercise
-- logging and problem names were each removed here -- code path deleted, data
-- kept:
--
-- * crew_award_votes.kind keeps `check (kind in ('goat','donkey'))`. Tightening
--   it to 'goat' would reject the legacy rows it is meant to preserve.
-- * crew_award_votes_no_self_goat stays as `kind = 'donkey' or voter_id <>
--   subject_id`. It reads oddly now, but tightening it to `voter_id <>
--   subject_id` would fail outright if any climber ever voted themselves donkey,
--   which that constraint expressly allowed. Nothing can insert a self-vote any
--   more regardless: 'goat' is the only accepted kind and it already forbids it.
-- * crew_award_reactions.kind keeps both values. The client only ever writes
--   'goat', and a stray donkey reaction renders nowhere.
--
-- award_round_status needs no change: it has counted only goat votes since 083,
-- so "everyone has voted" already meant "everyone cast a GOAT vote" and the
-- unlock condition is unchanged by this.
--
-- Left standing but now purposeless, flagged rather than changed: 083's
-- open_award_round derives crew_award_rounds.crew_id for a group whose climbers
-- all share one crew, and that value existed solely to scope the repeat-donkey
-- streak. It costs nothing and would be what a GOAT streak reads, so it stays.
-- session_groups.crew_id (080) was already never written by anything.
--
-- RELEASE GATE: apply after the client that stops asking for donkey votes.
-- Applying first only costs a rejected vote on a surface that no longer offers
-- one; applying it late leaves donkey mintable, which is the wrong way round.

create or replace function public.cast_award_vote(p_round uuid, p_kind text, p_subject uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_unlocked boolean;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  -- 'goat' only. The deployed client hardcodes it, and this is the guard that
  -- stops anything else minting a donkey vote now that nothing renders one.
  if p_kind <> 'goat' then raise exception 'Unknown award'; end if;
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
                  from crew_award_votes where round_id = p_round and kind = 'goat' and voter_id = v_me),
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
               where round_id = p_round and kind = 'goat'
                 and voter_id = any(v_roster) and subject_id = any(v_roster)),
    'tags',  (select coalesce(jsonb_agg(jsonb_build_object('voter_id', voter_id, 'subject_id', subject_id, 'tag', tag)), '[]'::jsonb)
                from crew_award_tags
               where round_id = p_round and voter_id = any(v_roster) and subject_id = any(v_roster)),
    'notes', (select coalesce(jsonb_agg(jsonb_build_object('voter_id', voter_id, 'subject_id', subject_id, 'body', body)), '[]'::jsonb)
                from crew_award_notes
               where round_id = p_round and voter_id = any(v_roster) and subject_id = any(v_roster))
  );
end; $$;

-- Only ever fed the donkey streak; no caller left in src/.
drop function if exists public.crew_award_history(uuid, int);


-- 084's lesson: a plpgsql body is not validated at CREATE time, so a migration
-- can apply clean and still raise on first call. A `do` block IS executed here,
-- so this fails loudly in the dashboard rather than at a climber's first vote.
do $$
begin
  -- Gone, not merely unused.
  if to_regprocedure('public.crew_award_history(uuid, int)') is not null then
    raise exception '085 did not drop crew_award_history';
  end if;
  -- And the vote path still reachable by the deployed client, which sends three
  -- arguments. If this is null the replace above changed the signature, and
  -- every vote would 404.
  if to_regprocedure('public.cast_award_vote(uuid, text, uuid)') is null then
    raise exception '085 left cast_award_vote without its 3-argument signature';
  end if;
end $$;
