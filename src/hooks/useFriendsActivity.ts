import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useFollowing } from './useFollows'

export interface FriendWeeklySummary {
  userId: string
  problems: number
  sends: number
  challengeAttempts: number
  challengesCompleted: number
}

export function useFriendsWeeklyActivity() {
  const { data: following = [] } = useFollowing()
  const followingIds = following.map(f => f.following_id)

  return useQuery({
    queryKey: ['friends_weekly_activity', [...followingIds].sort().join(',')],
    queryFn: async () => {
      const since = new Date()
      since.setDate(since.getDate() - 7)
      const sinceStr = since.toISOString()

      const [problemsRes, attemptsRes] = await Promise.all([
        supabase
          .from('problems')
          .select('user_id, sent')
          .in('user_id', followingIds)
          .gte('created_at', sinceStr),
        supabase
          .from('challenge_attempts')
          .select('user_id, completed')
          .in('user_id', followingIds)
          .gte('created_at', sinceStr),
      ])

      if (problemsRes.error) throw problemsRes.error
      if (attemptsRes.error) throw attemptsRes.error

      const summary: Record<string, FriendWeeklySummary> = {}
      for (const id of followingIds) {
        summary[id] = { userId: id, problems: 0, sends: 0, challengeAttempts: 0, challengesCompleted: 0 }
      }
      for (const p of problemsRes.data) {
        if (summary[p.user_id]) {
          summary[p.user_id].problems++
          if (p.sent) summary[p.user_id].sends++
        }
      }
      for (const a of attemptsRes.data) {
        if (summary[a.user_id]) {
          summary[a.user_id].challengeAttempts++
          if (a.completed) summary[a.user_id].challengesCompleted++
        }
      }

      return Object.values(summary)
        .filter(s => s.problems + s.challengeAttempts > 0)
        .sort((a, b) => (b.problems + b.challengeAttempts) - (a.problems + a.challengeAttempts))
    },
    enabled: followingIds.length > 0,
  })
}
