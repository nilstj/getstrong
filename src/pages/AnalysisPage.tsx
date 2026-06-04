import { useDashboard } from '../hooks/useDashboard'
import { useProfile } from '../hooks/useProfile'
import { useMyTagStats, useProblemTagDefinitions } from '../hooks/useProblemTags'
import { GradeProgressionChart } from '../components/GradeProgressionChart'
import { SessionFrequencyChart } from '../components/SessionFrequencyChart'
import { ClimbingDNA } from '../components/ClimbingDNA'
import { hardestSentPerSession, sessionsByWeek, sendRate, totalSends, totalProblems } from '../utils/stats'
import { useAuth } from '../providers/AuthProvider'
import { useRecentExercises } from '../hooks/useRecentExercises'
import { useCoach } from '../hooks/useCoach'
import { useAppSetting } from '../hooks/useAppSettings'
import { subDays } from 'date-fns'
import { RefreshCw, Sparkles } from 'lucide-react'

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

  const sessions = data?.sessions ?? []
  const problems = data?.problems ?? []
  const gradeMappings = data?.gradeMappings ?? []

  const recentSessions90 = sessions.filter(s => new Date(s.date) >= subDays(new Date(), 90))
  const recentSessionIds = recentSessions90.map(s => s.id)
  const { data: recentExercises = [] } = useRecentExercises(recentSessionIds)
  const { data: coachPrompt } = useAppSetting('coach_prompt')
  const { text: coachText, loading: coachLoading, error: coachError, trigger: triggerCoach } = useCoach()

  if (isLoading) return <div className="p-4 text-gray-500">Loading...</div>
  if (error) return <div className="p-4 text-red-600">Failed to load analysis.</div>
  if (!data) return null

  const weekData = sessionsByWeek(sessions)
  const rate = sendRate(problems)
  const sends = totalSends(problems)
  const total = totalProblems(problems)

  const recentSessionIdSet = new Set(recentSessionIds)
  const recentProblems90 = problems.filter(p => recentSessionIdSet.has(p.session_id))

  const handleCoach = () => {
    triggerCoach({ sessions: recentSessions90, problems: recentProblems90, exercises: recentExercises, tagStats, gradeScale, promptTemplate: coachPrompt ?? undefined })
  }

  const boardCharts = BOARDS
    .map(b => ({ ...b, chartData: hardestSentPerSession(sessions, problems, gradeMappings, 3650, b.filter) }))
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

      {/* AI Coaching */}
      <div>
        <button
          onClick={handleCoach}
          disabled={coachLoading}
          className="w-full bg-sage-700 text-white py-3 rounded-2xl font-medium flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
        >
          {coachLoading ? (
            <>
              <RefreshCw size={16} className="animate-spin" />
              Thinking…
            </>
          ) : (
            <>
              <Sparkles size={16} />
              Get AI Coaching
            </>
          )}
        </button>
        {coachError && (
          <p className="text-sm text-red-500 mt-2 text-center">{coachError}</p>
        )}
        {coachText && (
          <div className="mt-3 bg-white border border-gray-200 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">AI Coach</p>
              <button
                onClick={handleCoach}
                disabled={coachLoading}
                className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40"
                title="Regenerate"
              >
                <RefreshCw size={14} />
              </button>
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {coachText}
            </div>
          </div>
        )}
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
