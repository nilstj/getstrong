import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import { useDiscoverBoulders } from '../hooks/useDiscoverBoulders'
import { daysUntil } from '../utils/gymProblems'
import { GymThumb } from './GymThumb'
import type { BoulderSummary } from '../types'

function BoulderRow({ b, archived = false }: { b: BoulderSummary; archived?: boolean }) {
  const left = daysUntil(b.expires_at, new Date())
  return (
    <Link
      to={`/gym-problems/${b.id}`}
      className={`flex items-center gap-3 px-2.5 py-2 rounded-xl bg-gray-50 hover:bg-gray-100 ${archived ? 'opacity-75' : ''}`}
    >
      {b.image_url ? (
        <img src={b.image_url} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0" />
      ) : (
        <GymThumb gym={b.gym} compact className="w-11 h-11 rounded-lg flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">
          {b.title}{b.community_grade ? ` · ${b.community_grade}` : ''}
        </p>
        <p className="text-xs text-gray-400 truncate">{b.gym}</p>
      </div>
      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
        <Users size={12} strokeWidth={2} /> {b.crewCount}
      </span>
      <span className={`text-xs ${archived ? 'text-gray-400' : left >= 0 ? 'text-sage-700' : 'text-gray-400'}`}>
        {archived ? 'archived' : left >= 0 ? `${left}d` : 'gone'}
      </span>
    </Link>
  )
}

function Group({ label, boulders, archived }: { label: string; boulders: BoulderSummary[]; archived?: boolean }) {
  if (boulders.length === 0) return null
  return (
    <div className="mb-3">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{label}</p>
      <div className="space-y-1.5">
        {boulders.map(b => <BoulderRow key={b.id} b={b} archived={archived} />)}
      </div>
    </div>
  )
}

export function CrewsSection() {
  const { data } = useDiscoverBoulders()
  const yours = data?.yours ?? []
  const discover = data?.discover ?? []
  const archived = data?.archived ?? []
  if (yours.length === 0 && discover.length === 0 && archived.length === 0) return null

  return (
    <div className="mb-6">
      <h2 className="flex items-center gap-1.5 text-base font-bold mb-2">🚂 Sendtrains</h2>
      <Group label="Your sendtrains" boulders={yours} />
      <Group label="In your gym" boulders={discover} />
      <Group label="Archived" boulders={archived} archived />
    </div>
  )
}
