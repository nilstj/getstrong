import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import type { ProblemReaction } from '../types'

export const REACTION_EMOJIS = [
  { key: 'fire', emoji: '🔥', label: 'Fire' },
  { key: 'crush', emoji: '💪', label: 'Crush' },
  { key: 'ghost', emoji: '👻', label: 'Ghost' },
  { key: 'silent_feet', emoji: '🐾', label: 'Silent Feet' },
  { key: 'clean', emoji: '🎯', label: 'Clean' },
] as const

export function useProblemReactions(problemId: string) {
  return useQuery({
    queryKey: ['reactions', problemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('problem_reactions')
        .select('*')
        .eq('problem_id', problemId)
      if (error) throw error
      return data as ProblemReaction[]
    },
  })
}

export function useAddReaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      problem_id,
      user_id,
      emoji,
    }: {
      problem_id: string
      user_id: string
      emoji: string
    }) => {
      const { data, error } = await supabase
        .from('problem_reactions')
        .insert({ problem_id, user_id, emoji })
        .select()
        .single()
      if (error) throw error
      return data as ProblemReaction
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['reactions', variables.problem_id] })
    },
  })
}

export function useRemoveReaction() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({
      problem_id,
      emoji,
    }: {
      problem_id: string
      emoji: string
    }) => {
      const { error } = await supabase
        .from('problem_reactions')
        .delete()
        .eq('problem_id', problem_id)
        .eq('user_id', user!.id)
        .eq('emoji', emoji)
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['reactions', variables.problem_id] })
    },
  })
}

export function useMyReactions(problemId: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['reactions', problemId, 'mine', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('problem_reactions')
        .select('*')
        .eq('problem_id', problemId)
        .eq('user_id', user!.id)
      if (error) throw error
      return data as ProblemReaction[]
    },
    enabled: !!user,
  })
}
