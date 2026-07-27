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

      const { data: probs, error: pErr } = await supabase
        .from('problems')
        .select('user_id, color, sent')
        .eq('gym', gym)
        .eq('sent', true)
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
