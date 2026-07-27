import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { buildGradeLeaderboard, type GradeProblemRow } from '../utils/gradeLeaderboard'
import type { GymGrading, LeaderboardEntry } from '../types'

export function useGymGradeLeaderboard(gym: string) {
  return useQuery({
    queryKey: ['grade_leaderboard', gym],
    queryFn: async (): Promise<LeaderboardEntry[]> => {
      const { data: gradings, error: gErr } = await supabase
        .from('gym_gradings')
        .select('gym, color_name, rank, points')
        .eq('gym', gym)
      if (gErr) throw gErr

      // v1: client-side aggregation; explicit cap makes the (unlikely at current
      // gym volumes) truncation non-silent. Revisit with a server-side
      // aggregation RPC if a gym exceeds this.
      const { data: probs, error: pErr } = await supabase
        .from('problems')
        .select('user_id, color, sent, gym_problem_id, name, grade_value')
        .eq('gym', gym)
        .eq('sent', true)
        .range(0, 99999)
      if (pErr) throw pErr
      const rows = (probs ?? []) as GradeProblemRow[]

      const userIds = Array.from(new Set(rows.map(r => r.user_id)))
      let profiles: { id: string; username: string | null; avatar_url: string | null }[] = []
      if (userIds.length > 0) {
        const { data: profs, error: prErr } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', userIds)
        if (prErr) throw prErr
        profiles = (profs ?? []) as { id: string; username: string | null; avatar_url: string | null }[]
      }

      return buildGradeLeaderboard(rows, (gradings ?? []) as GymGrading[], profiles)
    },
    enabled: !!gym,
  })
}
