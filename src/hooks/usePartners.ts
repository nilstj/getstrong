import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'

// ── Session partners ──────────────────────────────────────────────────────────

export function useSessionPartners(sessionId: string) {
  return useQuery({
    queryKey: ['session_partners', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('session_partners')
        .select('partner_id')
        .eq('session_id', sessionId)
      if (error) throw error
      return (data ?? []).map(r => r.partner_id as string)
    },
    enabled: !!sessionId,
  })
}

export function useSetSessionPartners(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (partnerIds: string[]) => {
      const { error: delErr } = await supabase
        .from('session_partners')
        .delete()
        .eq('session_id', sessionId)
      if (delErr) throw delErr
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
        .select('partner_id')
        .eq('problem_id', problemId)
      if (error) throw error
      return (data ?? []).map(r => r.partner_id as string)
    },
    enabled: !!problemId,
  })
}

export function useSetProblemPartners(problemId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (partnerIds: string[]) => {
      const { error: delErr } = await supabase
        .from('problem_partners')
        .delete()
        .eq('problem_id', problemId)
      if (delErr) throw delErr
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
        .select('partner_id')
        .eq('exercise_id', exerciseId)
      if (error) throw error
      return (data ?? []).map(r => r.partner_id as string)
    },
    enabled: !!exerciseId,
  })
}

export function useSetExercisePartners(exerciseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (partnerIds: string[]) => {
      const { error: delErr } = await supabase
        .from('exercise_partners')
        .delete()
        .eq('exercise_id', exerciseId)
      if (delErr) throw delErr
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

// ── Tagged sessions (current user was tagged as partner) ──────────────────────

export function useMyTaggedSessions() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my_tagged_sessions', user?.id],
    queryFn: async () => {
      const since = new Date()
      since.setDate(since.getDate() - 7)
      const sinceStr = since.toISOString().split('T')[0]

      // Get session IDs where I'm a partner
      const { data: rows, error } = await supabase
        .from('session_partners')
        .select('session_id')
        .eq('partner_id', user!.id)
      if (error) throw error
      if (!rows || rows.length === 0) return []

      const sessionIds = rows.map(r => r.session_id)

      // Fetch session details
      const { data: sessions, error: sErr } = await supabase
        .from('sessions')
        .select('id, location, date, user_id')
        .in('id', sessionIds)
        .gte('date', sinceStr)
      if (sErr) throw sErr
      if (!sessions || sessions.length === 0) return []

      return sessions.map(s => ({
        sessionId: s.id as string,
        location: s.location as string,
        date: s.date as string,
        ownerUserId: s.user_id as string,
      }))
    },
    enabled: !!user?.id,
  })
}
