import { useMemo } from 'react'
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
  const followingIds = useMemo(() => following.map(f => f.following_id), [following])

  return useQuery({
    queryKey: ['friends_feed', followingIds.slice().sort().join(',')],
    enabled: followingIds.length > 0,
    queryFn: async (): Promise<FriendSession[]> => {
      const [{ data, error }, { data: profs }] = await Promise.all([
        supabase
          .from('problems')
          .select('user_id, session_id, gym, grade_value, grade_value_font, sent, image_url, created_at')
          .in('user_id', followingIds)
          .order('created_at', { ascending: false })
          .limit(PROBLEM_SCAN),
        supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', followingIds),
      ])
      if (error) throw error

      const profileById = new Map(
        (profs ?? []).map(p => [p.id as string, { username: p.username as string | null, avatar_url: p.avatar_url as string | null }])
      )

      return summarizeFriendSessions((data ?? []) as FriendProblemRow[]).map(s => ({
        ...s,
        authorName: profileById.get(s.userId)?.username ?? null,
        authorAvatarUrl: profileById.get(s.userId)?.avatar_url ?? null,
      }))
    },
  })
}
