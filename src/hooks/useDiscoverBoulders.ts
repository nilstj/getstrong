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
      // 1. My gyms + the boulders I've already claimed onto. "My gyms" is the
      //    union of my default gyms (so a new user who's only set a home gym
      //    still sees its shared boulders) and every gym I've logged a problem at.
      const { data: prof, error: e0 } = await supabase
        .from('profiles')
        .select('default_gyms')
        .eq('id', user!.id)
        .maybeSingle()
      if (e0) throw e0
      const defaultGyms = ((prof?.default_gyms ?? []) as string[]).filter(g => !!g)

      const { data: mine, error: e1 } = await supabase
        .from('problems')
        .select('gym, gym_problem_id, sent')
        .eq('user_id', user!.id)
      if (e1) throw e1
      const myRows = (mine ?? []) as { gym: string | null; gym_problem_id: string | null; sent: boolean }[]
      const myGyms = Array.from(new Set([
        ...defaultGyms,
        ...myRows.map(r => r.gym).filter((g): g is string => !!g),
      ]))
      const myClaimedIds = new Set(
        myRows.map(r => r.gym_problem_id).filter((id): id is string => !!id),
      )
      // "Done" = at least one sent go. A claimed-but-unsent boulder is still a
      // project, so it stays on the not-done side of the filter.
      const mySentIds = new Set(
        myRows.filter(r => r.sent && r.gym_problem_id).map(r => r.gym_problem_id as string),
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

      // 3. Crew counts (distinct users per boulder).
      const ids = list.map(b => b.id)
      const { data: probs, error: e3 } = await supabase
        .from('problems').select('gym_problem_id, user_id, grade_value_font').in('gym_problem_id', ids)
      if (e3) throw e3
      const probRows = (probs ?? []) as { gym_problem_id: string | null; user_id: string; grade_value_font: string | null }[]
      const counts = countMembersByBoulder(probRows)
      // The publisher may set gym_problems.community_grade when they publish
      // the boulder; when they didn't, fall back to a consensus grade derived
      // from the linked problems' (Font-normalized) grades.
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
        hold_color: b.hold_color,
        community_grade: b.community_grade ?? consensusGrade(gradesByBoulder.get(b.id) ?? []),
        image_url: b.image_url,
        beta_video_url: b.beta_video_url,
        set_at: b.set_at,
        helpWanted: helpWantedIds.has(b.id),
        expires_at: b.expires_at,
        crewCount: counts[b.id] ?? 0,
        claimed: myClaimedIds.has(b.id),
        doneByMe: mySentIds.has(b.id),
      }))

      // Both live lists are newest-set first, so the problems added most
      // recently sit at the top of the Gym problems page. Uncapped: the page
      // filters (gym, help wanted, done) would silently miss matches if the
      // list they filter were truncated.
      const byNewest = (a: BoulderSummary, b: BoulderSummary) =>
        a.set_at < b.set_at ? 1 : a.set_at > b.set_at ? -1 : 0
      const active = summaries.filter(s => activeIds.has(s.id))
      const yours = active.filter(s => s.claimed).sort(byNewest)
      const discover = active.filter(s => !s.claimed).sort(byNewest)
      // Your history: boulders you were on that are no longer active, newest gone first.
      const archived = summaries
        .filter(s => s.claimed && !activeIds.has(s.id))
        .sort((a, b) => (a.expires_at < b.expires_at ? 1 : a.expires_at > b.expires_at ? -1 : 0))

      return { yours, discover, archived }
    },
    enabled: !!user,
  })
}
