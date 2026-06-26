import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useFollowing } from './useFollows'
import { summarizeFriendSessions, type FriendProblemRow, type FriendSessionSummary } from '../utils/friendSessions'

export type FriendSession = FriendSessionSummary & {
  authorName: string | null
  authorAvatarUrl: string | null
}

// Pull from the most recent N problems across everyone you follow, then group
// them into per-session summaries. Problems are world-readable (migration 015);
// the sessions table is not, so the summary is derived entirely from problems.
const PROBLEM_SCAN = 300

export function useFriendsFeed() {
  const { data: following = [] } = useFollowing()
  const followingIds = following.map(f => f.following_id)

  return useQuery({
    queryKey: ['friends_feed', [...followingIds].sort().join(',')],
    enabled: followingIds.length > 0,
    queryFn: async (): Promise<FriendSession[]> => {
      const { data, error } = await supabase
        .from('problems')
        .select('user_id, session_id, gym, grade_value, grade_value_font, sent, image_url, created_at')
        .in('user_id', followingIds)
        .order('created_at', { ascending: false })
        .limit(PROBLEM_SCAN)
      if (error) throw error

      const summaries = summarizeFriendSessions((data ?? []) as FriendProblemRow[])

      const userIds = Array.from(new Set(summaries.map(s => s.userId)))
      const profileById = new Map<string, { username: string | null; avatar_url: string | null }>()
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', userIds)
        for (const p of profs ?? []) {
          profileById.set(p.id as string, { username: p.username as string | null, avatar_url: p.avatar_url as string | null })
        }
      }

      return summaries.map(s => ({
        ...s,
        authorName: profileById.get(s.userId)?.username ?? null,
        authorAvatarUrl: profileById.get(s.userId)?.avatar_url ?? null,
      }))
    },
  })
}
