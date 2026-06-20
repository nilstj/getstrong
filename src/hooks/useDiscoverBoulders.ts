import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import { boulderTitle, countMembersByBoulder } from '../utils/boulders'
import { isActiveBoulder } from '../utils/gymProblems'
import type { GymProblem, BoulderSummary } from '../types'

export function useDiscoverBoulders() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['discover_boulders', user?.id],
    queryFn: async (): Promise<{ yours: BoulderSummary[]; discover: BoulderSummary[] }> => {
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
      if (myGyms.length === 0 && myClaimedIds.size === 0) return { yours: [], discover: [] }

      // 2. Candidate boulders: active ones in my gyms, plus any I'm claimed onto.
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
          .from('gym_problems').select('*').eq('status', 'active').in('id', claimedIds)
        if (error) throw error
        for (const b of (data ?? []) as GymProblem[]) boulders.set(b.id, b)
      }
      const list = Array.from(boulders.values())
      const now = new Date()
      const activeList = list.filter(b => isActiveBoulder(b, now))
      if (activeList.length === 0) return { yours: [], discover: [] }

      // 3. Crew counts (distinct users per boulder).
      const ids = activeList.map(b => b.id)
      const { data: probs, error: e3 } = await supabase
        .from('problems').select('gym_problem_id, user_id').in('gym_problem_id', ids)
      if (e3) throw e3
      const counts = countMembersByBoulder(
        (probs ?? []) as { gym_problem_id: string | null; user_id: string }[],
      )

      const summaries: BoulderSummary[] = activeList.map(b => ({
        id: b.id,
        title: boulderTitle(b),
        gym: b.gym,
        color: b.color,
        expires_at: b.expires_at,
        crewCount: counts[b.id] ?? 0,
        claimed: myClaimedIds.has(b.id),
      }))

      const yours = summaries
        .filter(s => s.claimed)
        .sort((a, b) => (a.expires_at < b.expires_at ? -1 : a.expires_at > b.expires_at ? 1 : 0))
      const discover = summaries
        .filter(s => !s.claimed)
        .sort((a, b) => b.crewCount - a.crewCount)
        .slice(0, 5)

      return { yours, discover }
    },
    enabled: !!user,
  })
}
