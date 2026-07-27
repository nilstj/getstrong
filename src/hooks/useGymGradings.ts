import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { GymGrading } from '../types'

export function useGymGradings(gym: string | null | undefined) {
  return useQuery({
    queryKey: ['gym_gradings', gym],
    queryFn: async (): Promise<GymGrading[]> => {
      const { data, error } = await supabase
        .from('gym_gradings')
        .select('gym, color_name, rank, points')
        .eq('gym', gym!)
        .order('rank', { ascending: true })
      if (error) throw error
      return (data ?? []) as GymGrading[]
    },
    enabled: !!gym,
  })
}

export function useSaveGymGradings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ gym, rows }: { gym: string; rows: { color_name: string; rank: number; points: number }[] }) => {
      const { error } = await supabase.rpc('save_gym_gradings', { p_gym: gym, p_rows: rows })
      if (error) throw error
    },
    onSuccess: (_, { gym }) => {
      queryClient.invalidateQueries({ queryKey: ['gym_gradings', gym] })
    },
  })
}
