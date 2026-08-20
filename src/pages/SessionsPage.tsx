import { Check } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { useSessions } from '../hooks/useSessions'
import { useAllProblems } from '../hooks/useProblems'
import { useMyGroupInvites, useAcceptSessionGroup, useDeclineSessionGroup } from '../hooks/useSessionGroup'
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
      <PendingSessionInvites />

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

/** `date` is a bare YYYY-MM-DD -- pin it to local midnight so the displayed day
 * cannot shift backwards in a negative-offset timezone, and fall back to the
 * raw string if it somehow fails to parse. */
function inviteDateLabel(dateStr: string): string {
  try { return format(new Date(`${dateStr}T00:00:00`), 'EEE d MMM') }
  catch { return dateStr }
}

/** Sessions someone added you to, waiting for you to say you were there. */
function PendingSessionInvites() {
  const { data: invites = [] } = useMyGroupInvites()
  const accept = useAcceptSessionGroup()
  const decline = useDeclineSessionGroup()
  const navigate = useNavigate()

  if (invites.length === 0) return null

  return (
    <div className="space-y-2">
      {invites.map(({ group }) => (
        <div key={group.id} className="bg-white border border-sage-200 rounded-2xl p-3.5">
          <p className="text-sm font-bold leading-snug">You were added to a session</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Accept if you were there · {inviteDateLabel(group.date)} · {group.gym}
          </p>
          <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
            The session's boulder list is already there. Nothing lands in your log until you log it.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => accept.mutate({ groupId: group.id }, {
                onSuccess: sessionId => { toast.success('Added to your log'); navigate(`/sessions/${sessionId}`) },
                onError: (e: unknown) => {
                  const msg = e instanceof Error ? e.message : ''
                  toast.error(msg.includes('ALREADY_LOGGED')
                    ? 'You already logged a session that day at that gym'
                    : 'Could not accept')
                },
              })}
              disabled={accept.isPending}
              className="flex-1 min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-sage-700 text-white text-[15px] font-semibold disabled:opacity-50"
            >
              <Check size={16} strokeWidth={2.5} />
              Accept
            </button>
            <button
              type="button"
              onClick={() => decline.mutate({ groupId: group.id }, {
                onSuccess: () => toast.success('Got it, left off the log'),
                onError: () => toast.error('Failed'),
              })}
              className="min-h-11 px-4 rounded-xl border border-gray-200 bg-white text-gray-500 text-[15px] font-semibold"
            >
              Wasn't me
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
