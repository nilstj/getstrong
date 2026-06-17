import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import type { BadgeKey } from '../types'

export interface BadgesResult {
  badges: { badge: BadgeKey; earned_at: string }[]
  // helpful-marked response count — accurate for the current user; for other
  // users it only counts responses the viewer is allowed to see, so use the
  // public `badges` list for display and this only for own-profile progress.
  helpfulCount: number
}

export function useUserBadges(userId?: string) {
  const { user } = useAuth()
  const id = userId ?? user?.id
  return useQuery({
    queryKey: ['user_badges', id],
    queryFn: async (): Promise<BadgesResult> => {
      const [badgesRes, countRes] = await Promise.all([
        supabase.from('user_badges').select('badge, earned_at').eq('user_id', id!),
        supabase
          .from('help_responses')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', id!)
          .eq('helpful', true),
      ])
      if (badgesRes.error) throw badgesRes.error
      if (countRes.error) throw countRes.error
      return {
        badges: (badgesRes.data ?? []) as { badge: BadgeKey; earned_at: string }[],
        helpfulCount: countRes.count ?? 0,
      }
    },
    enabled: !!id,
  })
}
