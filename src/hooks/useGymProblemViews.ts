import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'

const VIEWS_KEY = ['gym_problem_views']

/**
 * The set of gym problems the current user has already opened. Drives the
 * blue (unseen) vs grey (seen) ring on the home page's Latest Gym Problems
 * strip. Non-fatal: if migration 073 isn't applied yet the query degrades to
 * an empty set, so every ring simply reads as unseen.
 */
export function useSeenGymProblems() {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...VIEWS_KEY, user?.id],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('gym_problem_views')
        .select('gym_problem_id')
        .eq('user_id', user!.id)
      if (error) return new Set()
      return new Set((data ?? []).map(r => r.gym_problem_id as string))
    },
    enabled: !!user,
  })
}

/** Record that the user opened a boulder. Idempotent; refreshes viewed_at. */
export function useMarkGymProblemViewed() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (gymProblemId: string) => {
      const { error } = await supabase
        .rpc('mark_gym_problem_viewed', { p_gym_problem_id: gymProblemId })
      if (error) throw error
    },
    // Flip the ring immediately, before the round trip lands.
    onMutate: async (gymProblemId: string) => {
      const key = [...VIEWS_KEY, user?.id]
      await queryClient.cancelQueries({ queryKey: key })
      const prev = queryClient.getQueryData<Set<string>>(key)
      if (prev) queryClient.setQueryData(key, new Set([...prev, gymProblemId]))
      return { prev }
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData([...VIEWS_KEY, user?.id], ctx.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: VIEWS_KEY })
    },
  })
}
