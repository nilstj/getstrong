import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Exercise } from '../types'

export function useSessionExercises(sessionId: string) {
  return useQuery({
    queryKey: ['exercises', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as Exercise[]
    },
  })
}

export function useAddExercise() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: Omit<Exercise, 'id' | 'user_id' | 'created_at'>) => {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase
        .from('exercises')
        .insert({ ...values, user_id: session!.user.id })
        .select()
        .single()
      if (error) throw error
      return data as Exercise
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['exercises', variables.session_id] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
