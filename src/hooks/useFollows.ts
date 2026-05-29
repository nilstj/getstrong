import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'

export interface Follow {
  follower_id: string
  following_id: string
  created_at: string
}

export function useFollowing() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['follows', 'following', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('follows')
        .select('*')
        .eq('follower_id', user!.id)
      if (error) throw error
      return data as Follow[]
    },
    enabled: !!user,
  })
}

export function useFollowUser() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (followingId: string) => {
      const { error } = await supabase
        .from('follows')
        .insert({ follower_id: user!.id, following_id: followingId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follows'] })
    },
  })
}

export function useUnfollowUser() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (followingId: string) => {
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user!.id)
        .eq('following_id', followingId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follows'] })
    },
  })
}

export function useFollowersCount(userId: string) {
  return useQuery({
    queryKey: ['follows', 'followers', userId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', userId)
      if (error) throw error
      return count ?? 0
    },
  })
}
