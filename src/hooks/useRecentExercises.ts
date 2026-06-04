import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Exercise } from '../types'

export function useRecentExercises(sessionIds: string[]) {
  return useQuery({
    queryKey: ['exercises', 'recent', sessionIds],
    queryFn: async () => {
      if (sessionIds.length === 0) return [] as Exercise[]
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .in('session_id', sessionIds)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Exercise[]
    },
    enabled: sessionIds.length > 0,
  })
}
