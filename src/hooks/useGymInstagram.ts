import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * `gyms.label` -> Instagram handle, for every gym that has one. Cached app-wide
 * and consulted by <GymInstagramLink>, so the glyph can render next to any gym
 * name without threading a handle through every query that carries a gym string.
 *
 * Keyed by label, not id, because the label is what all twelve gym columns in
 * this app actually store (see migration 092).
 *
 * `merged_into is null` matters: a gym folded into another keeps its row, and
 * without the filter it could supply a handle for a label the app no longer
 * writes anywhere.
 *
 * Deliberately its own query rather than a column on the boulder query. Before
 * migration 094 is applied this one fails, the glyph is simply absent, and
 * nothing else on the boulder page is affected.
 *
 * This is the only client read that queries `gyms` directly instead of going
 * through the `gym_suggestions()` RPC (which is granted to `anon`). `gyms`'
 * SELECT policy is `auth.role() = 'authenticated'`, so this needs a signed-in
 * session — fine today because the boulder page sits behind `ProtectedRoute`,
 * but revisit this read if a boulder page ever becomes publicly shareable, or
 * the glyph will silently vanish for a signed-out visitor.
 */
export function useGymInstagramHandles() {
  return useQuery({
    queryKey: ['gym_instagram_handles'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gyms')
        .select('label, instagram_handle')
        .not('instagram_handle', 'is', null)
        .is('merged_into', null)
      if (error) throw error
      const byLabel = new Map<string, string>()
      for (const row of data ?? []) {
        byLabel.set(row.label as string, row.instagram_handle as string)
      }
      return byLabel
    },
  })
}
