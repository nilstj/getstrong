# Caution beta — "watch out" as a kind of beta

**Date:** 2026-08-25
**Status:** design, approved for planning

## How this serves learning

A climber leaves knowing which move on this boulder hurts people and what to do
instead — which is beta, and better beta than the send sequence.

## The question this answers

Should a climber be able to flag a boulder as hazardous, or tag that they (or
someone they know) got injured on it?

Yes — but not as a warning label. Three readings were considered:

1. **A hazard flag on the boulder** — a `gym_problem_hazard` table mirroring
   `gym_problem_help`. Rejected as the primary shape: a badge teaches nothing,
   asserts a safety function the app can't deliver, and has no owner obliged to
   act on it. "Careful on this one" is not movement knowledge.
2. **An injury log on the climber** — injuries as records on a profile or
   session. Rejected: special-category health data, a solo surface with no path
   for knowledge to leave it, and the same shape as the exercise logging and
   strength tests already cut from v1.
3. **A caution as a kind of beta** — chosen. "The high heel-hook at the top is
   where knees go; take it as a toe-hook and rock over instead" teaches, moves
   between climbers, and exists in no other logbook.

**"Someone I know got injured" is deliberately not built.** Recording that a
third party hurt themselves is health data about a person who never consented.
Even first-person injury detail would make this special-category data under GDPR
Art. 9 — a far heavier bar than anything in the schema today, in an app that
just shipped erasure and export (087/088). The design sidesteps it entirely by
making **the move the subject, never the injury**: no body parts, no severity,
no diagnosis. Corroboration count carries the weight that a severity scale
would, and asks nobody for their medical history.

## Data model — migration 090

Two columns on the existing `boulder_beta` table. No new table.

```sql
alter table boulder_beta
  add column if not exists kind text not null default 'beta',
  add column if not exists risk_move text;

alter table boulder_beta drop constraint if exists boulder_beta_kind_check;
alter table boulder_beta add constraint boulder_beta_kind_check
  check (kind in ('beta', 'caution'));

-- A caution needs a move AND words about it. A plain beta carries no move.
alter table boulder_beta drop constraint if exists boulder_beta_caution_shape;
alter table boulder_beta add constraint boulder_beta_caution_shape check (
  (kind = 'beta' and risk_move is null)
  or (kind = 'caution'
      and risk_move is not null and btrim(risk_move) <> ''
      and body is not null and btrim(body) <> '')
);

create index if not exists boulder_beta_caution_idx
  on boulder_beta (gym_problem_id) where kind = 'caution';
```

`kind` follows the precedent already in this table: `body_type text check
(body_type in ('tall','short','neutral'))` from migration 058. The partial index
mirrors `gym_problem_help_open_idx` from 057.

Existing rows take `kind = 'beta'` with `risk_move` null, so both constraints
validate against live data without a backfill. The pre-existing
`boulder_beta_nonempty` check (body or video) still applies; a caution satisfies
it through `body`.

**What living on `boulder_beta` buys for free:** the existing own-writes RLS
policy, the `on delete cascade` to `gym_problems` — so a caution dies when its
boulder is stripped or expires, and there is no retirement logic to build or
stale-warning problem to manage — and coverage by 087/088's erasure work.

## Points

The economy is *paid to post, free to confirm*. Nothing pays anyone to inflate
a hazard count, because the corroboration count is what drives the badge.

| Action | Award | Change |
| --- | --- | --- |
| Post a caution | 5 `beta_posted`, first beta per (user, boulder) | none — `award_beta_posted` (074 §4a) untouched |
| Someone taps "me too" | nothing, either side | `mark_beta_worked` gains one guard |
| Reply to a caution | 1 `engagement`, once per (user, beta) | none — `award_beta_comment_engagement` (074 §4b) untouched |

`award_beta_posted` needs no change: a caution *is* a `boulder_beta` insert, so
it pays 5 when it's the author's first on that boulder and nothing afterwards,
under the `beta_points_beta_posted_uniq` index already in place. **No new award
path and no new farming surface** — and no new `reason` value, so
`beta_points_reason_check` (last set in 076) is untouched.

`mark_beta_worked` is reproduced from 074 §4c with a single addition: after the
`boulder_beta_worked` insert, return early when the beta is a caution, skipping
both the author's 5 `helpful` and the marker's 1 `engagement`. The beta's `kind`
comes back on the same `select` that already fetches `user_id` and
`gym_problem_id`.

Replies keep paying because a reply is a real contribution — it's how a setter
says "re-set it, thanks" — and the farming surface there is identical to today's.

## Removal

There is **no beta deletion path in the app today** — `useBoulderBeta.ts`
deletes comments and reactions, never a beta. This adds the first two.

### Admin removal

```sql
create or replace function public.admin_delete_beta(p_beta_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Only admins can remove beta';
  end if;
  delete from boulder_beta where id = p_beta_id;
end;
$$;

revoke all on function public.admin_delete_beta(uuid) from public, anon;
grant execute on function public.admin_delete_beta(uuid) to authenticated;
```

**An RPC rather than an admin RLS DELETE policy, deliberately.** A client delete
that no policy permits removes zero rows and returns *no error* — the admin
would see a success toast and watch the beta stay on screen. That silent-no-op
is a known failure mode on this schema. The RPC raises instead.

**Scope is any beta, not only cautions.** An abusive tip needs removing just as
much, and the function is identical either way.

### Author retraction

The author deleting their own beta needs no migration — `users manage own
boulder_beta` is `for all`, so RLS has always permitted it; only the UI was
missing. A climber who posts a caution in the heat of the moment must be able to
take it back, and a beta that can only be erased by deleting your whole account
sits badly beside 088.

### What removal takes with it

`boulder_beta_worked` (053), `boulder_beta_comments` and
`boulder_beta_reactions` (058) all cascade on `beta_id`, and
`boulder_beta_comment_reactions` cascades through the comment — so me-toos,
replies and reactions go with the beta, nothing raises a foreign-key violation,
and the `⚠️ Watch out ×N` badge drops on its own. Points already earned stay: `beta_points.beta_id` is `on delete set
null` (074 §2), consistent with unmark never clawing back. Removal cannot be
used to re-earn the 5, because the `beta_posted` guard keys on
`(user_id, gym_problem_id)`, which survives the nulled `beta_id`.

**Not built:** no moderation log, and no notification to the author. A removal
is silent and unrecorded.

## Setter fan-out

`gym_problems.setter` is a community-editable *text name* (056), not a user
reference, so there is no single user to notify. The targeting rule uses
existing data: every profile with `is_setter = true` whose `default_gyms`
contains the boulder's gym.

```sql
create or replace function public.notify_setters_of_caution()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_gym    text;
  v_setter uuid;
begin
  if new.kind <> 'caution' then
    return new;
  end if;

  select gym into v_gym from gym_problems where id = new.gym_problem_id;
  if v_gym is null then
    return new;
  end if;

  -- Gym strings are matched case-insensitively everywhere else in this schema.
  for v_setter in
    select p.id from profiles p
     where p.is_setter = true
       and exists (select 1 from unnest(p.default_gyms) g where lower(g) = lower(v_gym))
  loop
    perform public.create_notification(
      v_setter, new.user_id, 'boulder_caution', new.gym_problem_id,
      jsonb_build_object('risk_move', new.risk_move, 'gym', v_gym)
    );
  end loop;
  return new;
end;
$$;
```

`create_notification` already no-ops when recipient equals actor, so a setter
flagging their own boulder doesn't ping themselves. `notifications.type` is
unconstrained text (037), so the new `boulder_caution` type needs no migration —
only client rendering.

## Client changes

**New pure util — `src/utils/riskMoves.ts`**

The vocabulary, in the shape of `holdColors.ts`:

| id | label |
| --- | --- |
| `heel_hook` | Heel-hook / drop-knee |
| `big_span` | Big span or gaston |
| `crimp` | Crimp or pocket |
| `slap` | Slap or dyno |
| `top_out` | Top-out |
| `swing` | The swing |
| `landing` | The landing |

`riskMoveLabel(id)` renders a label, falling back to the raw stored value for
anything unknown. This stores a stable id where `HOLD_COLORS` stores the display
name — a deliberate deviation, because these labels are phrases likely to be
reworded, and rewording one must not fork the data. The fallback preserves the
property that comment cares about: an unrecognised stored value still renders.

**Extended pure util — `src/utils/betaSort.ts`**

Cautions pin above tips; within each group the existing ranking (most "worked
for me", then most recent) is unchanged. This file already has tests.

**Boulder page — `src/pages/CrewPage.tsx`**

- Composer gains a `⚠️ Watch out` toggle. On, it reveals the move chips and
  swaps the placeholder to "What should people do instead?". Submit stays
  disabled until both a chip and body text exist — the client half of
  `boulder_beta_caution_shape`.
- Badge row (currently rendering `🆘 Help wanted`) gains `⚠️ Watch out ×N`,
  where **N is the number of distinct cautions on the boulder**, not the sum of
  their me-toos. Corroboration strength belongs to each caution and is shown on
  its own card; the badge answers "how many different things bite here".

**`src/components/BetaCard.tsx`**

- Amber treatment for `kind === 'caution'`, with the move chip rendered from
  `riskMoveLabel`.
- "worked for me" reads **"me too"** with its count on a caution.
- Trash affordance behind a confirm, on two paths: the author deletes through a
  plain `.delete().eq('id', …)` permitted by the existing RLS policy, and an
  admin goes through `admin_delete_beta`. `CrewPage` already reads `is_admin` for
  the setter's-intention gate.

**`src/hooks/useBoulderBeta.ts`** — the insert carries `kind` and `risk_move`;
two new mutations for the deletions, invalidating the beta and boulder keys.

**Notification rendering** — `'boulder_caution'` added to the `NotificationType`
union in `src/types/index.ts` and to the label and route switches in
`src/components/AppBar.tsx`, routing to `/gym-problems/:id`.

## Verification

Per the project's deliberate constraint, only pure utils are unit-tested:
`riskMoves` and the extended `betaSort` get vitest coverage, TDD'd. Composer,
card, badge, deletions and notification rendering are verified by `npm run
build` plus a manual pass on a phone.

Migration 090 ends with a smoke block, because a plpgsql body that never runs is
a body nobody has checked — it can be created perfectly clean and still raise on
first call:

```sql
do $$
declare v_uid uuid; v_gp uuid;
begin
  select id into v_uid from auth.users limit 1;
  select id into v_gp from gym_problems limit 1;
  if v_uid is null or v_gp is null then
    raise notice '090 smoke test skipped: no users or boulders';
    return;
  end if;
  begin
    insert into boulder_beta (gym_problem_id, user_id, body, kind, risk_move)
    values (v_gp, v_uid, 'smoke test', 'caution', 'heel_hook');
    raise exception 'rollback smoke test';
  exception when others then
    -- The BEGIN block is an implicit savepoint, so the insert and every
    -- notification its trigger wrote are undone here. No residue.
    if sqlerrm <> 'rollback smoke test' then raise; end if;
  end;
  raise notice '090 ok: caution insert and setter fan-out ran clean';
end $$;
```

The manual pass must cover: posting a caution, confirming no points row appears
for a "me too" on it, a setter at that gym receiving the notification, author
retraction, and admin removal.

## Release gate

Migration 090 is applied by hand in the Supabase dashboard **before** the client
that needs it is deployed.

**Dependency:** 090 reproduces 074's `mark_beta_worked`, and 074 also introduced
the `beta_posted` and `engagement` reasons that this feature's points rely on.
**074 must be applied before 090.** Confirm the state of the 074→078 chain in the
dashboard before applying — it may still be outstanding.

## Out of scope

- Any hazard flag on the boulder itself, and any gym-level hazard list.
- A corner marker on the home strip's `StoryRing` tiles. Those tiles already
  carry help-wanted, video and variation markers, and the strip is one of the
  two hero screens to defend. A caution reaches whoever opens the boulder, which
  is whoever is about to climb it.
- Body parts, severity, diagnosis, and any record of a third party's injury.
- Moderation log, and notifying an author whose beta was removed.
- Aggregating cautions across a gym ("the knee-risk moves at Boulders Oslo").
  The `risk_move` chip is stored structurally so this stays possible later; it
  isn't built now.
