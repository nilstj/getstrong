import { Link } from 'react-router-dom'
import type { Session, Problem } from '../types'
import { INTENSITY_OPTIONS } from '../types'
import { sendRate } from '../utils/stats'

interface SessionCardProps {
  session: Session
  problems: Problem[]
}

export function SessionCard({ session, problems }: SessionCardProps) {
  return (
    <Link
      to={`/sessions/${session.id}`}
      className="block bg-white border border-gray-200 rounded-2xl p-4 active:bg-gray-50 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-sage-800">{session.location}</p>
          <p className="text-sm text-gray-500 mt-0.5">{session.date}</p>
          {session.duration_minutes && (
            <p className="text-sm text-gray-400">{session.duration_minutes} min</p>
          )}
        </div>
        <div className="text-right flex flex-col items-end gap-1">
          {session.intensity && (() => {
            const opt = INTENSITY_OPTIONS.find(o => o.value === session.intensity)
            return opt ? (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${opt.badge}`}>
                {opt.emoji} {opt.label}
              </span>
            ) : null
          })()}
          <p className="text-sm font-medium text-gray-700">{problems.length} problem{problems.length !== 1 ? 's' : ''}</p>
          {problems.length > 0 && (
            <span className="text-xs bg-sage-700 text-white px-2 py-0.5 rounded-full font-medium inline-block">
              {sendRate(problems)}% sent
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
