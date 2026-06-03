import { Link } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import type { Session, Problem } from '../types'
import { INTENSITY_OPTIONS } from '../types'
import { sendRate } from '../utils/stats'

export function isPlannedSession(date: string): boolean {
  return date > new Date().toISOString().split('T')[0]
}

interface SessionCardProps {
  session: Session
  problems: Problem[]
}

export function SessionCard({ session, problems }: SessionCardProps) {
  const planned = isPlannedSession(session.date)

  return (
    <Link
      to={`/sessions/${session.id}`}
      className={`block border rounded-2xl p-4 active:bg-gray-50 transition-colors ${
        planned
          ? 'bg-sage-50 border-sage-200 border-dashed'
          : 'bg-white border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            {planned && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 bg-sage-200 text-sage-800 rounded-full">
                <CalendarClock size={11} />
                Planned
              </span>
            )}
          </div>
          <p className="font-semibold mt-0.5 text-sage-800">{session.location}</p>
          {session.goal && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">🎯 {session.goal}</p>
          )}
          <p className="text-sm text-gray-400 mt-0.5">{session.date}</p>
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
          {!planned && (
            <>
              <p className="text-sm font-medium text-gray-700">{problems.length} problem{problems.length !== 1 ? 's' : ''}</p>
              {problems.length > 0 && (
                <span className="text-xs bg-sage-700 text-white px-2 py-0.5 rounded-full font-medium inline-block">
                  {sendRate(problems)}% sent
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </Link>
  )
}
