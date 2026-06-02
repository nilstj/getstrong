import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useDashboard } from '../hooks/useDashboard'
import { useMyCompletedChallenges, useReceivedChallenges } from '../hooks/useChallenges'
import { useFriendsWeeklyActivity } from '../hooks/useFriendsActivity'
import { useProfile } from '../hooks/useProfile'
import { supabase } from '../lib/supabase'
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
import { BottomSheet } from '../components/BottomSheet'
import type { FriendWeeklySummary } from '../hooks/useFriendsActivity'
import { useFriendWeeklyDetail } from '../hooks/useFriendsActivity'

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
  const { data: receivedChallenges = [] } = useReceivedChallenges()
  const { data: friendsActivity = [] } = useFriendsWeeklyActivity()
  const [gradeScale, setGradeScale] = useState<'font' | 'v_scale'>('font')
  const [selectedFriend, setSelectedFriend] = useState<string | null>(null)

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
    <div className="p-4 space-y-5 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <h1 className="text-2xl font-black tracking-tight">GetStrong</h1>
        <button
          onClick={() => supabase.auth.signOut()}
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Log out"
        >
          <LogOut size={16} />
        </button>
      </div>

      {/* Challenge invite notification */}
      {receivedChallenges.length > 0 && (
        <Link
          to="/challenges"
          className="flex items-center gap-3 bg-black text-white rounded-2xl px-4 py-3"
        >
          <span className="w-6 h-6 bg-white text-black rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0">
            {receivedChallenges.length}
          </span>
          <p className="text-sm font-medium flex-1">
            {receivedChallenges.length === 1 ? 'New challenge from ' : `${receivedChallenges.length} new challenges from `}
            {[...new Set(receivedChallenges.map(r => r.profiles?.username).filter(Boolean))].join(', ')}
          </p>
          <span className="text-white/60 text-base">›</span>
        </Link>
      )}

      {/* Compact stats + badge row */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        {/* Stats row */}
        <div className="grid grid-cols-4 divide-x divide-gray-100">
          {[
            { label: 'Sessions', value: totalSessions(sessions) },
            { label: 'Problems', value: totalProblems(problems) },
            { label: 'Sends', value: totalSends(problems) },
            { label: 'Rate', value: `${sendRate(problems)}%` },
          ].map(s => (
            <div key={s.label} className="text-center px-2 first:pl-0 last:pr-0">
              <p className="text-xl font-bold tracking-tight">{s.value}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-gray-100 my-3" />

        {/* Challenge badge row */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold">{completedCount}</span>
              <span className="text-xs text-gray-400">challenges done</span>
              {badge && (
                <span className={`ml-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${badge.color}`}>
                  {badge.emoji} {badge.label}
                </span>
              )}
            </div>
            {next && (
              <div className="mt-1.5">
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-black rounded-full transition-all"
                    style={{ width: `${Math.min((completedCount / next.threshold) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">{completedCount}/{next.threshold} to {next.label}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Friends activity this week */}
      {friendsActivity.length > 0 && (
        <div>
          <h2 className="text-base font-bold mb-2">Friends this week</h2>
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Athlete</th>
                  <th className="text-center px-2 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Problems</th>
                  <th className="text-center px-2 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Sends</th>
                  <th className="text-center px-2 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Challenges</th>
                </tr>
              </thead>
              <tbody>
                {friendsActivity.map((friend, i) => (
                  <FriendRow
                    key={friend.userId}
                    friend={friend}
                    last={i === friendsActivity.length - 1}
                    onClick={() => setSelectedFriend(friend.userId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Grade Progression */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold">Grade Progression</h2>
          <div className="flex rounded-lg overflow-hidden border text-xs">
            <button
              onClick={() => setGradeScale('font')}
              className={`px-3 py-1.5 font-medium transition-colors ${
                gradeScale === 'font' ? 'bg-black text-white' : 'bg-white text-gray-600'
              }`}
            >
              Font
            </button>
            <button
              onClick={() => setGradeScale('v_scale')}
              className={`px-3 py-1.5 font-medium transition-colors ${
                gradeScale === 'v_scale' ? 'bg-black text-white' : 'bg-white text-gray-600'
              }`}
            >
              V-Scale
            </button>
          </div>
        </div>
        <GradeProgressionChart data={gradeData} gradeScale={gradeScale} mappings={gradeMappings} />
      </div>

      {/* Sessions per Week */}
      <div>
        <h2 className="text-base font-bold mb-3">Sessions per Week</h2>
        <SessionFrequencyChart data={weekData} />
      </div>

      {/* Recent Sessions */}
      <div>
        <h2 className="text-base font-bold mb-2">Recent Sessions</h2>
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

      {selectedFriend && (
        <FriendDetailSheet
          userId={selectedFriend}
          onClose={() => setSelectedFriend(null)}
        />
      )}
    </div>
  )
}

function FriendRow({ friend, last, onClick }: { friend: FriendWeeklySummary; last: boolean; onClick: () => void }) {
  const { data: profile } = useProfile(friend.userId)
  if (!profile) return null
  return (
    <tr
      className={`cursor-pointer active:bg-gray-50 transition-colors ${last ? '' : 'border-b border-gray-100'}`}
      onClick={onClick}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-gray-500 font-medium text-xs flex-shrink-0">
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              : profile.username?.[0]?.toUpperCase() ?? '?'}
          </div>
          <span className="font-medium text-gray-900 text-sm">{profile.username}</span>
          <span className="text-gray-300 ml-auto text-base">›</span>
        </div>
      </td>
      <td className="text-center px-2 py-3 font-semibold text-gray-800">{friend.problems}</td>
      <td className="text-center px-2 py-3">
        {friend.sends > 0
          ? <span className="font-semibold text-gray-800">{friend.sends}</span>
          : <span className="text-gray-300">—</span>}
      </td>
      <td className="text-center px-2 py-3">
        {friend.challengeAttempts > 0 ? (
          <span className="font-semibold text-gray-800">
            {friend.challengesCompleted > 0
              ? <span>{friend.challengesCompleted}<span className="text-gray-400 font-normal">/{friend.challengeAttempts}</span></span>
              : friend.challengeAttempts}
          </span>
        ) : <span className="text-gray-300">—</span>}
      </td>
    </tr>
  )
}

function FriendDetailSheet({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { data: profile } = useProfile(userId)
  const { data: detail, isLoading } = useFriendWeeklyDetail(userId)

  const title = profile?.username ? `${profile.username} — this week` : 'This week'

  return (
    <BottomSheet open onClose={onClose} title={title}>
      {isLoading && <p className="text-gray-400 text-sm text-center py-8">Loading...</p>}

      {detail && (
        <div className="space-y-5">
          {/* Problems */}
          <div>
            <p className="text-sm font-bold mb-2">
              Problems
              <span className="text-gray-400 font-normal ml-1">({detail.problems.length})</span>
            </p>
            {detail.problems.length === 0 ? (
              <p className="text-sm text-gray-400">No problems logged this week.</p>
            ) : (
              <div className="space-y-2">
                {detail.problems.map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                    <div>
                      {p.name && <p className="font-semibold text-sm text-gray-900">{p.name}</p>}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium">{p.grade_value ?? p.color ?? '—'}</span>
                        {p.board && (
                          <span className="text-xs bg-gray-200 text-gray-600 rounded-full px-2 py-0.5">
                            {p.board}{p.board_angle != null ? ` ${p.board_angle}°` : ''}
                          </span>
                        )}
                        {p.gym && <span className="text-xs text-gray-400">{p.gym}</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{p.attempts} attempt{p.attempts !== 1 ? 's' : ''}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      p.sent ? 'bg-black text-white' : 'bg-gray-200 text-gray-500'
                    }`}>
                      {p.sent ? 'Sent' : 'Project'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Challenges */}
          <div>
            <p className="text-sm font-bold mb-2">
              Challenges
              <span className="text-gray-400 font-normal ml-1">({detail.attempts.length})</span>
            </p>
            {detail.attempts.length === 0 ? (
              <p className="text-sm text-gray-400">No challenge attempts this week.</p>
            ) : (
              <div className="space-y-2">
                {detail.attempts.map(a => (
                  <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                    <p className="text-sm font-medium text-gray-900">{a.challenges?.title ?? 'Challenge'}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      a.completed ? 'bg-black text-white' : 'bg-gray-200 text-gray-500'
                    }`}>
                      {a.completed ? 'Completed' : 'Attempted'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
