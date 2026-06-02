import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'

interface OnWallProfile {
  id: string
  username: string | null
  avatar_url: string | null
  on_wall_at: string
  on_wall_label: string | null
}

export function useSetOnWall() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (label: string | null) => {
      const updates =
        label === null
          ? { on_wall_at: null, on_wall_label: null }
          : { on_wall_at: new Date().toISOString(), on_wall_label: label }
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user!.id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['friends_on_wall'] })
    },
  })
}

export function useFriendsOnWall(followingIds: string[]) {
  const sortedKey = followingIds.slice().sort().join(',')
  return useQuery({
    queryKey: ['friends_on_wall', sortedKey],
    queryFn: async () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, on_wall_at, on_wall_label')
        .in('id', followingIds)
        .not('on_wall_at', 'is', null)
        .gte('on_wall_at', threeHoursAgo)
      if (error) throw error
      return data as OnWallProfile[]
    },
    enabled: followingIds.length > 0,
  })
}

export function useSendHype(toUserId: string) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('hype_messages')
        .insert({ to_user_id: toUserId, from_user_id: user!.id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hype_received', toUserId] })
      queryClient.invalidateQueries({ queryKey: ['hype_sent'] })
    },
  })
}

export function useMyHypeCount() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['hype_received', user?.id],
    queryFn: async () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('hype_messages')
        .select('*')
        .eq('to_user_id', user!.id)
        .gte('created_at', threeHoursAgo)
      if (error) throw error
      return data.length
    },
    enabled: !!user,
  })
}
