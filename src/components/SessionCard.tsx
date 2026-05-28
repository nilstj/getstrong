import { Link } from 'react-router-dom'
import type { Session, Problem } from '../types'
import { sendRate } from '../utils/stats'

interface SessionCardProps {
  session: Session
  problems: Problem[]
}

export function SessionCard({ session, problems }: SessionCardProps) {
  return (
    <Link
      to={`/sessions/${session.id}`}
      className="block bg-white border rounded-xl p-4 hover:border-indigo-300 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-gray-900">{session.location}</p>
          <p className="text-sm text-gray-500">{session.date}</p>
          {session.duration_minutes && (
            <p className="text-sm text-gray-400">{session.duration_minutes} min</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-600">{problems.length} problem{problems.length !== 1 ? 's' : ''}</p>
          {problems.length > 0 && (
            <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
              {sendRate(problems)}% sent
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
