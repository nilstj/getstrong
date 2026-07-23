import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useFollowing } from './useFollows'
import { summarizeFriendSessions, type FriendProblemRow, type FriendActivityRow, type FriendSessionSummary } from '../utils/friendSessions'

export type FriendSession = FriendSessionSummary & {
  authorName: string | null
  authorAvatarUrl: string | null
}

// Pull the most recent N problems and challenge attempts across everyone you
// follow, then group them into per-session summaries. Both are world-readable
// (migrations 015 / 003); the sessions table is not, so the summary is derived
// entirely from these child rows.
const SCAN = 300

export function useFriendsFeed() {
  const { data: following = [] } = useFollowing()
  const followingIds = useMemo(() => following.map(f => f.following_id), [following])

  return useQuery({
    queryKey: ['friends_feed', followingIds.slice().sort().join(',')],
    enabled: followingIds.length > 0,
    queryFn: async (): Promise<FriendSession[]> => {
      const [problemsRes, challengesRes, { data: profs }] = await Promise.all([
        supabase
          .from('problems')
          .select('user_id, session_id, gym, grade_value, grade_value_font, sent, image_url, beta_video_url, created_at')
          .in('user_id', followingIds)
          .is('crag', null)
          .order('created_at', { ascending: false })
          .limit(SCAN),
        supabase
          .from('challenge_attempts')
          .select('user_id, session_id, created_at')
          .in('user_id', followingIds)
          .order('created_at', { ascending: false })
          .limit(SCAN),
        supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', followingIds),
      ])
      if (problemsRes.error) throw problemsRes.error

      const profileById = new Map(
        (profs ?? []).map(p => [p.id as string, { username: p.username as string | null, avatar_url: p.avatar_url as string | null }])
      )

      return summarizeFriendSessions({
        problems: (problemsRes.data ?? []) as FriendProblemRow[],
        challenges: (challengesRes.data ?? []) as FriendActivityRow[],
      }).map(s => ({
        ...s,
        authorName: profileById.get(s.userId)?.username ?? null,
        authorAvatarUrl: profileById.get(s.userId)?.avatar_url ?? null,
      }))
    },
  })
}
