import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import { useDiscoverBoulders } from '../hooks/useDiscoverBoulders'
import { daysUntil } from '../utils/gymProblems'
import type { BoulderSummary } from '../types'

function BoulderRow({ b }: { b: BoulderSummary }) {
  const left = daysUntil(b.expires_at, new Date())
  return (
    <Link
      to={`/gym-problems/${b.id}`}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{b.title}</p>
        <p className="text-xs text-gray-400 truncate">{b.gym}</p>
      </div>
      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
        <Users size={12} strokeWidth={2} /> {b.crewCount}
      </span>
      <span className={`text-xs ${left >= 0 ? 'text-sage-700' : 'text-gray-400'}`}>
        {left >= 0 ? `${left}d` : 'gone'}
      </span>
    </Link>
  )
}

export function CrewsSection() {
  const { data } = useDiscoverBoulders()
  const yours = data?.yours ?? []
  const discover = data?.discover ?? []
  if (yours.length === 0 && discover.length === 0) return null

  return (
    <div className="mb-6">
      <h2 className="flex items-center gap-1.5 text-base font-bold mb-2">🧗 Crews</h2>
      {yours.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Your crews</p>
          <div className="space-y-1.5">
            {yours.map(b => <BoulderRow key={b.id} b={b} />)}
          </div>
        </div>
      )}
      {discover.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">In your gym</p>
          <div className="space-y-1.5">
            {discover.map(b => <BoulderRow key={b.id} b={b} />)}
          </div>
        </div>
      )}
    </div>
  )
}
