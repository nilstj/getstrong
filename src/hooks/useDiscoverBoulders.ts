import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import { boulderTitle, countMembersByBoulder } from '../utils/boulders'
import { consensusGrade } from '../utils/consensusGrade'
import { isActiveBoulder } from '../utils/gymProblems'
import type { GymProblem, BoulderSummary } from '../types'

export function useDiscoverBoulders() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['discover_boulders', user?.id],
    queryFn: async (): Promise<{ yours: BoulderSummary[]; discover: BoulderSummary[]; archived: BoulderSummary[] }> => {
      // 1. My gyms + the boulders I've already claimed onto.
      const { data: mine, error: e1 } = await supabase
        .from('problems')
        .select('gym, gym_problem_id')
        .eq('user_id', user!.id)
      if (e1) throw e1
      const myRows = (mine ?? []) as { gym: string | null; gym_problem_id: string | null }[]
      const myGyms = Array.from(new Set(myRows.map(r => r.gym).filter((g): g is string => !!g)))
      const myClaimedIds = new Set(
        myRows.map(r => r.gym_problem_id).filter((id): id is string => !!id),
      )
      if (myGyms.length === 0 && myClaimedIds.size === 0) return { yours: [], discover: [], archived: [] }

      // 2. Candidates: active boulders in my gyms, plus every boulder I've claimed
      //    onto (any status, so archived ones I was on surface in the history).
      const boulders = new Map<string, GymProblem>()
      if (myGyms.length > 0) {
        const { data, error } = await supabase
          .from('gym_problems').select('*').eq('status', 'active').in('gym', myGyms)
        if (error) throw error
        for (const b of (data ?? []) as GymProblem[]) boulders.set(b.id, b)
      }
      const claimedIds = Array.from(myClaimedIds)
      if (claimedIds.length > 0) {
        const { data, error } = await supabase
          .from('gym_problems').select('*').in('id', claimedIds)
        if (error) throw error
        for (const b of (data ?? []) as GymProblem[]) boulders.set(b.id, b)
      }
      const list = Array.from(boulders.values())
      if (list.length === 0) return { yours: [], discover: [], archived: [] }
      const now = new Date()
      const activeIds = new Set(list.filter(b => isActiveBoulder(b, now)).map(b => b.id))

      // 3. Crew counts (distinct users per boulder) + flag board climbs.
      // gym_problems don't store a board, so a boulder is a "board problem" when
      // its linked problems carry one (Kilterboard/Moonboard/TB2).
      const ids = list.map(b => b.id)
      const { data: probs, error: e3 } = await supabase
        .from('problems').select('gym_problem_id, user_id, board, grade_value_font').in('gym_problem_id', ids)
      if (e3) throw e3
      const probRows = (probs ?? []) as { gym_problem_id: string | null; user_id: string; board: string | null; grade_value_font: string | null }[]
      const counts = countMembersByBoulder(probRows)
      const boardBoulderIds = new Set(
        probRows.filter(p => p.board && p.gym_problem_id).map(p => p.gym_problem_id as string),
      )
      // gym_problems.community_grade is never populated, so derive a consensus
      // grade from the linked problems' (Font-normalized) grades.
      const gradesByBoulder = new Map<string, (string | null)[]>()
      for (const p of probRows) {
        if (!p.gym_problem_id) continue
        const arr = gradesByBoulder.get(p.gym_problem_id)
        if (arr) arr.push(p.grade_value_font)
        else gradesByBoulder.set(p.gym_problem_id, [p.grade_value_font])
      }

      // Open "help wanted" requests per boulder. Non-fatal: if the table isn't
      // there yet (migration 057 unapplied), degrade to no help indicators
      // rather than breaking the whole discover/home strip.
      const { data: helpRows } = await supabase
        .from('gym_problem_help').select('gym_problem_id').in('gym_problem_id', ids).is('resolved_at', null)
      const helpWantedIds = new Set((helpRows ?? []).map(h => h.gym_problem_id as string))

      const summaries: BoulderSummary[] = list.map(b => ({
        id: b.id,
        title: boulderTitle(b),
        gym: b.gym,
        color: b.color,
        community_grade: b.community_grade ?? consensusGrade(gradesByBoulder.get(b.id) ?? []),
        image_url: b.image_url,
        beta_video_url: b.beta_video_url,
        set_at: b.set_at,
        isBoard: boardBoulderIds.has(b.id),
        helpWanted: helpWantedIds.has(b.id),
        expires_at: b.expires_at,
        crewCount: counts[b.id] ?? 0,
        claimed: myClaimedIds.has(b.id),
      }))

      const active = summaries.filter(s => activeIds.has(s.id))
      const yours = active
        .filter(s => s.claimed)
        .sort((a, b) => (a.expires_at < b.expires_at ? -1 : a.expires_at > b.expires_at ? 1 : 0))
      // Newest-first: a just-shared boulder (crew count 0) must survive the cap,
      // otherwise it never reaches the "Latest" strip that re-sorts by set_at.
      const discover = active
        .filter(s => !s.claimed)
        .sort((a, b) => (a.set_at < b.set_at ? 1 : a.set_at > b.set_at ? -1 : 0))
        .slice(0, 5)
      // Your history: boulders you were on that are no longer active, newest gone first.
      const archived = summaries
        .filter(s => s.claimed && !activeIds.has(s.id))
        .sort((a, b) => (a.expires_at < b.expires_at ? 1 : a.expires_at > b.expires_at ? -1 : 0))

      return { yours, discover, archived }
    },
    enabled: !!user,
  })
}
