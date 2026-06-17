import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'

export interface ProblemComment {
  id: string
  problem_id: string
  user_id: string
  body: string
  created_at: string
}

export function useProblemComments(problemId: string) {
  return useQuery({
    queryKey: ['problem_comments', problemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('problem_comments')
        .select('*')
        .eq('problem_id', problemId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as ProblemComment[]
    },
  })
}

export function useProblemCommentCounts(problemIds: string[]) {
  const sortedKey = problemIds.slice().sort().join(',')
  return useQuery({
    queryKey: ['problem_comment_counts', sortedKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('problem_comments')
        .select('problem_id')
        .in('problem_id', problemIds)
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const row of data ?? []) {
        counts[row.problem_id] = (counts[row.problem_id] ?? 0) + 1
      }
      return counts
    },
    enabled: problemIds.length > 0,
  })
}

export function usePostProblemComment() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({ problemId, body }: { problemId: string; body: string }) => {
      const { data, error } = await supabase
        .from('problem_comments')
        .insert({ problem_id: problemId, user_id: user!.id, body })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as ProblemComment
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['problem_comments', data.problem_id] })
      queryClient.invalidateQueries({ queryKey: ['problem_comment_counts'] })
    },
  })
}

