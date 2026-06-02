import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { ChallengeBeta } from '../types'

export function useChallengeBetas(challengeId: string) {
  return useQuery({
    queryKey: ['challenge_betas', challengeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('challenge_betas')
        .select('*, beta_helpful(count)')
        .eq('challenge_id', challengeId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as (ChallengeBeta & { beta_helpful: { count: number }[] })[]
    },
  })
}

export function useAddBeta() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: { challenge_id: string; crux: string | null; footwork: string | null; sequence: string | null }) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('challenge_betas')
        .insert({ ...values, user_id: session.user.id })
        .select()
        .single()
      if (error) throw error
      return data as ChallengeBeta
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['challenge_betas', variables.challenge_id] })
    },
  })
}

export function useDeleteBeta() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; challengeId: string }) => {
      const { error } = await supabase.from('challenge_betas').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['challenge_betas', variables.challengeId] })
    },
  })
}

export function useMarkBetaHelpful() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ betaId }: { betaId: string; challengeId: string }) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('beta_helpful')
        .upsert({ beta_id: betaId, user_id: session.user.id })
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['challenge_betas', variables.challengeId] })
    },
  })
}

export function useUnmarkBetaHelpful() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ betaId }: { betaId: string; challengeId: string }) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('beta_helpful')
        .delete()
        .eq('beta_id', betaId)
        .eq('user_id', session.user.id)
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['challenge_betas', variables.challengeId] })
    },
  })
}
