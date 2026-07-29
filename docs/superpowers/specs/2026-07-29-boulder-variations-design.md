# Boulder Variations Design

**Date:** 2026-07-29
**Status:** Approved

## Summary

Let a challenge optionally anchor to a shared boulder. An anchored challenge is a
**variation**: the same wall with altered rules — no heel hook, eliminate the
crimp, static only, link into the red. It lives on the boulder page, anyone can
try it, and clearing it with a video adds another take on the movement to the
boulder that already holds the beta.

**How this serves learning:** a variation is beta with a constraint. "Send it
without the crimp" teaches more about the movement than the original send does,
and the clears accumulate as videos on the boulder where the next climber is
already looking.

## Decisions (from brainstorming)

- **Centre of gravity is the boulder page**, not crews. A variation works for a
  climber with no crew; crew gauntlets pointing at a variation are a later layer,
  not a prerequisite.
- **One table, not two.** `challenges` gains a nullable `gym_problem_id`.
  Unanchored challenges keep behaving exactly as they do today.
- **"Variation" in UI copy, `challenges` in the schema.** A *challenge* is the
  portable dare at `/challenges`; a *variation* is a constraint on one specific
  shared boulder. Keeping the words apart matters because CLAUDE.md treats
  vocabulary drift as a copy correctness bug.
- **You must have sent the boulder to set a variation on it.** No impossible
  trolling — the setter has proved it goes. Enforced as an RLS check, not a
  client check.
- **Clearing is a self-reported tick; only a video-backed clear pays points.**
  Demanding video to participate would cut participation hard in a gym. Guarding
  the *reward* rather than the *action* keeps the ledger honest without making
  the feature precious.
- **Setting a variation pays nothing on its own.** It pays when someone else
  clears it — an award that needs a second party can't be self-minted.

## Scope

**In scope:**
- `challenges.gym_problem_id` (nullable) + the sent-it RLS guard.
- The missing UPDATE policy on `challenge_attempts` — a latent bug that silently
  breaks editing an attempt today, and that this feature's award trigger depends
  on. See the data model section.
- Two new `beta_points` reasons: `variation_taught`, `variation_cleared`, both
  guarded by unique partial indexes.
- A compact **Variations** block on the boulder page, with a set-a-variation
  sheet and a per-variation detail sheet.
- One notification kind: someone cleared your variation.
- A boulder chip on anchored challenges in the `/challenges` tab.
- A `Variation` marker after the proposed grade in the Latest Gym Problems strip.

**Out of scope (YAGNI / later):**
- Crew gauntlets that point at a variation (the natural next slice).
- Visually circling the eliminated holds. The OpenCV viewer from the approved
  2026-06-21 hold-highlighting spec never shipped — only a `hold_color` text
  field did (migrations 067–069) — so this is real new work, not a reuse.
- Leaderboard or Analysis changes beyond the two new ledger reasons.
- A `/challenges/:id` route. Detail is a `BottomSheet`, matching the app's modal
  pattern and phone-first constraint.
- Marking variations on the `/gym-problems` list page. `BoulderSummary` will
  carry the flag, so it's a one-line addition later if wanted.

## Design

### Data model — migration 076

Additive. Nothing is backfilled.

**`challenges.gym_problem_id`**

```sql
alter table challenges
  add column if not exists gym_problem_id uuid
    references gym_problems(id) on delete set null;
create index if not exists challenges_gym_problem_idx
  on challenges (gym_problem_id) where gym_problem_id is not null;
```

`on delete set null` rather than cascade: if a boulder is deleted (migration
070), the variation survives as a plain portable challenge and keeps its attempt
videos. The movement library outlives the set.

**The sent-it guard, as a database constraint.** Replace the insert policy from
migration 003 so an anchored challenge requires a sent go on that boulder:

```sql
drop policy if exists "authenticated users can create challenges" on challenges;
create policy "authenticated users can create challenges"
  on challenges for insert with check (
    auth.uid() = creator_id
    and (
      gym_problem_id is null
      or exists (
        select 1 from problems p
         where p.user_id = auth.uid()
           and p.gym_problem_id = challenges.gym_problem_id
           and p.sent
      )
    )
  );
```

CLAUDE.md prefers a database constraint over a check-then-write, and this keeps
the direct client insert in `useCreateChallenge` ([useChallenges.ts:25](../../../src/hooks/useChallenges.ts))
working unchanged.

**A missing UPDATE policy on `challenge_attempts`, which this feature depends
on.** The migration files give that table `select`, `insert` and `delete`
policies only (migration 003) — no `update`. With RLS enabled that means
`useUpdateChallengeAttempt` ([useChallenges.ts:97](../../../src/hooks/useChallenges.ts))
matches zero rows and fails silently, and the `after update of video_url` trigger
in migration 038 can never fire. Both the flip-to-completed path and the
video-arrives-later path depend on updates working, so migration 076 adds:

```sql
create policy "users update own challenge attempts"
  on challenge_attempts for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Migrations are applied by hand, so the live database may already have a policy
that no migration file records. **Verify in the Supabase dashboard before
applying**, and drop this statement if it's already there.

**`beta_points.challenge_id`** alongside the existing `beta_id`, so the two new
awards can be deduped per variation:

```sql
alter table beta_points
  add column if not exists challenge_id uuid references challenges(id) on delete set null;
alter table beta_points drop constraint if exists beta_points_reason_check;
alter table beta_points add constraint beta_points_reason_check
  check (reason in ('bounty_won', 'helpful', 'first_logger', 'beta_posted',
                    'engagement', 'variation_taught', 'variation_cleared'));
create unique index if not exists beta_points_variation_taught_uniq
  on beta_points (user_id, gym_problem_id) where reason = 'variation_taught';
create unique index if not exists beta_points_variation_cleared_uniq
  on beta_points (user_id, challenge_id) where reason = 'variation_cleared';
```

### Points

| award | pts | earned by | when | guard |
|---|---|---|---|---|
| `variation_taught` | 5 | the **setter** | first time **someone else** clears their variation with a video | unique `(user_id, gym_problem_id)` — 5 max per boulder, same cap and shape as `beta_posted_uniq` in migration 074 |
| `variation_cleared` | 1 | the **clearer** | clearing a variation with a video | unique `(user_id, challenge_id)` |

The values sit on the existing scale from migration 074: 5 means *you taught
someone something*, 1 means *you took part*.

Both awards land in **one `SECURITY DEFINER` trigger** on `challenge_attempts`,
firing `after insert or update`. Update matters as much as insert: an attempt can
be created incomplete and flipped later via `useUpdateChallengeAttempt`, and the
video can arrive after the tick.

Trigger conditions, all required:

- `new.completed` is true and `new.video_url` is not null — an unevidenced tick
  is recorded and displayed, but pays nothing.
- the challenge has a non-null `gym_problem_id` — portable challenges pay
  nothing, as today.
- `gym` is read from `gym_problems` (the `challenges` table has no gym column),
  exactly as `award_beta_posted` does.
- the setter award additionally requires `attempt.user_id <> challenge.creator_id`.

`beta_points` has no insert policy, so this must be a trigger or an RPC, and a
trigger keeps the client write path untouched. Both inserts use
`on conflict do nothing` so a re-tick, a re-upload, or an unmark/remark cycle
can't mint a second award. Nothing is ever clawed back — the ledger stays
append-only.

### Boulder page

A compact **Variations** block in [CrewPage.tsx](../../../src/pages/CrewPage.tsx),
sitting with the beta actions rather than as a new full-width section. That page
is already ~730 lines and is one of the app's two hero screens, so the block
earns its place by being small:

- **One row per variation:** the constraint, who set it, cleared-count with
  overlapping avatars. Absent variations, the block renders as the single
  set-a-variation affordance and nothing more.
- **Tap a row → `BottomSheet`:** the demo video if there is one, the constraint
  in full, and every clear with its video. This is where the movement library
  is actually read.
- **＋ Set a variation** shows only if you've sent this boulder, mirroring the
  RLS guard so the button is never a trap. Its sheet takes a constraint line
  (the challenge title), optional detail, an optional demo video, and the
  existing challenge tags. It always writes `is_public = true` and hides the
  visibility toggle — a variation on a shared boulder is inherently public.
- **Archived boulders render the block read-only.** Effective status is already
  derived from `expires_at` at read time, so no job is involved.

**Notification.** One new kind, `variation_cleared` — *"Anna cleared your
no-heel-hook on the blue overhang"* — to the setter, plus its emoji in the map in
[AppBar.tsx:106](../../../src/components/AppBar.tsx). This is the moment
knowledge moved, and it's what brings the setter back to look at the video.

### `/challenges` tab

An anchored challenge shows a boulder chip — `ProblemColorIcons` from
[Chip.tsx](../../../src/components/Chip.tsx) plus the gym — linking to
`/gym-problems/:id`. Nothing else on that page changes.

### Latest Gym Problems strip

A boulder that has at least one variation reads **`6A · Variation`** under its
ring, after the proposed grade.

- `StoryRing`'s caption is already `line-clamp-2 max-w-[64px]`
  ([StoryRing.tsx:65](../../../src/components/StoryRing.tsx)), so the longer
  label wraps to a second line and needs no layout change. Deliberately *not* a
  third badge on the circle: the ring already carries help-wanted, video and
  colour, and a code comment there records that it got too busy once already.
- `useDiscoverBoulders` gains `hasVariation` on `BoulderSummary` from one batched
  query — `challenges` where `gym_problem_id in ids` — collected into a `Set`,
  the same shape as the existing `helpWantedIds`. It uses the same **non-fatal**
  pattern as the help query (destructure `data`, don't throw on `error`) so that
  before migration 076 is applied the home page degrades to no variation markers
  instead of breaking.
- The label is composed by a pure util, `boulderStripLabel(grade, hasVariation)`
  in `src/utils/`, unit-tested: grade only, `grade · Variation`, `Variation`
  alone when the grade is null, and `''` when neither applies.

## Testing & verification

- **Unit (vitest):** `boulderStripLabel` — the four cases above. It's the only
  logic here worth extracting, per the pure-utils-only constraint.
- **Build:** `npm run build`. Watch `noUnusedLocals`.
- **Lint:** measure the baseline first; this work adds zero new problems.
- **Manual pass:** set a variation on a boulder you've sent; confirm the button
  is absent on one you haven't; tick a clear without a video and confirm no
  points; add the video afterwards and confirm the update *persists* (the policy
  fix) and that it then pays 1 point to the clearer and 5 to the setter; re-tick
  and confirm no second award; clear your own variation and confirm the setter
  award doesn't fire; check the strip label and the setter's notification.

## Release gate

**Migration 076 must be applied by hand in the Supabase dashboard before the
client that needs it is deployed.** Pushing `main` auto-deploys, so a push is a
release. The strip query degrades gracefully if the migration is late, but
setting a variation will fail until the column and policy exist.

## Follow-on slices (not this spec)

1. **Crew gauntlet** — `battle_type = 'challenge'` on `crew_battles` pointing at
   a variation, scored by video-backed clears per member. This is strictly better
   than the existing `boulder` all-clear type on every axis in CLAUDE.md: it adds
   a movement constraint and a demo video to the same mechanic. Keep the old type
   working; stop leading with it.
2. **Variation markers on the `/gym-problems` list page**, once `hasVariation`
   exists.
