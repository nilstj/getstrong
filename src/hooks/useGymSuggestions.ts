import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { GymSuggestion } from '../types'

export function useGymSuggestions() {
  return useQuery({
    queryKey: ['gym_suggestions'],
    queryFn: async (): Promise<GymSuggestion[]> => {
      const { data, error } = await supabase.rpc('gym_suggestions')
      if (error) throw error
      return (data ?? []) as GymSuggestion[]
    },
    staleTime: 5 * 60 * 1000,
  })
}
