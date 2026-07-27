import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { buildGradeLeaderboard, type GradeProblemRow } from '../utils/gradeLeaderboard'
import { monthBounds } from '../utils/leaderboard'
import type { GymGrading, LeaderboardEntry } from '../types'

/**
 * Grade score for one gym over one cycle month ('YYYY-MM').
 *
 * The month is taken from problems.created_at — when the send was logged — not
 * from the session's date: sessions is not readable across users (see
 * migration 032), so joining it would silently drop other climbers' rows.
 * Consequence: a boulder climbed on the last of the month but logged the next
 * day counts for the following month.
 */
export function useGymGradeLeaderboard(gym: string, month: string) {
  return useQuery({
    queryKey: ['grade_leaderboard', gym, month],
    queryFn: async (): Promise<LeaderboardEntry[]> => {
      const { data: gradings, error: gErr } = await supabase
        .from('gym_gradings')
        .select('gym, color_name, rank, points')
        .eq('gym', gym)
      if (gErr) throw gErr

      // v1: client-side aggregation over one month of one gym's sends. The
      // explicit cap makes the (now very unlikely) truncation non-silent.
      // Revisit with a server-side aggregation RPC if a gym exceeds this.
      const { start, end } = monthBounds(month)
      const { data: probs, error: pErr } = await supabase
        .from('problems')
        .select('user_id, color, sent, gym_problem_id, name, grade_value')
        .eq('gym', gym)
        .eq('sent', true)
        .gte('created_at', start)
        .lt('created_at', end)
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
    enabled: !!gym && !!month,
  })
}
