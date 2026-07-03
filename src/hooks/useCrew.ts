import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { buildCrew, summarizeCrew } from '../utils/crew'
import { consensusGrade } from '../utils/consensusGrade'
import type { GymProblem, CrewMember, CrewSummary, CrewProblemRow } from '../types'

export function useGymProblem(id: string) {
  return useQuery({
    queryKey: ['gym_problem', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gym_problems')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as GymProblem
    },
    enabled: !!id,
  })
}

export function useCrew(gymProblemId: string) {
  return useQuery({
    queryKey: ['crew', gymProblemId],
    queryFn: async (): Promise<{ members: CrewMember[]; summary: CrewSummary; problems: CrewProblemRow[]; communityGrade: string | null }> => {
      const { data: probs, error } = await supabase
        .from('problems')
        .select('user_id, sent, attempts, created_at, grade_value_font')
        .eq('gym_problem_id', gymProblemId)
      if (error) throw error
      const problems = (probs ?? []) as { user_id: string; sent: boolean; attempts: number; created_at: string; grade_value_font: string | null }[]

      const userIds = Array.from(new Set(problems.map(p => p.user_id)))
      const profileById = new Map<string, { username: string | null; avatar_url: string | null }>()
      if (userIds.length > 0) {
        const { data: profiles, error: pErr } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', userIds)
        if (pErr) throw pErr
        for (const pr of (profiles ?? []) as { id: string; username: string | null; avatar_url: string | null }[]) {
          profileById.set(pr.id, { username: pr.username, avatar_url: pr.avatar_url })
        }
      }

      const rows: CrewProblemRow[] = problems.map(p => ({
        user_id: p.user_id,
        username: profileById.get(p.user_id)?.username ?? null,
        avatar_url: profileById.get(p.user_id)?.avatar_url ?? null,
        sent: p.sent,
        attempts: p.attempts,
        created_at: p.created_at,
      }))

      const members = buildCrew(rows)
      // gym_problems.community_grade is never populated, so derive it from the
      // linked problems' Font-normalized grades (matches the discover feed).
      const communityGrade = consensusGrade(problems.map(p => p.grade_value_font))
      return { members, summary: summarizeCrew(members), problems: rows, communityGrade }
    },
    enabled: !!gymProblemId,
  })
}
