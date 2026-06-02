import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import type { ProblemTagDefinition } from '../types'

export function useProblemTagDefinitions() {
  return useQuery({
    queryKey: ['problem_tag_definitions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('problem_tag_definitions')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true })
      if (error) throw error
      return data as ProblemTagDefinition[]
    },
  })
}

export function useCreateProblemTagDefinition() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, category }: { name: string; category: string }) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('problem_tag_definitions')
        .insert({ name, category, created_by: session.user.id })
        .select()
        .single()
      if (error) throw error
      return data as ProblemTagDefinition
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['problem_tag_definitions'] })
    },
  })
}

export function useDeleteProblemTagDefinition() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('problem_tag_definitions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['problem_tag_definitions'] })
    },
  })
}

export function useProblemTags(problemId: string) {
  return useQuery({
    queryKey: ['problem_tags', problemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('problem_tag_assignments')
        .select('tag_id, problem_tag_definitions(id, name, category)')
        .eq('problem_id', problemId)
      if (error) throw error
      return (data ?? []).map(r => r.problem_tag_definitions as unknown as ProblemTagDefinition)
    },
    enabled: !!problemId,
  })
}

export function useSessionProblemTags(problemIds: string[]) {
  const key = [...problemIds].sort().join(',')
  return useQuery({
    queryKey: ['session_problem_tags', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('problem_tag_assignments')
        .select('problem_id, problem_tag_definitions(id, name, category)')
        .in('problem_id', problemIds)
      if (error) throw error
      const map: Record<string, ProblemTagDefinition[]> = {}
      for (const row of data ?? []) {
        const tag = row.problem_tag_definitions as unknown as ProblemTagDefinition
        if (!map[row.problem_id]) map[row.problem_id] = []
        map[row.problem_id].push(tag)
      }
      return map
    },
    enabled: problemIds.length > 0,
  })
}

export interface TagStat {
  id: string
  name: string
  category: string
  count: number
}

export function useMyTagStats() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my_tag_stats', user?.id],
    queryFn: async () => {
      const { data: problems } = await supabase
        .from('problems')
        .select('id')
        .eq('user_id', user!.id)
      if (!problems || problems.length === 0) return [] as TagStat[]
      const { data: assignments, error } = await supabase
        .from('problem_tag_assignments')
        .select('tag_id, problem_tag_definitions(id, name, category)')
        .in('problem_id', problems.map(p => p.id))
      if (error) throw error
      const counts: Record<string, TagStat> = {}
      for (const a of assignments ?? []) {
        const tag = a.problem_tag_definitions as unknown as { id: string; name: string; category: string }
        if (!tag) continue
        if (!counts[tag.id]) counts[tag.id] = { id: tag.id, name: tag.name, category: tag.category, count: 0 }
        counts[tag.id].count++
      }
      return Object.values(counts).sort((a, b) => b.count - a.count)
    },
    enabled: !!user?.id,
  })
}

export function useSetProblemTags() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ problemId, tagIds }: { problemId: string; tagIds: string[] }) => {
      const { error: delErr } = await supabase
        .from('problem_tag_assignments')
        .delete()
        .eq('problem_id', problemId)
      if (delErr) throw delErr
      if (tagIds.length > 0) {
        const { error: insErr } = await supabase
          .from('problem_tag_assignments')
          .insert(tagIds.map(tag_id => ({ problem_id: problemId, tag_id })))
        if (insErr) throw insErr
      }
    },
    onSuccess: (_, { problemId }) => {
      queryClient.invalidateQueries({ queryKey: ['problem_tags', problemId] })
      queryClient.invalidateQueries({ queryKey: ['session_problem_tags'] })
    },
  })
}
