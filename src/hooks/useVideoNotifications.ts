import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface FriendBetaVideo {
  id: string
  user_id: string
  session_id: string
  beta_video_url: string
  created_at: string
  updated_at: string
}

export interface FriendProofVideo {
  id: string
  user_id: string
  challenge_id: string
  video_url: string
  created_at: string
  challenges: { title: string } | null
}

const FORTY_EIGHT_HOURS_AGO = () =>
  new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

export function useFriendBetaVideos(followingIds: string[]) {
  const sortedKey = followingIds.slice().sort().join(',')
  return useQuery({
    queryKey: ['friend_beta_videos', sortedKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('problems')
        .select('id, user_id, session_id, beta_video_url, created_at, updated_at')
        .in('user_id', followingIds)
        .not('beta_video_url', 'is', null)
        .gte('updated_at', FORTY_EIGHT_HOURS_AGO())
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as FriendBetaVideo[]
    },
    enabled: followingIds.length > 0,
  })
}

export function useFriendProofVideos(followingIds: string[]) {
  const sortedKey = followingIds.slice().sort().join(',')
  return useQuery({
    queryKey: ['friend_proof_videos', sortedKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('challenge_attempts')
        .select('id, user_id, challenge_id, video_url, created_at, challenges(title)')
        .in('user_id', followingIds)
        .not('video_url', 'is', null)
        .gte('created_at', FORTY_EIGHT_HOURS_AGO())
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as FriendProofVideo[]
    },
    enabled: followingIds.length > 0,
  })
}
