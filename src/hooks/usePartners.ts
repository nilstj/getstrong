import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'

interface PartnerProfile { id: string; username: string | null; avatar_url: string | null }

// ── Session partners ──────────────────────────────────────────────────────────

export function useSessionPartners(sessionId: string) {
  return useQuery({
    queryKey: ['session_partners', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('session_partners')
        .select('partner_id, profiles!partner_id(id, username, avatar_url)')
        .eq('session_id', sessionId)
      if (error) throw error
      return (data ?? []).map(r => r.profiles as unknown as PartnerProfile)
    },
    enabled: !!sessionId,
  })
}

export function useSetSessionPartners(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (partnerIds: string[]) => {
      await supabase.from('session_partners').delete().eq('session_id', sessionId)
      if (partnerIds.length > 0) {
        const { error } = await supabase
          .from('session_partners')
          .insert(partnerIds.map(partner_id => ({ session_id: sessionId, partner_id })))
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session_partners', sessionId] })
      queryClient.invalidateQueries({ queryKey: ['my_tagged_sessions'] })
    },
  })
}

// ── Problem partners ──────────────────────────────────────────────────────────

export function useProblemPartners(problemId: string) {
  return useQuery({
    queryKey: ['problem_partners', problemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('problem_partners')
        .select('partner_id, profiles!partner_id(id, username, avatar_url)')
        .eq('problem_id', problemId)
      if (error) throw error
      return (data ?? []).map(r => r.profiles as unknown as PartnerProfile)
    },
    enabled: !!problemId,
  })
}

export function useSetProblemPartners(problemId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (partnerIds: string[]) => {
      await supabase.from('problem_partners').delete().eq('problem_id', problemId)
      if (partnerIds.length > 0) {
        const { error } = await supabase
          .from('problem_partners')
          .insert(partnerIds.map(partner_id => ({ problem_id: problemId, partner_id })))
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['problem_partners', problemId] })
    },
  })
}

// ── Exercise partners ─────────────────────────────────────────────────────────

export function useExercisePartners(exerciseId: string) {
  return useQuery({
    queryKey: ['exercise_partners', exerciseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exercise_partners')
        .select('partner_id, profiles!partner_id(id, username, avatar_url)')
        .eq('exercise_id', exerciseId)
      if (error) throw error
      return (data ?? []).map(r => r.profiles as unknown as PartnerProfile)
    },
    enabled: !!exerciseId,
  })
}

export function useSetExercisePartners(exerciseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (partnerIds: string[]) => {
      await supabase.from('exercise_partners').delete().eq('exercise_id', exerciseId)
      if (partnerIds.length > 0) {
        const { error } = await supabase
          .from('exercise_partners')
          .insert(partnerIds.map(partner_id => ({ exercise_id: exerciseId, partner_id })))
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise_partners', exerciseId] })
    },
  })
}

// ── Tagged sessions (current user was tagged as partner) ─────────────────────

export function useMyTaggedSessions() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my_tagged_sessions', user?.id],
    queryFn: async () => {
      const since = new Date()
      since.setDate(since.getDate() - 7)
      const { data, error } = await supabase
        .from('session_partners')
        .select('session_id, sessions!inner(id, location, date, user_id, profiles!user_id(username))')
        .eq('partner_id', user!.id)
        .gte('sessions.date', since.toISOString().split('T')[0])
      if (error) throw error
      return (data ?? []).map(r => {
        const s = r.sessions as any
        return { sessionId: r.session_id, location: s.location, date: s.date, ownerUsername: s.profiles?.username ?? 'Someone' }
      })
    },
    enabled: !!user?.id,
  })
}
