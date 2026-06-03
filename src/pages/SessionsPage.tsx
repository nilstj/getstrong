import { useSessions } from '../hooks/useSessions'
import { useAllProblems } from '../hooks/useProblems'
import { SessionCard, isPlannedSession } from '../components/SessionCard'
import { SessionCalendar } from '../components/SessionCalendar'

export function SessionsPage() {
  const { data: sessions = [], isLoading } = useSessions()
  const { data: problems = [] } = useAllProblems()

  if (isLoading) {
    return <div className="p-4 text-gray-500">Loading...</div>
  }

  const planned = sessions.filter(s => isPlannedSession(s.date))
    .sort((a, b) => a.date.localeCompare(b.date)) // ascending — soonest first
  const past = sessions.filter(s => !isPlannedSession(s.date))

  return (
    <div className="p-4 space-y-3">
      <SessionCalendar sessions={sessions} problems={problems} />

      {planned.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-sage-700 uppercase tracking-wider mb-2">Planned</h2>
          <div className="space-y-2">
            {planned.map(session => (
              <SessionCard
                key={session.id}
                session={session}
                problems={problems.filter(p => p.session_id === session.id)}
              />
            ))}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          {planned.length > 0 && (
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2 mt-2">Past</h2>
          )}
          <div className="space-y-2">
            {past.map(session => (
              <SessionCard
                key={session.id}
                session={session}
                problems={problems.filter(p => p.session_id === session.id)}
              />
            ))}
          </div>
        </div>
      )}

      {sessions.length === 0 && (
        <p className="text-gray-400 text-sm text-center pt-12">
          No sessions yet. Tap Log to start your first session.
        </p>
      )}
    </div>
  )
}
