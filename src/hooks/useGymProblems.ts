import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { gymProblemMatches, isActiveBoulder } from '../utils/gymProblems'
import type { GymProblem, GymProblemMatchCriteria } from '../types'

// Active boulders for the given gym, newest first.
export function useGymBoulders(gym: string) {
  const g = gym.trim()
  return useQuery({
    queryKey: ['gym_boulders', g.toLowerCase()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gym_problems')
        .select('*')
        .eq('status', 'active')
        .ilike('gym', g)
        .order('created_at', { ascending: false })
      if (error) throw error
      const now = new Date()
      return (data as GymProblem[]).filter(gp => isActiveBoulder(gp, now))
    },
    enabled: g.length > 0,
  })
}

// Active shared boulders in the same gym that match the given color.
export function useMatchingGymProblems(criteria: GymProblemMatchCriteria) {
  const gym = criteria.gym?.trim() ?? ''
  const color = criteria.color?.trim() ?? ''
  return useQuery({
    queryKey: ['gym_problems', 'match', gym.toLowerCase(), color.toLowerCase()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gym_problems')
        .select('*')
        .eq('status', 'active')
        .ilike('gym', gym)
        .order('created_at', { ascending: false })
      if (error) throw error
      const now = new Date()
      return (data as GymProblem[]).filter(gp => gymProblemMatches(gp, criteria) && isActiveBoulder(gp, now))
    },
    enabled: gym.length > 0 && color.length > 0,
  })
}

export function useCreateGymProblem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: {
      gym: string
      color: string | null
      wall_angle: string | null
      name: string | null
      image_url: string | null
    }) => {
      const { data, error } = await supabase.rpc('create_gym_problem', {
        p_gym: values.gym,
        p_color: values.color,
        p_wall_angle: values.wall_angle,
        p_name: values.name,
        p_image_url: values.image_url,
      })
      if (error) throw error
      return data as GymProblem
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym_problems'] })
    },
  })
}

export function useClaimGymProblem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      problemId,
      gymProblemId,
    }: {
      problemId: string
      gymProblemId: string | null
    }) => {
      const { error } = await supabase.rpc('claim_gym_problem', {
        p_problem_id: problemId,
        p_gym_problem_id: gymProblemId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['problems'] })
      queryClient.invalidateQueries({ queryKey: ['gym_problems'] })
      queryClient.invalidateQueries({ queryKey: ['crew'] })
    },
  })
}

export function useStripGymProblem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (gymProblemId: string) => {
      const { error } = await supabase.rpc('strip_gym_problem', { p_gym_problem_id: gymProblemId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym_problem'] })
      queryClient.invalidateQueries({ queryKey: ['gym_problems'] })
      queryClient.invalidateQueries({ queryKey: ['crew'] })
      queryClient.invalidateQueries({ queryKey: ['discover_boulders'] })
    },
  })
}
