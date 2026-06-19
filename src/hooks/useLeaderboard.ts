import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { buildLeaderboard } from '../utils/leaderboard'
import type { BetaPointRow, LeaderboardEntry } from '../types'

export function useGymLeaderboard(gym: string, cycleMonth: string) {
  return useQuery({
    queryKey: ['leaderboard', gym, cycleMonth],
    queryFn: async (): Promise<LeaderboardEntry[]> => {
      const { data: pts, error } = await supabase
        .from('beta_points')
        .select('user_id, points')
        .eq('gym', gym)
        .eq('cycle_month', cycleMonth)
      if (error) throw error
      const rows = (pts ?? []) as BetaPointRow[]

      const userIds = Array.from(new Set(rows.map(r => r.user_id)))
      let profiles: { id: string; username: string | null; avatar_url: string | null }[] = []
      if (userIds.length > 0) {
        const { data: profs, error: pErr } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', userIds)
        if (pErr) throw pErr
        profiles = (profs ?? []) as { id: string; username: string | null; avatar_url: string | null }[]
      }

      return buildLeaderboard(rows, profiles)
    },
    enabled: !!gym && !!cycleMonth,
  })
}
