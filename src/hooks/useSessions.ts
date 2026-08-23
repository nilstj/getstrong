import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Session } from '../types'
import { useAuth } from '../providers/AuthProvider'

export function useSessions() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['sessions', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('user_id', user!.id)
        .order('date', { ascending: false })
      if (error) throw error
      return data as Session[]
    },
    enabled: !!user?.id,
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
    mutationFn: async (values: Omit<Session, 'id' | 'user_id' | 'created_at' | 'wisdom' | 'wisdom_shared' | 'group_id'>) => {
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

/**
 * A friend's shared wisdom for one session, or null.
 *
 * Migration 032's policy is the entire gate: it permits a SELECT on `sessions`
 * only when `wisdom_shared` is true AND the caller follows the owner. An
 * unshared session, or a stranger's, therefore comes back with no row at all --
 * nothing needs checking here. `wisdom_shared` is repeated in the filter anyway
 * so the intent is legible without going to read the migration.
 *
 * This replaces useFriendsWisdoms, a 14-day batch query across everyone you
 * follow that was written for a surface that never shipped: it had no callers
 * anywhere, so "Shared with friends" wrote a flag nothing read.
 */
export function useSharedSessionWisdom(sessionId: string) {
  return useQuery({
    queryKey: ['shared_session_wisdom', sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('sessions')
        .select('wisdom')
        .eq('id', sessionId)
        .eq('wisdom_shared', true)
        .maybeSingle()
      if (error) throw error
      return (data?.wisdom as string | null) ?? null
    },
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
