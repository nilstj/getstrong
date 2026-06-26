import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { betaSort } from '../utils/betaSort'
import type { BoulderBeta, BoulderReaction } from '../types'

// ---- Beta thread ----
export function useBoulderBetas(gymProblemId: string) {
  return useQuery({
    queryKey: ['boulder_beta', gymProblemId],
    enabled: !!gymProblemId,
    queryFn: async (): Promise<BoulderBeta[]> => {
      const { data: { user } } = await supabase.auth.getUser()
      const [betasRes, workedRes] = await Promise.all([
        supabase
          .from('boulder_beta')
          .select('id, gym_problem_id, user_id, body, video_url, created_at, boulder_beta_worked(count)')
          .eq('gym_problem_id', gymProblemId),
        supabase
          .from('boulder_beta_worked')
          .select('beta_id')
          .eq('user_id', user?.id ?? ''),
      ])
      if (betasRes.error) throw betasRes.error
      const mine = new Set((workedRes.data ?? []).map(r => r.beta_id as string))
      const rows = (betasRes.data ?? []).map((r): BoulderBeta => ({
        id: r.id as string,
        gym_problem_id: r.gym_problem_id as string,
        user_id: r.user_id as string,
        body: r.body as string | null,
        video_url: r.video_url as string | null,
        created_at: r.created_at as string,
        worked_count: ((r.boulder_beta_worked as { count: number }[] | null)?.[0]?.count) ?? 0,
        worked_by_me: mine.has(r.id as string),
      }))
      return rows.sort(betaSort)
    },
  })
}

export function useAddBoulderBeta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { gymProblemId: string; body: string | null; videoUrl: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('boulder_beta')
        .insert({ gym_problem_id: v.gymProblemId, user_id: user?.id, body: v.body, video_url: v.videoUrl })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['boulder_beta', v.gymProblemId] }),
  })
}

export function useMarkBetaWorked() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { betaId: string; gymProblemId: string }) => {
      const { error } = await supabase.rpc('mark_beta_worked', { p_beta_id: v.betaId })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['boulder_beta', v.gymProblemId] }),
  })
}

export function useUnmarkBetaWorked() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { betaId: string; gymProblemId: string }) => {
      const { error } = await supabase.rpc('unmark_beta_worked', { p_beta_id: v.betaId })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['boulder_beta', v.gymProblemId] }),
  })
}

// ---- Reactions / digs on a boulder ----
export function useGymProblemReactions(gymProblemId: string) {
  return useQuery({
    queryKey: ['gym_problem_reactions', gymProblemId],
    enabled: !!gymProblemId,
    queryFn: async (): Promise<BoulderReaction[]> => {
      const { data, error } = await supabase
        .from('gym_problem_reactions')
        .select('*')
        .eq('gym_problem_id', gymProblemId)
      if (error) throw error
      return (data ?? []) as BoulderReaction[]
    },
  })
}

export function useAddGymProblemReaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { gymProblemId: string; emoji: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('gym_problem_reactions')
        .insert({ gym_problem_id: v.gymProblemId, user_id: user?.id, emoji: v.emoji })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['gym_problem_reactions', v.gymProblemId] }),
  })
}

export function useRemoveGymProblemReaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { gymProblemId: string; emoji: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('gym_problem_reactions')
        .delete()
        .eq('gym_problem_id', v.gymProblemId)
        .eq('user_id', user?.id ?? '')
        .eq('emoji', v.emoji)
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['gym_problem_reactions', v.gymProblemId] }),
  })
}
