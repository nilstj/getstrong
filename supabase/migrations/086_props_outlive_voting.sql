-- 086: props and comments outlive the vote deadline
--
-- assert_award_voter guarded three write paths -- cast_award_vote,
-- toggle_award_tag and set_award_note -- and one of its checks was
-- `now() > closes_at -> 'Voting has closed'`. So the moment voting closed, so
-- did giving props and writing a comment, on every round.
--
-- That conflates two different things. A verdict has to settle, so a late vote
-- must be refused. Recognition does not: a 🧠 Best beta remembered the next
-- morning is still worth giving, and the tallies on the verdict card are a
-- record of what people did, not a ballot.
--
-- So the deadline moves from assert_award_voter into cast_award_vote. Both keep
-- their signatures, so this is two `create or replace`s and nothing else.
-- toggle_award_tag and set_award_note are not redefined at all -- they call
-- assert_award_voter and simply stop being deadline-bound as a result.
--
-- Everything else assert_award_voter checked is untouched and still applies to
-- all three paths: authenticated, the caller is a current participant, the
-- subject is a current participant, and the round exists. crew_award_tags'
-- not-self constraint and crew_award_notes' likewise are also untouched, so you
-- still cannot tag or comment on yourself.
--
-- cast_award_vote is reproduced from 083 with 085's goat-only narrowing kept, so
-- applying this after 085 does not undo it. Applying it BEFORE 085 would, so
-- apply them in order.
--
-- Note the closed-but-not-unlocked state does not exist: award_round_status
-- unlocks a round when everyone has voted OR closes_at has passed, so a closed
-- round is always an unlocked one -- which is exactly where the client now shows
-- the props affordance.
--
-- RELEASE GATE: apply with or before the client that offers props on the
-- verdict card. Applying late just means the affordance is there and the write
-- is refused.

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
  -- Existence only. The deadline used to be enforced here, which closed props
  -- and comments at the same moment as voting; cast_award_vote carries it now.
  select closes_at into v_closes from crew_award_rounds where id = p_round;
  if v_closes is null then raise exception 'No such round'; end if;
end; $$;

create or replace function public.cast_award_vote(p_round uuid, p_kind text, p_subject uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_unlocked boolean;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  -- 'goat' only, per 085.
  if p_kind <> 'goat' then raise exception 'Unknown award'; end if;
  perform assert_award_voter(p_round, p_subject, 'vote');

  -- The deadline belongs to voting alone. A verdict has to settle, so a vote
  -- after closes_at is refused -- but props and comments stay open, which is
  -- why this check moved out of assert_award_voter and into here. The round is
  -- known to exist by now: assert_award_voter raises 'No such round' otherwise.
  if now() > (select closes_at from crew_award_rounds where id = p_round) then
    raise exception 'Voting has closed';
  end if;

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

-- 084's lesson: a plpgsql body is not validated at CREATE time. A `do` block IS
-- executed, so a signature slip fails here in the dashboard rather than at a
-- climber's next tap.
do $$
begin
  if to_regprocedure('public.assert_award_voter(uuid, uuid, text)') is null then
    raise exception '086 changed assert_award_voter''s signature';
  end if;
  if to_regprocedure('public.cast_award_vote(uuid, text, uuid)') is null then
    raise exception '086 changed cast_award_vote''s signature';
  end if;
end $$;
