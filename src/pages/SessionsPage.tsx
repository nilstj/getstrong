import { useSessions } from '../hooks/useSessions'
import { useAllProblems } from '../hooks/useProblems'
import { SessionCard } from '../components/SessionCard'
import { SessionCalendar } from '../components/SessionCalendar'

export function SessionsPage() {
  const { data: sessions = [], isLoading } = useSessions()
  const { data: problems = [] } = useAllProblems()

  if (isLoading) {
    return <div className="p-4 text-gray-500">Loading...</div>
  }

  return (
    <div className="p-4 space-y-3">
      <SessionCalendar sessions={sessions} problems={problems} />
      {sessions.map(session => (
        <SessionCard
          key={session.id}
          session={session}
          problems={problems.filter(p => p.session_id === session.id)}
        />
      ))}
      {sessions.length === 0 && (
        <p className="text-gray-400 text-sm text-center pt-12">
          No sessions yet. Tap Log to start your first session.
        </p>
      )}
    </div>
  )
}
