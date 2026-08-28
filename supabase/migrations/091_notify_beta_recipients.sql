-- Beta reaches the climber who needs it. When a beta is posted on a live shared
-- boulder, tell the climbers who have a reason to care — rather than leaving it
-- on the boulder page to be discovered.
--
-- Two audiences, both already tracked by the schema, and deliberately disjoint:
--
--   asked      an open gym_problem_help row (057). They said "I'm stuck".
--   projecting a problems row on this boulder with no sent go. This is the
--              app's own definition of a project, per the comment in
--              src/hooks/useDiscoverBoulders.ts: "Done = at least one sent go.
--              A claimed-but-unsent boulder is still a project."
--
-- "asked" wins the overlap, so one beta is never two rows for one climber.
--
-- Set-based inserts rather than a loop over create_notification (037) — the
-- shape 038_video_notifications.sql uses for a fan-out. The
-- `user_id <> new.user_id` predicates supply the self-skip that
-- create_notification would otherwise have given: you are not pinged for your
-- own beta.
--
-- REQUIRES 090: reads boulder_beta.kind and .risk_move. The do block below
-- refuses to let any of this install if 090 is missing.

-- ── requires 090, checked before anything installs ───────────────────────────
-- This has to come first, because everything else that would catch a skipped
-- 090 comes too late to help. `create or replace function` does not validate a
-- plpgsql body, and `create trigger` does not validate it either — so an
-- operator applying this file statement by statement (what the Supabase
-- dashboard invites) without 090 installs a LIVE trigger whose every firing
-- raises `record "new" has no field "kind"`, killing beta posting app-wide.
-- Having watched only the smoke block at the foot of the file go red, they
-- would reasonably conclude that nothing had applied at all.
--
-- pg_attribute rather than information_schema (088's choice) on purpose:
-- information_schema hides columns the querying role holds no privilege on, so
-- it can report "missing" against a database where 090 is in fact applied. The
-- catalog answers what the table actually holds.
--
-- A raise belongs here and nowhere else in this file: this one fires at apply
-- time, in front of an operator who can act on it, and before a single climber
-- can be affected.
do $$
declare
  v_missing text;
begin
  if to_regclass('public.boulder_beta') is null then
    raise exception 'boulder_beta does not exist. Apply 052_boulder_beta.sql and 090_caution_beta.sql in the Supabase dashboard, then re-run this file from the top.';
  end if;

  select string_agg(want.col, ', ' order by want.col)
    into v_missing
    from (values ('kind'::text), ('risk_move')) as want(col)
   where not exists (
     select 1 from pg_attribute a
      where a.attrelid = 'public.boulder_beta'::regclass
        and a.attname = want.col
        and a.attnum > 0
        and not a.attisdropped
   );

  if v_missing is not null then
    raise exception 'boulder_beta is missing %. Apply 090_caution_beta.sql in the Supabase dashboard, then re-run this file from the top.', v_missing;
  end if;
end $$;

create or replace function public.notify_beta_recipients()
returns trigger as $$
declare
  v_gym   text;
  v_color text;
  v_grade text;
  v_data  jsonb;
begin
  -- Live boulders only: the SQL mirror of isActiveBoulder
  -- (src/utils/gymProblems.ts), expiry day inclusive to match the "N days left"
  -- display. An archived boulder — which is what stripping sets (048), and the
  -- only other status 044 permits — or one past its expiry pings nobody: there
  -- is nothing left on the wall to try.
  select gp.gym, gp.color, gp.community_grade
    into v_gym, v_color, v_grade
    from public.gym_problems gp
   where gp.id = new.gym_problem_id
     and gp.status = 'active'
     and gp.expires_at >= current_date;

  if not found then
    return new;
  end if;

  v_data := jsonb_build_object(
    'gym', v_gym,
    'color', v_color,
    'community_grade', v_grade,
    -- The client needs the kind to pick its wording: a caution is a kind of
    -- beta here, but calling one "beta" to the reader misleads them.
    'kind', new.kind,
    'risk_move', new.risk_move,
    -- An inbox row renders one line, and this payload is copied into every
    -- recipient's row — so store a snippet, not the whole tip.
    'body', left(new.body, 140)
  );

  -- ── asked: an open help request ────────────────────────────────────────────
  -- Never collapsed. You asked, so every answer earns a ping, and it
  -- self-limits: 057's resolve_help_on_beta_worked closes the request the
  -- moment you mark a beta worked.
  insert into public.notifications (recipient_id, actor_id, type, entity_id, data)
  select h.user_id, new.user_id, 'beta_answered', new.gym_problem_id, v_data
    from public.gym_problem_help h
   where h.gym_problem_id = new.gym_problem_id
     and h.resolved_at is null
     and h.user_id <> new.user_id;

  -- ── projecting: claimed, not sent, and not already told as an asker ────────
  -- `distinct` because a climber may hold several problems rows for one boulder,
  -- one per session, and that must be one notification rather than one each.
  --
  -- Suppressed when this climber already holds an UNREAD beta_on_project for
  -- this boulder. Nothing rate-limits beta inserts, so without this one climber
  -- posting ten thin tips stacks ten rows on everyone on the boulder. Reading
  -- the row makes them eligible again, and nothing is lost: opening the boulder
  -- shows every beta, so a collapsed burst costs only a name in one sentence.
  --
  -- This is a check-then-write, which this schema avoids for beta_points. The
  -- difference is the stake: a lost race here writes one duplicate inbox row,
  -- not points, so a constraint is not worth carrying.
  --
  -- The same reasoning covers the two inserts being separate statements: under
  -- READ COMMITTED the disjointness of the two audiences is not read from one
  -- snapshot. If 057's resolve_help_on_beta_worked commits between them, a
  -- climber who both asked and is projecting gets both rows; if a help row is
  -- created between them, they get neither. Accepted knowingly rather than
  -- overlooked — the window is microseconds and either outcome costs one inbox
  -- row, where folding both statements into one CTE would spend the legibility
  -- of two separately named audiences to buy it.
  --
  -- Scoped to beta_on_project only, so an unread projector ping can never
  -- swallow the answer to an explicit ask.
  insert into public.notifications (recipient_id, actor_id, type, entity_id, data)
  select distinct p.user_id, new.user_id, 'beta_on_project', new.gym_problem_id, v_data
    from public.problems p
   where p.gym_problem_id = new.gym_problem_id
     and p.user_id <> new.user_id
     and not exists (
       select 1 from public.problems s
        where s.gym_problem_id = new.gym_problem_id
          and s.user_id = p.user_id
          and s.sent = true
     )
     and not exists (
       select 1 from public.gym_problem_help h
        where h.gym_problem_id = new.gym_problem_id
          and h.user_id = p.user_id
          and h.resolved_at is null
     )
     and not exists (
       select 1 from public.notifications n
        where n.recipient_id = p.user_id
          and n.type = 'beta_on_project'
          and n.entity_id = new.gym_problem_id
          and n.read_at is null
     );

  -- No `raise` anywhere above, deliberately: this trigger fires inside the
  -- climber's beta insert, and it must never be the reason their tip is
  -- rejected.
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists on_boulder_beta_notify_recipients on boulder_beta;
create trigger on_boulder_beta_notify_recipients
  after insert on boulder_beta
  for each row execute procedure public.notify_beta_recipients();

-- ── smoke ────────────────────────────────────────────────────────────────────
-- A plpgsql body is NOT validated at CREATE, so this migration can apply
-- perfectly clean and notify_beta_recipients() still raise on the first real
-- beta — a mistyped column, a table outside the search_path. A trigger function
-- cannot be called directly ("trigger functions can only be called as
-- triggers"), so plan and execute the same statements here against an id that
-- matches nothing.
--
-- Every reference the function makes has to be reached, not just the ones a
-- WHERE clause happens to mention: the insert TARGET LISTS (actor_id and data
-- appear nowhere else), the five boulder_beta columns read through NEW — plpgsql
-- resolves NEW.<field> at runtime, so a wrong field name would surface on a
-- climber's own beta insert and nowhere earlier — and left() and
-- jsonb_build_object(), which no predicate would ever call. An unexercised
-- reference is exactly the failure this block exists to catch.
--
-- Which makes this block coupled to the function above BY HAND: it re-states
-- those queries rather than calling it, so it only ever guards what it still
-- mirrors. Edit the body, edit this, or the coverage quietly drains away.
do $$
declare
  v_none  uuid := '00000000-0000-0000-0000-000000000000';
  v_gym   text;
  v_color text;
  v_grade text;
  v_kind  text;
  v_risk  text;
  v_data  jsonb;
begin
  select gp.gym, gp.color, gp.community_grade
    into v_gym, v_color, v_grade
    from public.gym_problems gp
   where gp.id = v_none and gp.status = 'active' and gp.expires_at >= current_date;

  -- The NEW fields. Fails loudly here, now, if 090 was skipped.
  select b.kind, b.risk_move into v_kind, v_risk
    from public.boulder_beta b where b.id = v_none;

  perform b.gym_problem_id, b.user_id, b.body
     from public.boulder_beta b where b.id = v_none;

  -- The payload builder runs for real. The subselect resolves
  -- boulder_beta.body; coalesce keeps left() from being handed a null, which a
  -- strict function short-circuits rather than calls.
  v_data := jsonb_build_object(
    'gym', v_gym,
    'color', v_color,
    'community_grade', v_grade,
    'kind', v_kind,
    'risk_move', v_risk,
    'body', left(coalesce((select b.body from public.boulder_beta b
                            where b.id = v_none), ''), 140)
  );

  -- Both inserts as the function writes them, target lists included, with
  -- `and false` closing each WHERE. A constant-false qualifier is folded away
  -- only AFTER parse analysis has resolved every column and the planner has
  -- built the plan, so the whole statement is checked while the source is
  -- unconditionally empty — zero rows, whatever these tables hold.
  insert into public.notifications (recipient_id, actor_id, type, entity_id, data)
  select h.user_id, v_none, 'beta_answered', v_none, v_data
    from public.gym_problem_help h
   where h.gym_problem_id = v_none
     and h.resolved_at is null
     and h.user_id <> v_none
     and false;

  insert into public.notifications (recipient_id, actor_id, type, entity_id, data)
  select distinct p.user_id, v_none, 'beta_on_project', v_none, v_data
    from public.problems p
   where p.gym_problem_id = v_none
     and p.user_id <> v_none
     and not exists (select 1 from public.problems s
                      where s.gym_problem_id = v_none and s.user_id = p.user_id and s.sent = true)
     and not exists (select 1 from public.gym_problem_help h
                      where h.gym_problem_id = v_none and h.user_id = p.user_id
                        and h.resolved_at is null)
     and not exists (select 1 from public.notifications n
                      where n.recipient_id = p.user_id and n.type = 'beta_on_project'
                        and n.entity_id = v_none and n.read_at is null)
     and false;

  raise notice 'notify_beta_recipients: guard select, all five NEW fields, left()/jsonb_build_object and both notification inserts (target lists included) planned and ran; 0 rows written';
end $$;
