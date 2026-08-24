import { Link } from 'react-router-dom'

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-base font-bold tracking-tight mb-2">{title}</h2>
      <p className="text-sm text-gray-700 leading-relaxed">{children}</p>
    </section>
  )
}

export function HouseRulesPage() {
  return (
    <div className="max-w-2xl mx-auto p-5 pb-16">
      <h1 className="text-2xl font-black tracking-tight mb-6">House rules</h1>

      <Rule title="Ask before you post someone else's face">
        Gym photos and videos catch other people, and they didn't sign up for this. If a
        climber other than you is recognisable in what you're about to publish, ask them
        first. Same goes for the clips you feed to video analysis.
      </Rule>

      <Rule title="Beta should be honest">
        Say what actually worked, including when it was ugly. A made-up sequence costs the
        next climber their skin and their session. If you're guessing, say you're guessing.
      </Rule>

      <Rule title="Digs stay friendly">
        Ribbing is part of the app on purpose. The line is simple: it should be funny to
        the person receiving it. If you wouldn't say it to them at the wall with their
        mates listening, don't post it.
      </Rule>

      <Rule title="Don't publish a boulder that isn't there">
        A shared boulder is a claim that something exists on a wall, at a grade, in a
        colour. Publishing one that's been stripped, or inventing one for the points, makes
        the whole gym's list worth less to everyone reading it.
      </Rule>

      <p className="text-xs text-gray-500 leading-relaxed mb-6">
        These are house rules, not a contract — the point is that a small app used by
        people who climb together doesn't need lawyers to know how to behave. If something
        here is being ignored, tell whoever runs your gym's list, or get in touch through
        the contact address in the privacy notice.
      </p>

      <div className="flex gap-4 text-sm">
        <Link to="/privacy" className="text-sage-700 font-medium">Privacy notice</Link>
        <Link to="/login" className="text-sage-700 font-medium">Back to sign in</Link>
      </div>
    </div>
  )
}
