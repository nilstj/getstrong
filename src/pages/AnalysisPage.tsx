import { useDashboard } from '../hooks/useDashboard'
import { useProfile } from '../hooks/useProfile'
import { useMyTagStats, useProblemTagDefinitions } from '../hooks/useProblemTags'
import { GradeProgressionChart } from '../components/GradeProgressionChart'
import { SessionFrequencyChart } from '../components/SessionFrequencyChart'
import { ClimbingDNA } from '../components/ClimbingDNA'
import { hardestSentPerSession, sessionsByWeek, sendRate, totalSends, totalProblems } from '../utils/stats'
import { useAuth } from '../providers/AuthProvider'

const BOARDS: { label: string; filter: string | null }[] = [
  { label: 'Kilterboard', filter: 'Kilterboard' },
  { label: 'Moonboard',   filter: 'Moonboard' },
  { label: 'TB2',         filter: 'TB2' },
  { label: 'Outdoor',     filter: null },
]

export function AnalysisPage() {
  const { data, isLoading, error } = useDashboard()
  const { user } = useAuth()
  const { data: myProfile } = useProfile(user?.id)
  const { data: tagStats = [] } = useMyTagStats()
  const { data: allTagDefs = [] } = useProblemTagDefinitions()
  const gradeScale = myProfile?.grade_preference ?? 'font'

  if (isLoading) return <div className="p-4 text-gray-500">Loading...</div>
  if (error) return <div className="p-4 text-red-600">Failed to load analysis.</div>
  if (!data) return null

  const { sessions, problems, gradeMappings } = data
  const weekData = sessionsByWeek(sessions)
  const rate = sendRate(problems)
  const sends = totalSends(problems)
  const total = totalProblems(problems)

  const boardCharts = BOARDS
    .map(b => ({ ...b, chartData: hardestSentPerSession(sessions, problems, gradeMappings, 90, b.filter) }))
    .filter(b => b.chartData.length > 0)

  return (
    <div className="p-4 space-y-5 pb-28">
      <h1 className="text-xl font-bold">Analysis</h1>

      <div className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center justify-between">
        <div className="text-center">
          <p className="text-2xl font-bold">{rate}%</p>
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">Send Rate</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold">{sends}</p>
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">Sends</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold">{total}</p>
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">Problems</p>
        </div>
      </div>

      {allTagDefs.length > 0 && (
        <ClimbingDNA tagStats={tagStats} allTags={allTagDefs} />
      )}

      {boardCharts.length > 0 ? boardCharts.map(b => (
        <div key={b.label}>
          <h2 className="text-base font-bold mb-3">Grade Progression — {b.label}</h2>
          <GradeProgressionChart data={b.chartData} gradeScale={gradeScale} mappings={gradeMappings} />
        </div>
      )) : (
        <div>
          <h2 className="text-base font-bold mb-3">Grade Progression</h2>
          <div className="h-40 flex items-center justify-center text-gray-400 text-sm bg-gray-50 rounded-xl">
            No graded sends yet
          </div>
        </div>
      )}

      <div>
        <h2 className="text-base font-bold mb-3">Sessions per Week</h2>
        <SessionFrequencyChart data={weekData} />
      </div>
    </div>
  )
}
