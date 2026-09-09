import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { GymOption } from '../types'

/** The raw shape gym_suggestions() returns. `name` is the label — see 092. */
interface GymSuggestionRow {
  name: string
  uses: number | string
  id: string
  gym_name: string
  city: string | null
  label: string
  verified: boolean
  climber_added: boolean
}

/**
 * What create_gym returns — its own shape, not gym_suggestions'. `name` here
 * is the bare gym name (gym_suggestions returns the label under that key for
 * the deployed client's sake), so this maps straight onto GymOption.
 */
interface CreateGymRow {
  id: string
  name: string
  city: string | null
  label: string
  verified: boolean
  climber_added: boolean
}

function toGymOption(row: GymSuggestionRow): GymOption {
  return {
    id: row.id,
    name: row.gym_name,
    city: row.city,
    label: row.label,
    verified: row.verified,
    climber_added: row.climber_added,
    uses: Number(row.uses) || 0,
  }
}

/**
 * The gym registry, most relevant first. Query key unchanged from the
 * free-text era so nothing else's invalidation has to move.
 */
export function useGymSuggestions() {
  return useQuery({
    queryKey: ['gym_suggestions'],
    queryFn: async (): Promise<GymOption[]> => {
      const { data, error } = await supabase.rpc('gym_suggestions')
      if (error) throw error
      return ((data ?? []) as GymSuggestionRow[]).map(toGymOption)
    },
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Adds a gym. create_gym is idempotent, so a racing duplicate comes back as
 * the existing row rather than an error — the caller can treat every success
 * as "here is your gym".
 */
export function useCreateGym() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, city }: { name: string; city: string | null }): Promise<GymOption> => {
      const { data, error } = await supabase.rpc('create_gym', { p_name: name, p_city: city })
      if (error) throw error
      const row = (data as CreateGymRow[] | null)?.[0]
      if (!row) throw new Error('The gym could not be added')
      return { ...row, uses: 0 }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym_suggestions'] })
    },
  })
}
