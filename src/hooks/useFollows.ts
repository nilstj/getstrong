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

// ── Follow requests ────────────────────────────────────────────────────────────

export function useSentFollowRequests() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['follow_requests', 'sent', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('follow_requests')
        .select('recipient_id')
        .eq('requester_id', user!.id)
      if (error) throw error
      return new Set((data ?? []).map(r => r.recipient_id as string))
    },
    enabled: !!user,
  })
}

export function useReceivedFollowRequests() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['follow_requests', 'received', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('follow_requests')
        .select('id, requester_id')
        .eq('recipient_id', user!.id)
      if (error) throw error
      return (data ?? []) as { id: string; requester_id: string }[]
    },
    enabled: !!user,
  })
}

export function useSendFollowRequest() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (recipientId: string) => {
      const { error } = await supabase
        .from('follow_requests')
        .insert({ requester_id: user!.id, recipient_id: recipientId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follow_requests', 'sent'] })
    },
  })
}

export function useCancelFollowRequest() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (recipientId: string) => {
      const { error } = await supabase
        .from('follow_requests')
        .delete()
        .eq('requester_id', user!.id)
        .eq('recipient_id', recipientId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follow_requests', 'sent'] })
    },
  })
}

export function useAcceptFollowRequest() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({ requestId, requesterId }: { requestId: string; requesterId: string }) => {
      // Create the follow
      const { error: followErr } = await supabase
        .from('follows')
        .insert({ follower_id: requesterId, following_id: user!.id })
      if (followErr) throw new Error(followErr.message)
      // Delete the request
      const { error: delErr } = await supabase
        .from('follow_requests')
        .delete()
        .eq('id', requestId)
      if (delErr) throw delErr
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follows'] })
      queryClient.invalidateQueries({ queryKey: ['follow_requests', 'received'] })
    },
  })
}

export function useDeclineFollowRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from('follow_requests')
        .delete()
        .eq('id', requestId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follow_requests', 'received'] })
    },
  })
}

// ── Unfollow / Remove friend ───────────────────────────────────────────────────

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

export function useRemoveFriend() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (friendId: string) => {
      // Delete both directions of the follow
      await Promise.all([
        supabase.from('follows').delete().eq('follower_id', user!.id).eq('following_id', friendId),
        supabase.from('follows').delete().eq('follower_id', friendId).eq('following_id', user!.id),
      ])
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follows'] })
    },
  })
}
