# Privacy notice, acceptance and age gate — telling people what the app does with their climbing

**Date:** 2026-08-24
**Status:** design, approved
**Follows:** `docs/superpowers/specs/2026-08-24-account-deletion-and-data-export-design.md`
(the notice can only promise rights that the export and deletion buttons already deliver)

## How this serves learning

Second time running, it doesn't directly — and the honest framing is the same as
last time. A climber shares beta on the assumption that they know where it goes.
Right now the app answers that question nowhere at all, while sending 90 days of
training history and stills of a climber's body to a US inference provider. The
notice is what makes the AI coach an offer rather than a surprise.

## Decisions taken — overrule on review

1. **One checkbox at signup, not three.** "I'm 13 or older, and I've read the
   privacy notice and house rules." None of these are consent in the GDPR sense
   — running a logbook is contract performance — so the granularity rules for
   consent don't apply, and three separate boxes would falsely imply you can
   decline one and still have an account.
2. **Consent is deliberately *not* the legal basis for the app.** If it were,
   withdrawal would oblige the app to stop storing the log, which is the one
   thing it cannot do and still be a logbook. Contract for the service,
   legitimate interests for keeping it working, and the AI features happen only
   when the climber presses the button — which is where the meaningful choice
   actually lives.
3. **Acceptance is versioned.** `policy_version` on the profile, compared
   against a constant in the client. Bumping the constant re-gates everyone,
   which is the only way a revision reaches people who signed up under the old
   text.
4. **Two recording paths, because Google exists.** Email signups pass acceptance
   through `signUp`'s metadata and the existing `handle_new_user` trigger copies
   it into the profile, so they are never asked twice. The "Continue with
   Google" button goes straight to Google with no checkbox to tick, and your
   friends' accounts predate all of this — so `PolicyGate` catches both.
5. **The notice asserts only what the code does.** Every claim in it was checked
   against the schema and the client: what is stored, who receives it, that
   there is no analytics or advertising, that the Supabase auth token is the
   only client-side storage. A template off the internet would be longer and
   wrong. The corollary is that **changing what the app sends out means changing
   this page**, and that obligation belongs in the notice's own text.
6. **Unfilled controller details fail loudly, not silently.** The controller's
   name, contact address and the Supabase region are facts only the owner has.
   Until they are filled in, `/privacy` renders an amber banner naming exactly
   what is missing, so an incomplete legal notice cannot quietly go live looking
   finished.

## What the notice must contain

Article 13 in the order a reader can follow, not the order the article lists:

| Section | The claim, as verified in the code |
|---|---|
| Who | Controller name and contact address (owner-supplied) |
| What you give us | Email and password (Supabase Auth), or a Google account |
| What you create | Sessions (date, gym, duration, intensity, notes), problems (grade, colour, attempts, notes, photos), beta (text, video links), grades and reviews, digs and reactions, crews and follows, session partners |
| What we derive | Beta points, grade score, badges, streaks, leaderboard positions |
| What others see | Any signed-in climber can see published boulders, beta, crews and leaderboards — **and, today, every problem you log, because migration 015 grants a blanket read.** Named as a known gap under active change rather than dressed up |
| Presence | `on_wall_at` / `on_wall_label` tell other climbers which gym you are at right now, while it is set |
| Who else touches it | Supabase (database, auth, photos), Vercel (hosting, the two AI endpoints), Groq (AI coach and video analysis, United States), Google (only if you sign in with Google) |
| The AI features | Nothing is sent until you press the button. The coach sends 90 days of sessions, grades and move tags. Video analysis sends up to five stills from the clip you choose. Groq is in the US. **Don't upload video of other climbers without asking them** |
| Tracking | None. No analytics, no advertising, no third-party fonts, no cookie banner because there is nothing to consent to. The Supabase auth token in local storage is what keeps you signed in |
| How long | Until you delete your account. Published beta and boulders stay, with your name removed |
| Your rights | Access and portability via *Download my data*; erasure via *Delete my account*; rectification by editing your profile; complaint to Datatilsynet |
| Age | 13 or older |
| Changes | Material changes re-prompt on next visit, via `policy_version` |

## House rules

Short and in the app's voice, covering the one thing that actually bites: photos
and video taken in a gym contain other people. Four rules — ask before you post
someone else's face, beta should be honest, digs stay friendly, don't publish a
boulder that isn't there. Not a terms of service; no liability or governing-law
drafting, which would need a lawyer and is premature for an app used by a dozen
friends.

## Data model

```sql
alter table profiles add column if not exists policy_version     text;
alter table profiles add column if not exists policy_accepted_at timestamptz;
alter table profiles add column if not exists age_confirmed_at    timestamptz;
```

The existing `users can update own profile` policy is enough to write these —
they are the climber's own record of their own acceptance, so a `security
definer` function would be ceremony.

## Routing

`/privacy` and `/house-rules` are **public**, outside `ProtectedRoute`: a notice
you must already have an account to read is not notice. `/accept-policy` is
inside `ProtectedRoute` but outside `PolicyGate`, mirroring how `/onboarding`
sits outside `OnboardingGate` — otherwise the gate redirects to a page the gate
is blocking.

```
ProtectedRoute
└── /accept-policy                (outside the gate, or it loops)
└── PolicyGate                    (policy_version !== POLICY_VERSION → /accept-policy)
    ├── /onboarding
    └── OnboardingGate
        └── the app
```

Acceptance precedes onboarding: the app should not ask which gyms you climb at
before telling you what it does with the answer.

## Out of scope

The `problems` blanket-read policy from migration 015 — the notice describes it
honestly, but narrowing it is its own piece of work with its own blast radius
across the feed and leaderboards. Also: the email-derived default username, the
presence opt-out, and a formal terms of service.
