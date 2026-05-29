import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { ExerciseTemplate } from '../types'

export function useExerciseTemplates() {
  return useQuery({
    queryKey: ['exercise_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exercise_templates')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      return data as ExerciseTemplate[]
    },
  })
}

export function useCreateExerciseTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: Pick<ExerciseTemplate, 'name' | 'type' | 'description'>) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('exercise_templates')
        .insert({ ...values, created_by: session.user.id })
        .select()
        .single()
      if (error) throw error
      return data as ExerciseTemplate
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise_templates'] })
    },
  })
}

export function useDeleteExerciseTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('exercise_templates')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise_templates'] })
    },
  })
}
