import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, ChevronDown, ChevronRight } from 'lucide-react'
import { useDiscoverBoulders } from '../hooks/useDiscoverBoulders'
import { daysUntil } from '../utils/gymProblems'
import { GymThumb } from './GymThumb'
import { ProblemColorIcons } from './Chip'
import type { BoulderSummary } from '../types'
import type { BoulderNavState } from '../utils/boulderNav'

function BoulderRow({ b, boulderIds, archived = false }: { b: BoulderSummary; boulderIds: string[]; archived?: boolean }) {
  const left = daysUntil(b.expires_at, new Date())
  return (
    <Link
      to={`/gym-problems/${b.id}`}
      state={{ boulderIds } satisfies BoulderNavState}
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
      <ProblemColorIcons color={b.color} holdColor={b.hold_color} size={14} className="flex-shrink-0" />
      {b.helpWanted && (
        <span title="Help wanted" aria-label="Help wanted" className="text-sm leading-none flex-shrink-0">🆘</span>
      )}
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
  const boulderIds = boulders.map(b => b.id)
  return (
    <div className="mb-3">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{label}</p>
      <div className="space-y-1.5">
        {boulders.map(b => <BoulderRow key={b.id} b={b} boulderIds={boulderIds} archived={archived} />)}
      </div>
    </div>
  )
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-sage-700 bg-sage-700 text-white'
          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  )
}

/** Done filter: every problem, only the ones I've sent, only the ones I haven't. */
type DoneFilter = 'all' | 'done' | 'todo'

export function CrewsSection() {
  const { data } = useDiscoverBoulders()
  const yours = data?.yours ?? []
  const discover = data?.discover ?? []
  const archived = data?.archived ?? []

  const [gym, setGym] = useState('')
  const [helpOnly, setHelpOnly] = useState(false)
  const [done, setDone] = useState<DoneFilter>('all')
  // Archived problems are history — they start collapsed so the live ones own
  // the page, and expand on demand.
  const [showArchived, setShowArchived] = useState(false)

  if (yours.length === 0 && discover.length === 0 && archived.length === 0) return null

  const gyms = Array.from(new Set([...yours, ...discover, ...archived].map(b => b.gym).filter(Boolean))).sort()
  const matches = (b: BoulderSummary) =>
    (!gym || b.gym === gym) &&
    (!helpOnly || b.helpWanted) &&
    (done === 'all' || (done === 'done' ? b.doneByMe : !b.doneByMe))

  const yoursF = yours.filter(matches)
  const discoverF = discover.filter(matches)
  const archivedF = archived.filter(matches)
  const filtering = !!gym || helpOnly || done !== 'all'
  const nothingLive = yoursF.length === 0 && discoverF.length === 0

  return (
    <div className="mb-6">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <select
          value={gym}
          onChange={e => setGym(e.target.value)}
          aria-label="Filter by gym"
          className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500"
        >
          <option value="">All gyms</option>
          {gyms.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <FilterButton active={helpOnly} onClick={() => setHelpOnly(v => !v)}>🆘 Help wanted</FilterButton>
        <FilterButton active={done === 'done'} onClick={() => setDone(d => (d === 'done' ? 'all' : 'done'))}>Done</FilterButton>
        <FilterButton active={done === 'todo'} onClick={() => setDone(d => (d === 'todo' ? 'all' : 'todo'))}>Not done</FilterButton>
      </div>

      <Group label="Your problems" boulders={yoursF} />
      <Group label="In your gym" boulders={discoverF} />
      {nothingLive && (
        <p className="mb-3 py-6 text-center text-sm text-gray-400">
          {filtering ? 'No problems match these filters.' : 'No active problems in your gyms.'}
        </p>
      )}

      {archivedF.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowArchived(v => !v)}
            aria-expanded={showArchived}
            className="flex w-full items-center gap-1 py-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-600"
          >
            {showArchived ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Archived ({archivedF.length})
          </button>
          {showArchived && (
            <div className="mt-1.5 space-y-1.5">
              {archivedF.map(b => (
                <BoulderRow key={b.id} b={b} boulderIds={archivedF.map(a => a.id)} archived />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
