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
      hold_color: string | null
      wall_angle: string | null
      name: string | null
      image_url: string | null
      beta_video_url: string | null
      community_grade: string | null
    }) => {
      const { data, error } = await supabase.rpc('create_gym_problem', {
        p_gym: values.gym,
        p_color: values.color,
        p_hold_color: values.hold_color,
        p_wall_angle: values.wall_angle,
        p_name: values.name,
        p_image_url: values.image_url,
        p_beta_video_url: values.beta_video_url,
        p_community_grade: values.community_grade,
      })
      if (error) throw error
      return data as GymProblem
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym_problems'] })
      queryClient.invalidateQueries({ queryKey: ['discover_boulders'] })
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
      queryClient.invalidateQueries({ queryKey: ['discover_boulders'] })
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

export function useDeleteGymProblem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (gymProblemId: string) => {
      const { error } = await supabase.rpc('delete_gym_problem', { p_gym_problem_id: gymProblemId })
      if (error) throw error
    },
    onSuccess: (_data, gymProblemId) => {
      queryClient.invalidateQueries({ queryKey: ['gym_problems'] })
      queryClient.invalidateQueries({ queryKey: ['discover_boulders'] })
      // Migration 078 takes the setter's own variations with the boulder, so
      // /challenges (and the invitation a variation may have been sent through)
      // must drop them too, for the mirror-image reason useCreateVariation
      // invalidates ['challenges'] when a variation is set. ['challenge_invitations']
      // is the key useReceivedChallenges reads — challenge_invitations.challenge_id
      // cascades on delete (migration 005), so the invitation row is gone
      // server-side the instant 078 deletes the variation, and without this the
      // recipient's client keeps listing it for up to 60 seconds, now carrying
      // gym and colour identity that makes it look more real than before.
      queryClient.invalidateQueries({ queryKey: ['challenges'] })
      queryClient.invalidateQueries({ queryKey: ['challenge_invitations'] })
      queryClient.invalidateQueries({ queryKey: ['variations', gymProblemId] })
    },
  })
}
