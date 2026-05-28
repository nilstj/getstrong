import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Problem } from '../types'

export function useAllProblems() {
  return useQuery({
    queryKey: ['problems'],
    queryFn: async () => {
      const { data, error } = await supabase.from('problems').select('*')
      if (error) throw error
      return data as Problem[]
    },
  })
}

export function useSessionProblems(sessionId: string) {
  return useQuery({
    queryKey: ['problems', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('problems')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as Problem[]
    },
  })
}

export function useAddProblem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: Omit<Problem, 'id' | 'user_id' | 'created_at'>) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('problems')
        .insert({ ...values, user_id: session.user.id })
        .select()
        .single()
      if (error) throw error
      return data as Problem
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['problems', variables.session_id] })
      queryClient.invalidateQueries({ queryKey: ['problems'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
