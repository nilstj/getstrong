import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Trophy, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../providers/AuthProvider'
import { useProfile } from '../hooks/useProfile'
import { useGymSuggestions } from '../hooks/useGymSuggestions'
import { useGymGradings } from '../hooks/useGymGradings'
import { useGymLeaderboard } from '../hooks/useLeaderboard'
import { useGymGradeLeaderboard } from '../hooks/useGradeLeaderboard'
import { LeaderboardList } from '../components/LeaderboardList'
import { BetaPointsInfo } from '../components/BetaPointsInfo'
import { cycleMonth, shiftMonth } from '../utils/leaderboard'

export function LeaderboardsPage() {
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const { data: gymOptions = [] } = useGymSuggestions()
  const [params, setParams] = useSearchParams()

  const defaultGyms = profile?.default_gyms ?? []
  // Gym lives in the URL so the page is linkable and survives a reload; the
  // first default gym is the implicit default.
  const gym = params.get('gym') ?? defaultGyms[0] ?? ''
  const selectGym = (next: string) => setParams(next ? { gym: next } : {}, { replace: true })

  const thisMonth = cycleMonth(new Date())
  const [month, setMonth] = useState(thisMonth)
  const [lookupOpen, setLookupOpen] = useState(false)
  const [lookupText, setLookupText] = useState('')

  // Only accept a known gym, so a partial string typed mid-lookup can never
  // land in the URL. Closes the panel and clears the text on success so the
  // chip row and the input never disagree about what is selected.
  const commitGym = (name: string) => {
    const match = gymOptions.find(g => g.name === name)
    if (!match) return
    selectGym(match.name)
    setLookupText('')
    setLookupOpen(false)
  }

  const { data: gradings = [], isLoading: gradingsLoading } = useGymGradings(gym || null)
  const { data: betaBoard = [], isLoading: betaLoading, isError: betaError } = useGymLeaderboard(gym, month)
  const { data: gradeBoard = [], isLoading: gradeLoading, isError: gradeError } = useGymGradeLeaderboard(gym, month)

  // A gym reached through the lookup input gets a chip for this visit too, so
  // the selection is always visible somewhere.
  const chips = gym && !defaultGyms.includes(gym) ? [...defaultGyms, gym] : defaultGyms
  const monthLabel = new Date(`${month}-01T00:00:00Z`)
    .toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  return (
    <div className="p-4 space-y-4 pb-28">
      <h1 className="text-xl font-bold">Leaderboards</h1>

      {chips.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-0.5">
          {chips.map(g => (
            <button
              key={g}
              onClick={() => {
                selectGym(g)
                setLookupText('')
                setLookupOpen(false)
              }}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border whitespace-nowrap transition-colors ${
                g === gym
                  ? 'bg-sage-700 border-sage-700 text-white'
                  : 'bg-white border-gray-200 text-gray-600'
              }`}
            >
              {g}
            </button>
          ))}
          <button
            onClick={() => setLookupOpen(o => !o)}
            aria-label="Choose another gym"
            aria-expanded={lookupOpen}
            className="text-xs text-gray-400 px-2.5 py-1.5 rounded-full border border-gray-200 bg-white"
          >
            ⌄
          </button>
        </div>
      )}

      {(lookupOpen || chips.length === 0) && (
        <div>
          <label htmlFor="leaderboard-gym" className="block text-sm font-medium text-gray-700 mb-1">Gym</label>
          <input
            id="leaderboard-gym"
            list="leaderboard-gyms"
            value={lookupText}
            onChange={e => {
              const next = e.target.value
              setLookupText(next)
              // Commit only on a real gym name. Binding the URL straight to
              // keystrokes would fire a gym-wide query per character typed.
              commitGym(next)
            }}
            onBlur={() => commitGym(lookupText)}
            onKeyDown={e => { if (e.key === 'Enter') commitGym(lookupText) }}
            placeholder="e.g. Boulders Oslo"
            className="w-full border rounded-lg px-3 py-2.5"
          />
          <datalist id="leaderboard-gyms">
            {gymOptions.map(g => <option key={g.name} value={g.name} />)}
          </datalist>
        </div>
      )}

      {!gym ? (
        <p className="text-sm text-gray-400 bg-gray-50 rounded-xl px-4 py-6 text-center">
          Pick a gym to see its leaderboards.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between bg-white border border-gray-200 rounded-full p-1.5">
            <button
              onClick={() => setMonth(m => shiftMonth(m, -1))}
              aria-label="Previous month"
              className="w-7 h-7 rounded-full grid place-items-center bg-gray-100 text-gray-500"
            >
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
            <span className="text-sm font-bold text-gray-700">{monthLabel}</span>
            <button
              onClick={() => setMonth(m => shiftMonth(m, 1))}
              disabled={month >= thisMonth}
              aria-label="Next month"
              className="w-7 h-7 rounded-full grid place-items-center bg-gray-100 text-gray-500 disabled:bg-transparent disabled:text-gray-300"
            >
              <ChevronRight size={16} strokeWidth={2} />
            </button>
          </div>

          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
              <Trophy size={15} strokeWidth={2} className="text-amber-500" />
              Beta points
              <BetaPointsInfo />
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5 mb-2">helping others through a boulder</p>
            {betaLoading ? (
              <BoardSkeleton />
            ) : betaError ? (
              <BoardError />
            ) : (
              <LeaderboardList entries={betaBoard} currentUserId={user?.id} emptyLabel="No points yet this month." />
            )}
          </div>

          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-800">
              <Trophy size={15} strokeWidth={2} className="text-amber-500" />
              Grade score
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5 mb-2">colour points for boulders sent this month</p>
            {gradeLoading || gradingsLoading ? (
              <BoardSkeleton />
            ) : gradeError ? (
              <BoardError />
            ) : gradings.length === 0 ? (
              <p className="text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3.5 text-center">
                No grading set up for this gym yet.
              </p>
            ) : (
              <LeaderboardList entries={gradeBoard} currentUserId={user?.id} emptyLabel="No sends scored this month." />
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** Keeps the section height stable while a gym or month change is in flight. */
function BoardSkeleton() {
  return (
    <div className="space-y-1">
      {[0, 1, 2].map(i => <div key={i} className="h-9 rounded-xl bg-gray-100 animate-pulse" />)}
    </div>
  )
}

function BoardError() {
  return (
    <p className="text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3.5 text-center">
      Couldn't load this board.
    </p>
  )
}
