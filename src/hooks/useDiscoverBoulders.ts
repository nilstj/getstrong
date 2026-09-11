import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import { boulderTitle } from '../utils/boulders'
import { consensusGradeFromCounts } from '../utils/consensusGrade'
import { isActiveBoulder } from '../utils/gymProblems'
import { buildBetaRequests } from '../utils/betaRequests'
import type { BetaRequest } from '../utils/betaRequests'
import type { GymProblem, BoulderSummary } from '../types'

/**
 * One row of get_boulder_crew_stats (migration 097): how many climbers have been
 * on a boulder, and how often each grade was logged on it. Both used to be
 * reduced on the phone from every problem row linked to every boulder at your
 * gyms — a row set that grew with the gym's membership, to render two numbers.
 */
interface BoulderCrewStats {
  gym_problem_id: string
  crew_count: number
  grade_counts: Record<string, number>
}

export function useDiscoverBoulders() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['discover_boulders', user?.id],
    queryFn: async (): Promise<{
      yours: BoulderSummary[]
      discover: BoulderSummary[]
      archived: BoulderSummary[]
      betaRequests: BetaRequest[]
    }> => {
      // This hook feeds the home page, so its round trips are what a climber
      // waits on standing in the gym. Everything below is grouped into waves of
      // genuinely independent queries; only a real data dependency is allowed to
      // cost another trip. Four waves, where this used to be eight in a row.

      // 1. My gyms + the boulders I've already claimed onto. "My gyms" is the
      //    union of my default gyms (so a new user who's only set a home gym
      //    still sees its shared boulders) and every gym I've logged a problem at.
      const [profRes, mineRes] = await Promise.all([
        supabase.from('profiles').select('default_gyms').eq('id', user!.id).maybeSingle(),
        supabase.from('problems').select('gym, gym_problem_id, sent').eq('user_id', user!.id),
      ])
      if (profRes.error) throw profRes.error
      if (mineRes.error) throw mineRes.error
      const defaultGyms = ((profRes.data?.default_gyms ?? []) as string[]).filter(g => !!g)
      const myRows = (mineRes.data ?? []) as { gym: string | null; gym_problem_id: string | null; sent: boolean }[]
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
      if (myGyms.length === 0 && myClaimedIds.size === 0) return { yours: [], discover: [], archived: [], betaRequests: [] }

      // 2. Candidates: active boulders in my gyms, plus every boulder I've claimed
      //    onto (any status, so archived ones I was on surface in the history).
      const claimedIds = Array.from(myClaimedIds)
      const [byGymRes, claimedRes] = await Promise.all([
        myGyms.length > 0
          ? supabase.from('gym_problems').select('*').eq('status', 'active').in('gym', myGyms)
          : Promise.resolve({ data: [], error: null }),
        claimedIds.length > 0
          ? supabase.from('gym_problems').select('*').in('id', claimedIds)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (byGymRes.error) throw byGymRes.error
      if (claimedRes.error) throw claimedRes.error
      const boulders = new Map<string, GymProblem>()
      for (const b of (byGymRes.data ?? []) as GymProblem[]) boulders.set(b.id, b)
      for (const b of (claimedRes.data ?? []) as GymProblem[]) boulders.set(b.id, b)
      const list = Array.from(boulders.values())
      if (list.length === 0) return { yours: [], discover: [], archived: [], betaRequests: [] }
      const now = new Date()
      const activeIds = new Set(list.filter(b => isActiveBoulder(b, now)).map(b => b.id))

      // 3. Everything hanging off those boulders. All three read the same id
      //    list and nothing reads another's answer, so they go out together.
      const ids = list.map(b => b.id)
      const [statsRes, helpRes, variationRes] = await Promise.all([
        // Crew counts and grade histograms, aggregated in the database.
        supabase.rpc('get_boulder_crew_stats', { p_ids: ids }),
        // Open "help wanted" requests per boulder.
        supabase
          .from('gym_problem_help')
          .select('gym_problem_id, user_id, note, created_at')
          .in('gym_problem_id', ids)
          .is('resolved_at', null),
        // Boulders carrying at least one variation (an anchored challenge).
        supabase.from('challenges').select('gym_problem_id').in('gym_problem_id', ids),
      ])

      // Non-fatal, the same way the help and variation reads below already are:
      // before migration 097 is applied the function isn't there, and a tile
      // showing no crew count beats no home page at all. A gym-wide run of zero
      // crew counts is the symptom of 097 still being unapplied.
      const statsById = new Map<string, BoulderCrewStats>()
      for (const s of (statsRes.data ?? []) as BoulderCrewStats[]) {
        statsById.set(s.gym_problem_id, s)
      }

      // Non-fatal: if the table or the note column isn't there yet (migrations
      // 057/059 unapplied), degrade to no help indicators rather than breaking
      // the whole discover/home strip.
      const openHelp = (helpRes.data ?? []) as
        { gym_problem_id: string; user_id: string; note: string | null; created_at: string }[]
      const helpWantedIds = new Set(openHelp.map(h => h.gym_problem_id))

      // Non-fatal like the help query above: before migration 076 is applied the
      // column isn't there, and no variation markers beats no home page.
      const variationIds = new Set(
        ((variationRes.data ?? []) as { gym_problem_id: string | null }[])
          .map(r => r.gym_problem_id)
          .filter((gid): gid is string => !!gid),
      )

      const summaries: BoulderSummary[] = list.map(b => ({
        id: b.id,
        title: boulderTitle(b),
        gym: b.gym,
        color: b.color,
        hold_color: b.hold_color,
        // The publisher may set gym_problems.community_grade when they publish
        // the boulder; when they didn't, fall back to a consensus grade derived
        // from the linked problems' (Font-normalized) grades.
        community_grade: b.community_grade ?? consensusGradeFromCounts(statsById.get(b.id)?.grade_counts ?? {}),
        image_url: b.image_url,
        beta_video_url: b.beta_video_url,
        set_at: b.set_at,
        helpWanted: helpWantedIds.has(b.id),
        hasVariation: variationIds.has(b.id),
        expires_at: b.expires_at,
        crewCount: statsById.get(b.id)?.crew_count ?? 0,
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

      // 4. Names for the "someone's stuck" section. One batched query, skipped
      // when nobody is asking, and it genuinely cannot go earlier: it reads the
      // ids that wave 3 just returned. Non-fatal like the help query above: no
      // name is better than no home page.
      // Your own asks are never rendered, so don't pay a round trip to name
      // yourself when the only open ask at your gyms is your own.
      const askerIds = Array.from(new Set(
        openHelp.filter(h => h.user_id !== user?.id).map(h => h.user_id),
      ))
      let askerProfiles: { id: string; username: string | null }[] = []
      if (askerIds.length > 0) {
        const { data: askers } = await supabase
          .from('profiles').select('id, username').in('id', askerIds)
        askerProfiles = (askers ?? []) as { id: string; username: string | null }[]
      }
      const betaRequests = buildBetaRequests(openHelp, active, askerProfiles, user?.id)

      return { yours, discover, archived, betaRequests }
    },
    enabled: !!user,
  })
}
