import { useState } from 'react'
import { useDashboard } from '../hooks/useDashboard'
import { useMyCompletedChallenges } from '../hooks/useChallenges'
import { supabase } from '../lib/supabase'
import { StatCard } from '../components/StatCard'
import { SessionCard } from '../components/SessionCard'
import { GradeProgressionChart } from '../components/GradeProgressionChart'
import { SessionFrequencyChart } from '../components/SessionFrequencyChart'
import {
  totalSessions,
  totalProblems,
  totalSends,
  sendRate,
  hardestSentPerSession,
  sessionsByWeek,
} from '../utils/stats'

const BADGES = [
  { threshold: 10, label: 'Sharma', emoji: '🏆', color: 'bg-yellow-50 border-yellow-300 text-yellow-800' },
  { threshold: 5, label: 'Warrior', emoji: '⚔️', color: 'bg-orange-50 border-orange-300 text-orange-800' },
  { threshold: 1, label: 'Noob', emoji: '🌱', color: 'bg-green-50 border-green-300 text-green-800' },
]

function getCurrentBadge(count: number) {
  return BADGES.find(b => count >= b.threshold) ?? null
}

function getNextBadge(count: number) {
  return [...BADGES].reverse().find(b => count < b.threshold) ?? null
}

export function DashboardPage() {
  const { data, isLoading, error } = useDashboard()
  const { data: completedChallenges = [] } = useMyCompletedChallenges()
  const [gradeScale, setGradeScale] = useState<'font' | 'v_scale'>('font')

  if (isLoading) return <div className="p-4 text-gray-500">Loading...</div>
  if (error) return <div className="p-4 text-red-600">Failed to load dashboard.</div>
  if (!data) return null

  const { sessions, problems, gradeMappings } = data
  const gradeData = hardestSentPerSession(sessions, problems, gradeMappings)
  const weekData = sessionsByWeek(sessions)
  const recentSessions = sessions.slice(0, 5)

  const completedCount = completedChallenges.length
  const badge = getCurrentBadge(completedCount)
  const next = getNextBadge(completedCount)

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          Log out
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Sessions" value={totalSessions(sessions)} />
        <StatCard label="Problems" value={totalProblems(problems)} />
        <StatCard label="Sends" value={totalSends(problems)} />
        <StatCard label="Send Rate" value={`${sendRate(problems)}%`} />
      </div>

      <div>
        <h2 className="text-base font-semibold mb-3">Challenges</h2>
        <div className="bg-white border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold">{completedCount}</p>
              <p className="text-xs text-gray-500 mt-0.5">completed</p>
            </div>
            {badge ? (
              <div className={`flex items-center gap-2 border rounded-xl px-4 py-2 ${badge.color}`}>
                <span className="text-2xl">{badge.emoji}</span>
                <span className="font-bold text-lg">{badge.label}</span>
              </div>
            ) : (
              <div className="border rounded-xl px-4 py-2 text-gray-400 text-sm">No badge yet</div>
            )}
          </div>
          {next && (
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Progress to {next.label}</span>
                <span>{completedCount}/{next.threshold}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all"
                  style={{ width: `${Math.min((completedCount / next.threshold) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Grade Progression</h2>
          <div className="flex rounded-lg overflow-hidden border text-xs">
            <button
              onClick={() => setGradeScale('font')}
              className={`px-3 py-1.5 font-medium transition-colors ${
                gradeScale === 'font' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'
              }`}
            >
              Font
            </button>
            <button
              onClick={() => setGradeScale('v_scale')}
              className={`px-3 py-1.5 font-medium transition-colors ${
                gradeScale === 'v_scale' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'
              }`}
            >
              V-Scale
            </button>
          </div>
        </div>
        <GradeProgressionChart
          data={gradeData}
          gradeScale={gradeScale}
          mappings={gradeMappings}
        />
      </div>

      <div>
        <h2 className="text-base font-semibold mb-3">Sessions per Week</h2>
        <SessionFrequencyChart data={weekData} />
      </div>

      <div>
        <h2 className="text-base font-semibold mb-3">Recent Sessions</h2>
        <div className="space-y-2">
          {recentSessions.map(session => (
            <SessionCard
              key={session.id}
              session={session}
              problems={problems.filter(p => p.session_id === session.id)}
            />
          ))}
          {recentSessions.length === 0 && (
            <p className="text-gray-400 text-sm text-center pt-4">
              No sessions yet. Tap Log to get started.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
