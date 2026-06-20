import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import { remainingBudget } from '../utils/bounty'
import { cycleMonth } from '../utils/leaderboard'

export function useMyBountyBudget() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['bounty_budget', user?.id],
    queryFn: async (): Promise<{ staked: number; remaining: number }> => {
      const monthStart = `${cycleMonth(new Date())}-01T00:00:00Z`
      const { data, error } = await supabase
        .from('help_requests')
        .select('bounty')
        .eq('user_id', user!.id)
        .gt('bounty', 0)
        .gte('created_at', monthStart)
      if (error) throw error
      const staked = (data ?? []).reduce((s, r) => s + ((r as { bounty: number }).bounty ?? 0), 0)
      return { staked, remaining: remainingBudget(staked) }
    },
    enabled: !!user,
  })
}
