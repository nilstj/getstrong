import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Problem } from '../types'
import { vScaleToFont, fontToVScale } from '../utils/grades'

export function useConvertProblemsGradeScale() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (newScale: 'font' | 'v_scale') => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const [{ data: problems, error: pErr }, { data: mappings, error: mErr }] = await Promise.all([
        supabase.from('problems').select('id, grade_system, grade_value').eq('user_id', session.user.id),
        supabase.from('grade_mappings').select('*'),
      ])
      if (pErr) throw pErr
      if (mErr) throw mErr

      const toUpdate = (problems ?? [])
        .filter(p => p.grade_system !== 'color' && p.grade_system !== newScale && p.grade_value)
        .map(p => ({
          id: p.id,
          grade_system: newScale,
          grade_value: newScale === 'font'
            ? vScaleToFont(p.grade_value, mappings ?? [])
            : fontToVScale(p.grade_value, mappings ?? []),
        }))

      if (toUpdate.length > 0) {
        await Promise.all(
          toUpdate.map(p =>
            supabase.from('problems').update({ grade_system: p.grade_system, grade_value: p.grade_value }).eq('id', p.id)
          )
        )
      }

      return toUpdate.length
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['problems'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

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
