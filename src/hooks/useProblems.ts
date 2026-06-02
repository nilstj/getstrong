import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Problem } from '../types'
import { vScaleToFont, fontToVScale } from '../utils/grades'

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

export function useDeleteProblem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, sessionId }: { id: string; sessionId: string }) => {
      const { error } = await supabase.from('problems').delete().eq('id', id)
      if (error) throw error
      return sessionId
    },
    onSuccess: (sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['problems', sessionId] })
      queryClient.invalidateQueries({ queryKey: ['problems'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useAddProblem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: Omit<Problem, 'id' | 'user_id' | 'created_at' | 'grade_value_font' | 'grade_value_vscale'>) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      let grade_value_font: string | null = null
      let grade_value_vscale: string | null = null

      if (values.grade_value && values.grade_system !== 'color') {
        const { data: mappings } = await supabase.from('grade_mappings').select('*')
        const m = mappings ?? []
        if (values.grade_system === 'font') {
          grade_value_font = values.grade_value
          grade_value_vscale = fontToVScale(values.grade_value, m)
        } else {
          grade_value_vscale = values.grade_value
          grade_value_font = vScaleToFont(values.grade_value, m)
        }
      }

      const { data, error } = await supabase
        .from('problems')
        .insert({ ...values, user_id: session.user.id, grade_value_font, grade_value_vscale })
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
