import { Link } from 'react-router-dom'
import { CONTROLLER, UNSET, unresolvedControllerFacts, POLICY_VERSION } from '../utils/policy'

// Rendered instead of the sentinel, so a missing fact reads as an obvious gap
// rather than as "__UNSET__" in the middle of a sentence.
const shown = (value: string, label: string) =>
  !value.trim() || value === UNSET ? `[${label}]` : value

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-base font-bold tracking-tight mb-2">{title}</h2>
      <div className="text-sm text-gray-700 space-y-2 leading-relaxed">{children}</div>
    </section>
  )
}

export function PrivacyPage() {
  const missing = unresolvedControllerFacts(CONTROLLER)

  return (
    <div className="max-w-2xl mx-auto p-5 pb-16">
      <h1 className="text-2xl font-black tracking-tight mb-1">What MoreSends does with your climbing</h1>
      <p className="text-xs text-gray-400 mb-6">Version {POLICY_VERSION}</p>

      {missing.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-bold">⚠ Draft.</span> Still to fill in: {missing.join(', ')}.
          Until then this page is not a complete notice.
        </div>
      )}

      <Section title="Who we are">
        <p>
          MoreSends is run by {shown(CONTROLLER.name, 'controller name')}, as a private
          individual. For anything about your data — a copy of it, a correction, a
          deletion, or a complaint — write to{' '}
          <span className="font-medium">{shown(CONTROLLER.email, 'contact address')}</span>.
        </p>
      </Section>

      <Section title="What you give us">
        <p>
          An email address and a password, or a Google account if you use the Google
          button. Passwords are handled by Supabase Auth and we never see them. You
          choose a username and can upload a profile photo; the username starts as the
          part of your email before the @, which you can change on your profile.
        </p>
      </Section>

      <Section title="What you create">
        <p>
          The log itself: sessions with a date, gym, duration, how hard it felt and any
          notes; the problems in them with grade, colour, attempts, whether you sent, and
          notes; photos you attach; and the boulders and beta you publish, including
          links to videos you host elsewhere.
        </p>
        <p>
          Around that: grades and reviews you give, digs and reactions, the climbers you
          follow, the crews you join, the partners you tag in a session, and the requests
          you send and receive.
        </p>
      </Section>

      <Section title="What we work out from it">
        <p>
          Beta points, grade score, badges, streaks and where you land on the
          leaderboards. All of it is arithmetic on the rows above — there is no profiling
          beyond that, and nothing decides anything about you automatically.
        </p>
      </Section>

      <Section title="What other climbers can see">
        <p>
          Boulders and beta you publish, your crews, and your leaderboard positions are
          meant to be seen — that is the point of the app.
        </p>
        <p>
          <span className="font-semibold">Being straight with you about one thing:</span>{' '}
          right now every problem you log, including its notes, is readable by any
          signed-in climber, even though the app describes your log as private. That is a
          gap in how the database permissions were set up, not a deliberate feature, and
          it is being changed. Until it is, don't put anything in a problem note you
          wouldn't want another climber reading.
        </p>
      </Section>

      <Section title="Where you are right now">
        <p>
          If you mark yourself on the wall, other signed-in climbers can see which gym
          you are at and for how long that mark stands. Your default gyms are visible the
          same way. Nothing uses your device location — this is only what you type in.
        </p>
      </Section>

      <Section title="Who else touches it">
        <p>
          <span className="font-medium">Supabase</span> stores the database, runs sign-in
          and holds your photos (region: {shown(CONTROLLER.supabaseRegion, 'Supabase region')}).{' '}
          <span className="font-medium">Vercel</span> hosts the app and the two AI
          endpoints. <span className="font-medium">Groq</span> runs the AI features
          described below, in the United States.{' '}
          <span className="font-medium">Google</span> is involved only if you choose to
          sign in with Google.
        </p>
        <p>
          Photos in the avatar and boulder-photo buckets are served from public URLs:
          anyone holding the link can open the file without signing in.
        </p>
      </Section>

      <Section title="The AI coach and video analysis">
        <p>
          Nothing is sent anywhere until you press the button. When you ask the coach for
          a report, it sends the last 90 days of your sessions — dates, gyms, grades, how
          hard sessions felt and your move tags — to Groq. When you use video analysis, it
          sends up to five still frames from the clip you picked.
        </p>
        <p>
          Groq is in the United States, so that is a transfer out of the EEA. Neither the
          frames nor the report are stored by us, and we don't send your name or email
          with them.
        </p>
        <p className="font-medium">
          Please don't upload video of other climbers without asking them first. Frames
          from a busy gym can contain people who never agreed to any of this.
        </p>
      </Section>

      <Section title="What we don't do">
        <p>
          There is no analytics, no advertising, no tracking pixels, no third-party fonts
          and nothing is sold or shared for marketing. There is no cookie banner because
          there is nothing to consent to: the only thing kept in your browser is the
          Supabase sign-in token that keeps you logged in.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          Until you delete your account. There is no automatic clear-out, so your log
          stays as long as you want it.
        </p>
        <p>
          When you do delete, beta, boulders and variations you published stay on the wall
          for the climbers using them, with your name taken off. Everything that is only
          yours — sessions, problems, photos, points, follows — goes.
        </p>
      </Section>

      <Section title="What you can do about it">
        <p>
          On your profile: <span className="font-medium">Download my data</span> gives you
          a JSON file of everything stored about you, and{' '}
          <span className="font-medium">Delete my account</span> does what it says,
          immediately. You can correct anything by editing your profile or the entry
          itself.
        </p>
        <p>
          We rely on our agreement with you to run the app, not on your consent, which
          means these rights don't depend on you having agreed to anything. If you think
          we are handling your data badly, tell us — and if that goes nowhere, you can
          complain to Datatilsynet, the Norwegian Data Protection Authority.
        </p>
      </Section>

      <Section title="Age">
        <p>You need to be 13 or older to have an account.</p>
      </Section>

      <Section title="When this changes">
        <p>
          If anything here changes materially, you will be asked to read it again the next
          time you open the app. This is version {POLICY_VERSION}.
        </p>
      </Section>

      <div className="flex gap-4 text-sm pt-2">
        <Link to="/house-rules" className="text-sage-700 font-medium">House rules</Link>
        <Link to="/login" className="text-sage-700 font-medium">Back to sign in</Link>
      </div>
    </div>
  )
}
