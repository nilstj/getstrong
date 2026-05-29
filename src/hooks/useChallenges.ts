import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Challenge, ChallengeAttempt } from '../types'

export function useChallenges() {
  return useQuery({
    queryKey: ['challenges'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('challenges')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Challenge[]
    },
  })
}

export function useCreateChallenge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: Pick<Challenge, 'title' | 'description'>) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('challenges')
        .insert({ ...values, creator_id: session.user.id })
        .select()
        .single()
      if (error) throw error
      return data as Challenge
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenges'] })
    },
  })
}

export function useChallengeAttempts(challengeId: string) {
  return useQuery({
    queryKey: ['challenge_attempts', challengeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('challenge_attempts')
        .select('*')
        .eq('challenge_id', challengeId)
      if (error) throw error
      return data as ChallengeAttempt[]
    },
  })
}

export function useSessionChallengeAttempts(sessionId: string) {
  return useQuery({
    queryKey: ['challenge_attempts', 'session', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('challenge_attempts')
        .select('*, challenges(title)')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as (ChallengeAttempt & { challenges: { title: string } })[]
    },
  })
}

export function useAddChallengeAttempt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: Pick<ChallengeAttempt, 'challenge_id' | 'session_id' | 'completed' | 'notes'>) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('challenge_attempts')
        .insert({ ...values, user_id: session.user.id })
        .select()
        .single()
      if (error) throw error
      return data as ChallengeAttempt
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['challenge_attempts'] })
      if (variables.session_id) {
        queryClient.invalidateQueries({ queryKey: ['challenge_attempts', 'session', variables.session_id] })
      }
    },
  })
}
