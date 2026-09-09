import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface GymMergeImpact {
  problems: number
  boulders: number
  sessions: number
  session_groups: number
  crews: number
  crew_plans: number
  award_rounds: number
  gradings: number
  climbers: number
  announcements: number
  beta_points: number
  /** Rows a merge into this particular target would DELETE, not move. */
  gradings_discarded: number
  award_rounds_discarded: number
}

/**
 * What a merge would rewrite, and what it would destroy. `toLabel` is what
 * makes the discarded counts real — without a target nothing collides, so they
 * are 0 until one is picked.
 */
export function useGymMergeImpact(fromLabel: string | null, toLabel: string | null) {
  return useQuery({
    queryKey: ['gym_merge_impact', fromLabel, toLabel],
    queryFn: async (): Promise<GymMergeImpact> => {
      const { data, error } = await supabase.rpc('gym_merge_impact', { p_from: fromLabel!, p_to: toLabel })
      if (error) throw error
      const row = (data as GymMergeImpact[] | null)?.[0]
      if (!row) throw new Error('Could not read the merge impact')
      return row
    },
    enabled: !!fromLabel,
  })
}

function useGymMutation<TVars>(fn: (vars: TVars) => Promise<void>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      // A rename or merge rewrites the gym string in twelve columns, so
      // anything keyed on a gym is now stale — not just the registry.
      queryClient.invalidateQueries()
    },
  })
}

export function useSetGymVerified() {
  return useGymMutation(async ({ id, verified }: { id: string; verified: boolean }) => {
    const { error } = await supabase.rpc('set_gym_verified', { p_id: id, p_verified: verified })
    if (error) throw error
  })
}

export function useRenameGym() {
  return useGymMutation(async ({ id, name, city }: { id: string; name: string; city: string | null }) => {
    const { error } = await supabase.rpc('rename_gym', { p_id: id, p_name: name, p_city: city })
    if (error) throw error
  })
}

export function useMergeGyms() {
  return useGymMutation(async ({ from, to }: { from: string; to: string }) => {
    const { error } = await supabase.rpc('merge_gyms', { p_from: from, p_to: to })
    if (error) throw error
  })
}
