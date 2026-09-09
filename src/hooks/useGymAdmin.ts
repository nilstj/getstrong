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
}

/** What a merge would rewrite. Admin-gated server-side. */
export function useGymMergeImpact(label: string | null) {
  return useQuery({
    queryKey: ['gym_merge_impact', label],
    queryFn: async (): Promise<GymMergeImpact> => {
      const { data, error } = await supabase.rpc('gym_merge_impact', { p_from: label! })
      if (error) throw error
      const row = (data as GymMergeImpact[] | null)?.[0]
      if (!row) throw new Error('Could not read the merge impact')
      return row
    },
    enabled: !!label,
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
