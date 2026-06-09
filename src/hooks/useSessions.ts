import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Session } from '../types'
import { useAuth } from '../providers/AuthProvider'

export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .order('date', { ascending: false })
      if (error) throw error
      return data as Session[]
    },
  })
}

export function useSession(id: string) {
  return useQuery({
    queryKey: ['sessions', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Session
    },
  })
}

export function useCreateSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: Omit<Session, 'id' | 'user_id' | 'created_at' | 'wisdom' | 'wisdom_shared'>) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('sessions')
        .insert({ ...values, user_id: session.user.id })
        .select()
        .single()
      if (error) throw error
      return data as Session
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useDeleteSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sessions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useUpdateSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: Partial<Omit<Session, 'user_id' | 'created_at'>> & { id: string }) => {
      const { data, error } = await supabase
        .from('sessions')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as Session
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      queryClient.invalidateQueries({ queryKey: ['sessions', id] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export interface FriendWisdom {
  id: string
  user_id: string
  date: string
  location: string
  wisdom: string
}

export function useFriendsWisdoms(followingIds: string[]) {
  return useQuery({
    queryKey: ['friends_wisdoms', [...followingIds].sort().join(',')],
    queryFn: async () => {
      const since = new Date()
      since.setDate(since.getDate() - 14)
      const { data, error } = await supabase
        .from('sessions')
        .select('id, user_id, date, location, wisdom')
        .in('user_id', followingIds)
        .eq('wisdom_shared', true)
        .not('wisdom', 'is', null)
        .gte('date', since.toISOString().split('T')[0])
        .order('date', { ascending: false })
      if (error) throw error
      return (data ?? []) as FriendWisdom[]
    },
    enabled: followingIds.length > 0,
  })
}

export function useMySessionLocations() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['session_locations', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('location')
        .eq('user_id', user!.id)
        .order('date', { ascending: false })
      if (error) throw error
      const seen = new Set<string>()
      return (data ?? [])
        .map(s => s.location as string)
        .filter(loc => loc && !seen.has(loc) && !!seen.add(loc))
    },
    enabled: !!user?.id,
  })
}
