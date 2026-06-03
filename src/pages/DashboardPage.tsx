import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDashboard } from '../hooks/useDashboard'
import { useMyCompletedChallenges, useReceivedChallenges } from '../hooks/useChallenges'
import { useFriendsWeeklyActivity } from '../hooks/useFriendsActivity'
import { useProfile } from '../hooks/useProfile'
import { useFollowing } from '../hooks/useFollows'
import { useSetOnWall, useFriendsOnWall, useSendHype, useMyHypeCount } from '../hooks/useOnWall'
import { SessionCard } from '../components/SessionCard'
import {
  totalSessions,
  totalProblems,
  totalSends,
  sendRate,
} from '../utils/stats'
import { BottomSheet } from '../components/BottomSheet'
import { ReactionBar } from '../components/ReactionBar'
import { useMyTaggedSessions } from '../hooks/usePartners'
import { useAuth } from '../providers/AuthProvider'
import type { FriendWeeklySummary } from '../hooks/useFriendsActivity'
import { useFriendWeeklyDetail } from '../hooks/useFriendsActivity'
import toast from 'react-hot-toast'

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
  const { user } = useAuth()
  const { data: myProfile } = useProfile(user?.id)
  const { data: following = [] } = useFollowing()
  const followingIds = following.map(f => f.following_id)
  const { data: friendsActivity = [] } = useFriendsWeeklyActivity()
  const { data: taggedSessions = [] } = useMyTaggedSessions()
  const { data: friendsOnWall = [] } = useFriendsOnWall(followingIds)
  const { data: myHypeCount = 0 } = useMyHypeCount()
  const setOnWall = useSetOnWall()
  const [selectedFriend, setSelectedFriend] = useState<string | null>(null)
  const [wallLabelInput, setWallLabelInput] = useState('')
  const [showWallInput, setShowWallInput] = useState(false)
  const gradeScale = myProfile?.grade_preference ?? 'font'
  const isOnWall = !!myProfile?.on_wall_at

  if (isLoading) return <div className="p-4 text-gray-500">Loading...</div>
  if (error) return <div className="p-4 text-red-600">Failed to load dashboard.</div>
  if (!data) return null

  const { sessions, problems } = data
  const recentSessions = sessions.slice(0, 5)

  const completedCount = completedChallenges.length
  const badge = getCurrentBadge(completedCount)
  const next = getNextBadge(completedCount)

  return (
    <div className="p-4 space-y-5 pb-28">
      {/* On the Wall */}
      {isOnWall ? (
        <div className="bg-sage-700 text-white rounded-2xl px-4 py-3 flex items-center gap-3">
          <span className="text-xl animate-bounce">🧗</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">You're on the wall!</p>
            {myProfile?.on_wall_label && (
              <p className="text-xs text-white/60 truncate">{myProfile.on_wall_label}</p>
            )}
            {myHypeCount > 0 && (
              <p className="text-xs text-yellow-300 font-medium mt-0.5">🔥 {myHypeCount} hype{myHypeCount !== 1 ? 's' : ''}!</p>
            )}
          </div>
          <button
            onClick={() => setOnWall.mutate(null, { onSuccess: () => toast.success('Status cleared') })}
            className="text-xs text-white/60 hover:text-white font-medium"
          >
            Done
          </button>
        </div>
      ) : showWallInput ? (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 space-y-2">
          <input
            autoFocus
            value={wallLabelInput}
            onChange={e => setWallLabelInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                setOnWall.mutate(wallLabelInput || 'On the wall', {
                  onSuccess: () => { setShowWallInput(false); setWallLabelInput('') },
                })
              }
              if (e.key === 'Escape') setShowWallInput(false)
            }}
            placeholder="What are you projecting? (e.g. Green V7 at Boulders)"
            className="w-full text-sm bg-white border border-gray-200 rounded-xl px-3 py-2"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowWallInput(false)}
              className="flex-1 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-xl"
            >Cancel</button>
            <button
              onClick={() => setOnWall.mutate(wallLabelInput || 'On the wall', {
                onSuccess: () => { setShowWallInput(false); setWallLabelInput('') },
              })}
              disabled={setOnWall.isPending}
              className="flex-1 py-1.5 text-sm font-semibold bg-sage-700 text-white rounded-xl disabled:opacity-50"
            >
              {setOnWall.isPending ? '…' : "I'm on the wall 🧗"}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowWallInput(true)}
          className="w-full flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2.5 text-sm text-gray-500 hover:border-gray-300 transition-colors"
        >
          <span>🧗</span>
          <span>Announce you're on the wall…</span>
        </button>
      )}

      {/* Challenge invite notification */}
      {receivedChallenges.length > 0 && (
        <Link
          to="/challenges"
          className="flex items-center gap-3 bg-sage-700 text-white rounded-2xl px-4 py-3"
        >
          <span className="w-6 h-6 bg-white text-sage-800 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0">
            {receivedChallenges.length}
          </span>
          <p className="text-sm font-medium flex-1">
            {receivedChallenges.length === 1 ? 'New challenge from ' : `${receivedChallenges.length} new challenges from `}
            {[...new Set(receivedChallenges.map(r => r.profiles?.username).filter(Boolean))].join(', ')}
          </p>
          <span className="text-white/60 text-base">›</span>
        </Link>
      )}

      {/* Tagged in sessions this week */}
      {taggedSessions.length > 0 && (
        <div className="bg-sage-50 border border-sage-200 rounded-2xl px-4 py-3">
          <p className="text-sm font-semibold text-sage-800 mb-1.5">
            👥 You climbed with friends this week
          </p>
          <div className="space-y-1">
            {taggedSessions.map(s => (
              <TaggedSessionRow key={s.sessionId} ownerUserId={s.ownerUserId} location={s.location} date={s.date} />
            ))}
          </div>
        </div>
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
                    className="h-full bg-sage-700 rounded-full transition-all"
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
                    onWall={friendsOnWall.find(f => f.id === friend.userId) ?? null}
                    onClick={() => setSelectedFriend(friend.userId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Power Rankings */}
      {friendsActivity.length >= 2 && (
        <PowerRankings activity={friendsActivity} />
      )}

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
          gradeScale={gradeScale}
          onClose={() => setSelectedFriend(null)}
        />
      )}
    </div>
  )
}

interface OnWallProfile { id: string; username: string | null; avatar_url: string | null; on_wall_at: string; on_wall_label: string | null }

function FriendRow({ friend, last, onWall, onClick }: { friend: FriendWeeklySummary; last: boolean; onWall: OnWallProfile | null; onClick: () => void }) {
  const { data: profile } = useProfile(friend.userId)
  const sendHype = useSendHype(friend.userId)
  if (!profile) return null
  return (
    <tr
      className={`cursor-pointer active:bg-gray-50 transition-colors ${last ? '' : 'border-b border-gray-100'}`}
      onClick={onClick}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="w-7 h-7 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-gray-500 font-medium text-xs flex-shrink-0">
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                : profile.username?.[0]?.toUpperCase() ?? '?'}
            </div>
            {onWall && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
            )}
          </div>
          <div className="min-w-0">
            <span className="font-medium text-gray-900 text-sm">{profile.username}</span>
            {onWall && onWall.on_wall_label && (
              <p className="text-[10px] text-green-600 truncate max-w-[100px]">{onWall.on_wall_label}</p>
            )}
          </div>
          {onWall ? (
            <button
              onClick={e => {
                e.stopPropagation()
                sendHype.mutate(undefined, { onSuccess: () => toast.success('Hype sent! 🔥') })
              }}
              disabled={sendHype.isPending}
              className="ml-auto text-xs bg-khaki-100 text-khaki-700 px-2 py-0.5 rounded-full font-semibold"
            >
              🔥 Hype
            </button>
          ) : (
            <span className="text-gray-300 ml-auto text-base">›</span>
          )}
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

function PowerRankings({ activity }: { activity: FriendWeeklySummary[] }) {
  const medals = ['🥇', '🥈', '🥉']
  const byProblems = [...activity].sort((a, b) => b.problems - a.problems).slice(0, 3)
  const bySends = [...activity].sort((a, b) => b.sends - a.sends).filter(a => a.sends > 0).slice(0, 3)
  const byChallenges = [...activity].sort((a, b) => b.challengesCompleted - a.challengesCompleted).filter(a => a.challengesCompleted > 0).slice(0, 3)

  if (byProblems.length < 2) return null

  return (
    <div>
      <h2 className="text-base font-bold mb-2">Weekly Rankings</h2>
      <div className="grid grid-cols-3 gap-2">
        {[
          { title: '🧗 Problems', list: byProblems, value: (f: FriendWeeklySummary) => f.problems },
          { title: '✅ Sends', list: bySends, value: (f: FriendWeeklySummary) => f.sends },
          { title: '🏆 Challenges', list: byChallenges, value: (f: FriendWeeklySummary) => f.challengesCompleted },
        ].map(cat => (
          <div key={cat.title} className="bg-white border border-gray-200 rounded-2xl p-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{cat.title}</p>
            {cat.list.length === 0 ? (
              <p className="text-xs text-gray-300">—</p>
            ) : cat.list.map((f, i) => (
              <RankingEntry key={f.userId} userId={f.userId} medal={medals[i]} value={cat.value(f)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function RankingEntry({ userId, medal, value }: { userId: string; medal: string; value: number }) {
  const { data: profile } = useProfile(userId)
  if (!profile) return null
  return (
    <div className="flex items-center gap-1.5 mb-1 last:mb-0">
      <span className="text-sm">{medal}</span>
      <span className="text-xs font-medium text-gray-700 truncate flex-1">{profile.username}</span>
      <span className="text-xs font-bold text-gray-900">{value}</span>
    </div>
  )
}

function TaggedSessionRow({ ownerUserId, location, date }: { ownerUserId: string; location: string; date: string }) {
  const { data: profile } = useProfile(ownerUserId)
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-sage-700 font-medium">{profile?.username ?? '…'}</span>
      <span className="text-xs text-sage-500">at {location}</span>
      <span className="text-xs text-sage-400 ml-auto">{date}</span>
    </div>
  )
}

function FriendDetailSheet({ userId, gradeScale, onClose }: { userId: string; gradeScale: 'font' | 'v_scale'; onClose: () => void }) {
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
                  <div key={p.id} className="bg-gray-50 rounded-xl px-3 py-2.5">
                    <div>
                      {p.name && <p className="font-semibold text-sm text-gray-900">{p.name}</p>}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium">
                          {gradeScale === 'v_scale' && p.grade_value_vscale
                            ? p.grade_value_vscale
                            : (p.grade_value_font ?? p.color ?? '—')}
                        </span>
                        {p.board && (
                          <span className="text-xs bg-gray-200 text-gray-600 rounded-full px-2 py-0.5">
                            {p.board}{p.board_angle != null ? ` ${p.board_angle}°` : ''}
                          </span>
                        )}
                        {p.gym && <span className="text-xs text-gray-400">{p.gym}</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{p.attempts} attempt{p.attempts !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <ReactionBar problemId={p.id} />
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ml-auto ${
                        p.sent && p.attempts === 1 ? 'bg-yellow-300 text-yellow-900' :
                      p.sent ? 'bg-sage-700 text-white' : 'bg-gray-200 text-gray-500'
                      }`}>
                        {p.sent && p.attempts === 1 ? 'Flash ⚡' : p.sent ? 'Sent' : 'Project'}
                      </span>
                    </div>
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
                  <div key={a.id} className="bg-gray-50 rounded-xl px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">{a.challenges?.title ?? 'Challenge'}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                        a.completed ? 'bg-sage-700 text-white' : 'bg-gray-200 text-gray-500'
                      }`}>
                        {a.completed ? 'Completed' : 'Attempted'}
                      </span>
                    </div>
                    <ReactionBar attemptId={a.id} />
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
