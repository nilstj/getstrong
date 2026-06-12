import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Trophy, CalendarDays } from 'lucide-react'
import { useDashboard } from '../hooks/useDashboard'
import { useMyCompletedChallenges, useReceivedChallenges } from '../hooks/useChallenges'
import { useFriendsWeeklyActivity } from '../hooks/useFriendsActivity'
import { useProfile } from '../hooks/useProfile'
import { useFollowing } from '../hooks/useFollows'
import { useSendHype, useMyHypeCount } from '../hooks/useOnWall'
import {
  useMyAnnouncement, useCreateAnnouncement, useClearAnnouncement,
  useFriendsAnnouncements, useJoinAnnouncement, useUnjoinAnnouncement, useMyJoins,
} from '../hooks/useWallAnnouncements'
import type { WallAnnouncement } from '../hooks/useWallAnnouncements'
import { useMySessionLocations, useFriendsWisdoms } from '../hooks/useSessions'
import type { FriendWisdom } from '../hooks/useSessions'
import { format } from 'date-fns'
import {
  totalSessions,
  totalProblems,
  totalSends,
} from '../utils/stats'
import { BottomSheet } from '../components/BottomSheet'
import { WallAnnouncementSheet } from '../components/WallAnnouncementSheet'
import { ReactionBar } from '../components/ReactionBar'
import { ProblemCommentThread } from '../components/ProblemCommentThread'
import { useProblemCommentCounts } from '../hooks/useProblemComments'
import { useMyTaggedSessions } from '../hooks/usePartners'
import { useAuth } from '../providers/AuthProvider'
import type { FriendWeeklySummary } from '../hooks/useFriendsActivity'
import { useFriendWeeklyDetail } from '../hooks/useFriendsActivity'
import toast from 'react-hot-toast'


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
  const { data: myHypeCount = 0 } = useMyHypeCount()
  const [selectedFriend, setSelectedFriend] = useState<string | null>(null)
  const gradeScale = myProfile?.grade_preference ?? 'font'

  const { data: myAnnouncement } = useMyAnnouncement()
  const createAnnouncement = useCreateAnnouncement()
  const clearAnnouncement = useClearAnnouncement()
  const { data: friendsAnnouncements = [] } = useFriendsAnnouncements(followingIds)
  const { data: myJoins = new Set<string>() } = useMyJoins()
  const { data: sessionLocations = [] } = useMySessionLocations()
  const { data: friendsWisdoms = [] } = useFriendsWisdoms(followingIds)

  const [showWallInput, setShowWallInput] = useState(false)
  const [locationInput, setLocationInput] = useState('')
  const [labelInput, setLabelInput] = useState('')
  const [wallMode, setWallMode] = useState<'now' | 'plan'>('now')
  const [plannedAt, setPlannedAt] = useState('')
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false)
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<WallAnnouncement | null>(null)
  const [dismissedHypeCount, setDismissedHypeCount] = useState<number>(
    () => Number(localStorage.getItem('dismissedHypeCount') ?? 0)
  )
  const unseenHypes = myHypeCount - dismissedHypeCount
  const dismissHypes = () => {
    localStorage.setItem('dismissedHypeCount', String(myHypeCount))
    setDismissedHypeCount(myHypeCount)
  }

  const isLive = !!myAnnouncement && new Date(myAnnouncement.starts_at) <= new Date()
  const isPlanned = !!myAnnouncement && new Date(myAnnouncement.starts_at) > new Date()

  const handleCreateAnnouncement = () => {
    const starts_at = wallMode === 'now' ? new Date().toISOString() : new Date(plannedAt).toISOString()
    createAnnouncement.mutate(
      { location: locationInput.trim(), label: labelInput.trim() || null, starts_at },
      {
        onSuccess: () => {
          setShowWallInput(false)
          setLocationInput('')
          setLabelInput('')
          setPlannedAt('')
          setWallMode('now')
        },
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to announce'),
      }
    )
  }

  const filteredLocations = locationInput.length > 0
    ? sessionLocations.filter(l => l.toLowerCase().includes(locationInput.toLowerCase()))
    : sessionLocations.slice(0, 5)

  if (isLoading) return <div className="p-4 text-gray-500">Loading...</div>
  if (error) return <div className="p-4 text-red-600">Failed to load dashboard.</div>
  if (!data) return null

  const { sessions, problems } = data
  const completedCount = completedChallenges.length

  return (
    <div className="p-4 space-y-5 pb-28">
      {/* On the Wall */}
      {isLive && myAnnouncement ? (
        <div className="bg-sage-700 text-white rounded-2xl px-4 py-3 flex items-center gap-3">
          <span className="text-xl animate-bounce">🧗</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{myAnnouncement.location}</p>
            {myAnnouncement.label && (
              <p className="text-xs text-white/60 truncate">{myAnnouncement.label}</p>
            )}
            {unseenHypes > 0 && (
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-yellow-300 font-medium">🔥 {unseenHypes} hype{unseenHypes !== 1 ? 's' : ''}!</p>
                <button onClick={dismissHypes} className="text-xs text-white/40 hover:text-white/70 leading-none">×</button>
              </div>
            )}
          </div>
          <button
            onClick={() => clearAnnouncement.mutate(myAnnouncement.id)}
            className="text-xs text-white/60 hover:text-white font-medium"
          >
            Done
          </button>
        </div>
      ) : isPlanned && myAnnouncement ? (
        <div className="bg-sage-50 border border-sage-200 rounded-2xl px-4 py-3 flex items-center gap-3">
          <CalendarDays size={20} strokeWidth={1.75} className="text-sage-700 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sage-800">{myAnnouncement.location}</p>
            <p className="text-xs text-sage-600">
              {format(new Date(myAnnouncement.starts_at), 'EEE d MMM, HH:mm')}
              {myAnnouncement.wall_joins.length > 0 && ` · ${myAnnouncement.wall_joins.length} joining`}
            </p>
            {myAnnouncement.label && (
              <p className="text-xs text-sage-500 truncate">{myAnnouncement.label}</p>
            )}
          </div>
          <button
            onClick={() => clearAnnouncement.mutate(myAnnouncement.id)}
            className="text-xs text-sage-600 hover:text-sage-800 font-medium"
          >
            Cancel
          </button>
        </div>
      ) : showWallInput ? (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 space-y-2">
          <div className="relative">
            <input
              autoFocus
              value={locationInput}
              onChange={e => { setLocationInput(e.target.value); setShowLocationSuggestions(true) }}
              onFocus={() => setShowLocationSuggestions(true)}
              onBlur={() => setTimeout(() => setShowLocationSuggestions(false), 150)}
              placeholder="Gym or crag (e.g. Boulder World)"
              className="w-full text-sm bg-white border border-gray-200 rounded-xl px-3 py-2"
            />
            {showLocationSuggestions && filteredLocations.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                {filteredLocations.map(loc => (
                  <button
                    key={loc}
                    type="button"
                    onMouseDown={() => { setLocationInput(loc); setShowLocationSuggestions(false) }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {loc}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            value={labelInput}
            onChange={e => setLabelInput(e.target.value)}
            placeholder="What are you working on? (optional)"
            className="w-full text-sm bg-white border border-gray-200 rounded-xl px-3 py-2"
          />
          <div className="flex rounded-xl overflow-hidden border">
            {(['now', 'plan'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setWallMode(m)}
                className={`flex-1 py-1.5 text-sm font-medium transition-colors ${wallMode === m ? 'bg-sage-700 text-white' : 'bg-white text-gray-600'}`}
              >
                {m === 'now' ? '🧗 Now' : '📅 Plan'}
              </button>
            ))}
          </div>
          {wallMode === 'plan' && (
            <input
              type="datetime-local"
              value={plannedAt}
              onChange={e => setPlannedAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              className="w-full text-sm bg-white border border-gray-200 rounded-xl px-3 py-2"
            />
          )}
          <div className="flex gap-2">
            <button
              onClick={() => { setShowWallInput(false); setLocationInput(''); setLabelInput('') }}
              className="flex-1 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-xl"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateAnnouncement}
              disabled={!locationInput.trim() || (wallMode === 'plan' && !plannedAt) || createAnnouncement.isPending}
              className="flex-1 py-1.5 text-sm font-semibold bg-sage-700 text-white rounded-xl disabled:opacity-50"
            >
              {createAnnouncement.isPending ? '…' : wallMode === 'now' ? "I'm on the wall 🧗" : 'Plan session 📅'}
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

      {/* Friends on the wall notification */}
      {friendsAnnouncements.length > 0 && (
        <>
          <div className="bg-sage-50 border border-sage-200 rounded-2xl px-4 py-3 space-y-1">
            <p className="text-xs font-semibold text-sage-600 uppercase tracking-wide mb-1">Friends on the wall</p>
            {friendsAnnouncements.map(a => (
              <FriendAnnouncementRow
                key={a.id}
                announcement={a}
                onClick={() => setSelectedAnnouncement(a)}
              />
            ))}
          </div>
          {selectedAnnouncement && (
            <WallAnnouncementSheet
              announcement={selectedAnnouncement}
              onClose={() => setSelectedAnnouncement(null)}
            />
          )}
        </>
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

      {/* Stats row */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <div className="grid grid-cols-4 divide-x divide-gray-100">
          {[
            { label: 'Sessions', value: totalSessions(sessions), to: '/sessions' },
            { label: 'Problems', value: totalProblems(problems), to: '/sessions' },
            { label: 'Sends', value: totalSends(problems), to: '/sessions' },
          ].map(s => (
            <Link key={s.label} to={s.to} className="text-center px-2 first:pl-0 active:opacity-60 transition-opacity">
              <p className="text-xl font-bold tracking-tight">{s.value}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">{s.label}</p>
            </Link>
          ))}
          <Link to="/challenges" className="text-center px-2 active:opacity-60 transition-opacity">
            <div className="flex items-center justify-center gap-1">
              <Trophy size={16} strokeWidth={1.75} className="text-gray-700" />
              <p className="text-xl font-bold tracking-tight">{completedCount}</p>
            </div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">Challenges</p>
          </Link>
        </div>
      </div>

      {/* Friends activity this week */}
      {friendsActivity.length > 0 && (
        <div>
          <h2 className="text-base font-bold mb-2">Friends Feed</h2>
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
                    announcement={friendsAnnouncements.find(a => a.user_id === friend.userId) ?? null}
                    hasJoined={!!friendsAnnouncements.find(a => a.user_id === friend.userId && myJoins.has(a.id))}
                    onClick={() => setSelectedFriend(friend.userId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Friends Wisdom */}
      {friendsWisdoms.length > 0 && (
        <div>
          <h2 className="text-base font-bold mb-2">🧠 Spraying Wisdom</h2>
          <div className="space-y-2">
            {friendsWisdoms.map(w => (
              <FriendWisdomCard key={w.id} wisdom={w} />
            ))}
          </div>
        </div>
      )}

      {/* Power Rankings */}
      {friendsActivity.length >= 2 && (
        <PowerRankings activity={friendsActivity} />
      )}

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

function FriendAnnouncementRow({ announcement, onClick }: { announcement: WallAnnouncement; onClick: () => void }) {
  const { data: profile } = useProfile(announcement.user_id)
  const isLive = new Date(announcement.starts_at) <= new Date()
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 text-left active:bg-sage-100 transition-colors px-1 py-1.5 rounded-xl"
    >
      <span className="text-base">{isLive ? '🧗' : '📅'}</span>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-sage-800">{profile?.username ?? '…'}</span>
        <span className="text-sm text-sage-600"> · {announcement.location}</span>
        {!isLive && (
          <span className="text-xs text-sage-500 ml-1">
            · {format(new Date(announcement.starts_at), 'EEE HH:mm')}
          </span>
        )}
      </div>
      <span className="text-sage-400 text-base">›</span>
    </button>
  )
}

function FriendRow({ friend, last, announcement, hasJoined, onClick }: {
  friend: FriendWeeklySummary
  last: boolean
  announcement: WallAnnouncement | null
  hasJoined: boolean
  onClick: () => void
}) {
  const { data: profile } = useProfile(friend.userId)
  const sendHype = useSendHype(friend.userId)
  const joinAnnouncement = useJoinAnnouncement()
  const unjoinAnnouncement = useUnjoinAnnouncement()
  if (!profile) return null

  const now = new Date()
  const isLiveAnnouncement = !!announcement && new Date(announcement.starts_at) <= now
  const isPlannedAnnouncement = !!announcement && new Date(announcement.starts_at) > now

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
            {isLiveAnnouncement && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
            )}
            {isPlannedAnnouncement && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-sage-500 rounded-full border-2 border-white flex items-center justify-center">
                <CalendarDays size={6} className="text-white" />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <span className="font-medium text-gray-900 text-sm">{profile.username}</span>
            {isLiveAnnouncement && announcement && (
              <p className="text-[10px] text-green-600 truncate max-w-[100px]">{announcement.location}</p>
            )}
            {isPlannedAnnouncement && announcement && (
              <p className="text-[10px] text-sage-600 truncate max-w-[100px]">
                {format(new Date(announcement.starts_at), 'EEE HH:mm')} · {announcement.location}
              </p>
            )}
          </div>
          {isLiveAnnouncement ? (
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
          ) : isPlannedAnnouncement && announcement ? (
            <button
              onClick={e => {
                e.stopPropagation()
                if (hasJoined) {
                  unjoinAnnouncement.mutate(announcement.id)
                } else {
                  joinAnnouncement.mutate(announcement.id, { onSuccess: () => toast.success('Joined! 📅') })
                }
              }}
              disabled={joinAnnouncement.isPending || unjoinAnnouncement.isPending}
              className={`ml-auto text-xs px-2 py-0.5 rounded-full font-semibold ${
                hasJoined
                  ? 'bg-sage-100 text-sage-700'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {hasJoined ? '✓ Joined' : '📅 Join'}
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

function FriendWisdomCard({ wisdom }: { wisdom: FriendWisdom }) {
  const { data: profile } = useProfile(wisdom.user_id)
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-6 h-6 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-gray-500 font-medium text-xs flex-shrink-0">
          {profile?.avatar_url
            ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            : profile?.username?.[0]?.toUpperCase() ?? '?'}
        </div>
        <span className="text-xs font-semibold text-amber-800">{profile?.username ?? '…'}</span>
        <span className="text-xs text-amber-500 ml-auto">{wisdom.location} · {wisdom.date}</span>
      </div>
      <p className="text-sm text-amber-900 italic">"{wisdom.wisdom}"</p>
    </div>
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
  const friendProblemIds = (detail?.problems ?? []).map(p => p.id)
  const { data: commentCounts = {} } = useProblemCommentCounts(friendProblemIds)
  const [openCommentProblemId, setOpenCommentProblemId] = useState<string | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

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
                    <div className="flex items-start gap-2">
                      {p.image_url && (
                        <button type="button" onClick={() => setLightboxUrl(p.image_url!)} className="flex-shrink-0">
                          <img src={p.image_url} alt="" className="w-14 h-14 object-cover rounded-lg" />
                        </button>
                      )}
                      <div className="flex-1 min-w-0">
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
                        {p.beta_video_url && (
                          <a href={p.beta_video_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-sage-800 font-medium mt-0.5 inline-block">
                            ▶ Beta video
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <ReactionBar problemId={p.id} />
                      <div className="flex items-center mt-1">
                        <button
                          onClick={() => setOpenCommentProblemId(
                            openCommentProblemId === p.id ? null : p.id
                          )}
                          className="text-sm text-gray-500 hover:text-sage-700 transition-colors font-medium flex items-center gap-1"
                        >
                          <span className="text-base">💬</span>{(commentCounts[p.id] ?? 0) > 0 ? <span>{commentCounts[p.id]}</span> : null}
                        </button>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ml-auto ${
                        p.sent && p.attempts === 1 ? 'bg-yellow-300 text-yellow-900' :
                        p.sent ? 'bg-sage-700 text-white' : 'bg-gray-200 text-gray-500'
                      }`}>
                        {p.sent && p.attempts === 1 ? 'Flash ⚡' : p.sent ? 'Sent' : 'Project'}
                      </span>
                    </div>
                    {openCommentProblemId === p.id && (
                      <ProblemCommentThread problemId={p.id} />
                    )}
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
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="" className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </BottomSheet>
  )
}
