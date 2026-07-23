import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Problem } from '../types'
import { vScaleToFont, fontToVScale } from '../utils/grades'

export function useAllProblems() {
  return useQuery({
    queryKey: ['problems'],
    queryFn: async () => {
      // Outdoor bouldering is out of scope for v1 — a non-null `crag` marks an
      // outdoor problem, so we exclude those everywhere problems are read.
      const { data, error } = await supabase.from('problems').select('*').is('crag', null)
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
        .is('crag', null)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as Problem[]
    },
  })
}

export function useUpdateProblem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, sessionId, tagIds, ...values }: Partial<Omit<Problem, 'user_id' | 'created_at'>> & { id: string; sessionId: string; tagIds?: string[] }) => {
      // Recompute the normalized grade fields when the grade is edited (the edit
      // form always sends grade_system). Without this, grade_value_font stays
      // stale/null and boulder consensus grades never reflect the change.
      const patch: Partial<Omit<Problem, 'user_id' | 'created_at'>> = { ...values }
      if (values.grade_system !== undefined) {
        let font: string | null = null
        let vscale: string | null = null
        if (values.grade_value && values.grade_system !== 'color') {
          const { data: mappings } = await supabase.from('grade_mappings').select('*')
          const m = mappings ?? []
          if (values.grade_system === 'font') {
            font = values.grade_value
            vscale = fontToVScale(values.grade_value, m)
          } else {
            vscale = values.grade_value
            font = vScaleToFont(values.grade_value, m)
          }
        }
        patch.grade_value_font = font
        patch.grade_value_vscale = vscale
      }
      const { data: updated, error } = await supabase.from('problems').update(patch).eq('id', id).select('gym_problem_id').single()
      if (error) throw error
      // Keep a linked shared boulder's hold colour in sync when this problem's is edited.
      if (updated?.gym_problem_id && 'hold_color' in values) {
        const { error: hcErr } = await supabase.rpc('set_boulder_hold_color', {
          p_gym_problem_id: updated.gym_problem_id,
          p_hold_color: values.hold_color ?? null,
        })
        if (hcErr) throw hcErr
      }
      if (tagIds !== undefined) {
        await supabase.from('problem_tag_assignments').delete().eq('problem_id', id)
        if (tagIds.length > 0) {
          await supabase.from('problem_tag_assignments').insert(tagIds.map(tag_id => ({ problem_id: id, tag_id })))
        }
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['problems', variables.sessionId] })
      queryClient.invalidateQueries({ queryKey: ['session_problem_tags'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['crew'] })
      queryClient.invalidateQueries({ queryKey: ['gym_problem'] })
      queryClient.invalidateQueries({ queryKey: ['discover_boulders'] })
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
    mutationFn: async (values: Omit<Problem, 'id' | 'user_id' | 'created_at' | 'grade_value_font' | 'grade_value_vscale' | 'gym_problem_id'> & { tagIds?: string[] }) => {
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

      const { tagIds, ...problemValues } = values
      const { data, error } = await supabase
        .from('problems')
        .insert({ ...problemValues, user_id: session.user.id, grade_value_font, grade_value_vscale })
        .select()
        .single()
      if (error) throw error

      if (tagIds && tagIds.length > 0) {
        await supabase
          .from('problem_tag_assignments')
          .insert(tagIds.map(tag_id => ({ problem_id: data.id, tag_id })))
      }

      return data as Problem
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['problems', variables.session_id] })
      queryClient.invalidateQueries({ queryKey: ['problems'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['session_problem_tags'] })
    },
  })
}
