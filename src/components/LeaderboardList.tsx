import { SetterBadge } from './SetterBadge'
import { topEntries } from '../utils/leaderboard'
import type { LeaderboardEntry } from '../types'

interface Props {
  entries: LeaderboardEntry[]
  currentUserId: string | undefined
  /** Ranks above this are cut. Tie-inclusive, so more rows than this can render. */
  limit?: number
  emptyLabel: string
}

export function LeaderboardList({ entries, currentUserId, limit = 10, emptyLabel }: Props) {
  if (entries.length === 0) {
    return (
      <p className="text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3.5 text-center">
        {emptyLabel}
      </p>
    )
  }

  const shown = topEntries(entries, limit)

  return (
    <>
      <div className="space-y-1">
        {shown.map(entry => (
          <div
            key={entry.user_id}
            className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm ${
              entry.user_id === currentUserId ? 'bg-sage-50 border border-sage-200' : 'bg-gray-50'
            }`}
          >
            <span className="w-5 text-center font-bold text-gray-400">{entry.rank}</span>
            <span className="flex flex-1 items-center gap-1 font-medium text-gray-800 min-w-0">
              <span className="truncate">{entry.username ?? 'Someone'}</span>
              <SetterBadge userId={entry.user_id} />
            </span>
            <span className="font-semibold text-sage-700">{entry.points}</span>
          </div>
        ))}
      </div>
      {shown.length < entries.length && (
        <p className="text-[11px] text-gray-400 text-right mt-1.5">
          top {shown.length} of {entries.length}
        </p>
      )}
    </>
  )
}
