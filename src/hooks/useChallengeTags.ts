import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface ChallengeTagDefinition {
  id: string
  name: string
  created_by: string | null
  created_at: string
}

export function useChallengeTags() {
  return useQuery({
    queryKey: ['challenge_tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('challenge_tags')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      return data as ChallengeTagDefinition[]
    },
  })
}

export function useCreateChallengeTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('challenge_tags')
        .insert({ name: name.trim(), created_by: session.user.id })
        .select()
        .single()
      if (error) throw error
      return data as ChallengeTagDefinition
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenge_tags'] })
    },
  })
}

export function useDeleteChallengeTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('challenge_tags').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenge_tags'] })
    },
  })
}
