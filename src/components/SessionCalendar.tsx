import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameMonth, isSameDay, isToday,
  addMonths, subMonths, addYears, subYears, getDay,
} from 'date-fns'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Calendar, CalendarClock } from 'lucide-react'
import type { Session, Problem } from '../types'
import { INTENSITY_OPTIONS } from '../types'

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

interface Props {
  sessions: Session[]
  problems: Problem[]
}

export function SessionCalendar({ sessions, problems }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [viewDate, setViewDate] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  // Index sessions by date string
  const sessionsByDate = useMemo(() => {
    const map = new Map<string, Session[]>()
    for (const s of sessions) {
      const key = s.date // 'YYYY-MM-DD'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return map
  }, [sessions])

  const monthStart = startOfMonth(viewDate)
  const monthEnd = endOfMonth(viewDate)
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })

  // Pad start: Monday-based (getDay gives 0=Sun, so shift)
  const startPad = (getDay(monthStart) + 6) % 7 // 0=Mon, 6=Sun

  const selectedSessions = selectedDate
    ? sessionsByDate.get(format(selectedDate, 'yyyy-MM-dd')) ?? []
    : []

  const currentMonthLabel = format(viewDate, 'MMMM yyyy')

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      {/* Header row — always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2 text-sage-800">
          <Calendar size={16} strokeWidth={1.75} />
          <span className="text-sm font-semibold">{currentMonthLabel}</span>
        </div>
        {expanded ? <ChevronUp size={16} strokeWidth={1.75} className="text-gray-400" /> : <ChevronDown size={16} strokeWidth={1.75} className="text-gray-400" />}
      </button>

      {expanded && (
        <>
          {/* Navigation */}
          <div className="flex items-center justify-between px-3 pb-2 border-t border-gray-100 pt-2">
            {/* Year nav */}
            <div className="flex items-center gap-0.5">
              <button onClick={() => setViewDate(d => subYears(d, 1))} className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100">
                <ChevronLeft size={14} strokeWidth={1.75} />
              </button>
              <span className="text-xs font-bold text-gray-600 w-10 text-center">{format(viewDate, 'yyyy')}</span>
              <button onClick={() => setViewDate(d => addYears(d, 1))} className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100">
                <ChevronRight size={14} strokeWidth={1.75} />
              </button>
            </div>

            {/* Month nav */}
            <div className="flex items-center gap-0.5">
              <button onClick={() => setViewDate(d => subMonths(d, 1))} className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100">
                <ChevronLeft size={14} strokeWidth={1.75} />
              </button>
              <span className="text-xs font-bold text-gray-600 w-20 text-center">{format(viewDate, 'MMMM')}</span>
              <button onClick={() => setViewDate(d => addMonths(d, 1))} className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100">
                <ChevronRight size={14} strokeWidth={1.75} />
              </button>
            </div>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 px-2 pb-1">
            {WEEKDAYS.map(d => (
              <div key={d} className="text-center text-[10px] font-semibold text-gray-400 uppercase py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 px-2 pb-3 gap-y-0.5">
            {/* Leading empty cells */}
            {Array.from({ length: startPad }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}

            {daysInMonth.map(day => {
              const key = format(day, 'yyyy-MM-dd')
              const daySessions = sessionsByDate.get(key) ?? []
              const hasSessions = daySessions.length > 0
              const isSelected = selectedDate ? isSameDay(day, selectedDate) : false
              const isCurrentMonth = isSameMonth(day, viewDate)
              const isCurrentDay = isToday(day)

              return (
                <button
                  key={key}
                  onClick={() => {
                    if (hasSessions) {
                      setSelectedDate(isSelected ? null : day)
                    }
                  }}
                  className={`relative flex flex-col items-center py-1 rounded-xl transition-colors ${
                    isSelected ? 'bg-sage-700' :
                    hasSessions ? 'hover:bg-sage-50 cursor-pointer' :
                    'cursor-default'
                  }`}
                >
                  <span className={`text-sm leading-none font-medium ${
                    isSelected ? 'text-white' :
                    isCurrentDay ? 'text-sage-700 font-bold' :
                    !isCurrentMonth ? 'text-gray-200' :
                    hasSessions ? 'text-gray-800' :
                    'text-gray-400'
                  }`}>
                    {format(day, 'd')}
                  </span>
                  {/* Session dots */}
                  <div className="flex gap-0.5 mt-0.5 h-1">
                    {daySessions.slice(0, 3).map((s, i) => {
                      const planned = s.date > new Date().toISOString().split('T')[0]
                      const intensity = INTENSITY_OPTIONS.find(o => o.value === s.intensity)
                      return planned ? (
                        <span key={i} className={`w-1 h-1 rounded-sm ${isSelected ? 'bg-white/70' : 'bg-sage-400'}`} />
                      ) : (
                        <span
                          key={i}
                          className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white/70' : intensity ? '' : 'bg-sage-500'}`}
                          style={intensity && !isSelected ? { backgroundColor: intensityDotColor(s.intensity) } : undefined}
                        />
                      )
                    })}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Selected day sessions */}
          {selectedDate && selectedSessions.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {format(selectedDate, 'EEEE, MMMM d')}
              </p>
              {selectedSessions.map(s => {
                const sessionProblems = problems.filter(p => p.session_id === s.id)
                const intensity = INTENSITY_OPTIONS.find(o => o.value === s.intensity)
                return (
                  <Link
                    key={s.id}
                    to={`/sessions/${s.id}`}
                    className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors ${
                      s.date > new Date().toISOString().split('T')[0]
                        ? 'bg-sage-50 border border-sage-200 border-dashed hover:bg-sage-100'
                        : 'bg-gray-50 hover:bg-sage-50'
                    }`}
                  >
                    <div>
                      {s.date > new Date().toISOString().split('T')[0] && (
                        <div className="flex items-center gap-1 mb-0.5">
                          <CalendarClock size={12} strokeWidth={1.75} className="text-sage-600" />
                          <span className="text-[10px] font-bold text-sage-700 uppercase tracking-wide">Planned</span>
                        </div>
                      )}
                      <p className="font-semibold text-sm text-gray-900">{s.location}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {s.duration_minutes && (
                          <span className="text-xs text-gray-400">{s.duration_minutes} min</span>
                        )}
                        {sessionProblems.length > 0 && (
                          <span className="text-xs text-gray-400">{sessionProblems.length} problem{sessionProblems.length !== 1 ? 's' : ''}</span>
                        )}
                        {intensity && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${intensity.badge}`}>
                            {intensity.emoji}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={16} strokeWidth={1.75} className="text-gray-300" />
                  </Link>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function intensityDotColor(intensity: string | null): string {
  switch (intensity) {
    case 'boring': return '#9ca3af'
    case 'sunshine': return '#facc15'
    case 'hard': return '#f97316'
    case 'really_hard': return '#ef4444'
    case 'to_the_max': return '#9333ea'
    default: return '#5a6649' // sage-700
  }
}
