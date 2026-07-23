import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import { summarizeFriendSessions, type FriendProblemRow, type FriendActivityRow, type FriendSessionSummary } from '../utils/friendSessions'

// A Crew is a small, persistent, invite-only training group. Distinct from the
// per-boulder "sendtrain" served by useCrew.ts.
export interface Crew {
  id: string
  name: string
  emoji: string | null
  home_gym: string | null
  created_by: string | null
  created_at: string
}

export interface MyCrew {
  crew: Crew
  role: 'owner' | 'member'
  memberCount: number
}

export interface CrewMemberProfile {
  user_id: string
  role: 'owner' | 'member'
  joined_at: string
  username: string | null
  avatar_url: string | null
}

export interface CrewInvite {
  crew: Crew
  invited_by: string | null
}

export interface CrewLeaderRow {
  user_id: string
  username: string | null
  avatar_url: string | null
  points: number
}

async function profilesByIds(ids: string[]) {
  const map = new Map<string, { username: string | null; avatar_url: string | null }>()
  if (ids.length === 0) return map
  const { data } = await supabase.from('profiles').select('id, username, avatar_url').in('id', ids)
  for (const p of data ?? []) map.set(p.id as string, { username: p.username as string | null, avatar_url: p.avatar_url as string | null })
  return map
}

/** Crews the current user belongs to, with their role and member count. */
export function useMyCrews() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my_crews', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<MyCrew[]> => {
      const { data: mine, error } = await supabase
        .from('crew_members')
        .select('crew_id, role, crews(*)')
        .eq('user_id', user!.id)
      if (error) throw error
      const rows = (mine ?? []) as unknown as { crew_id: string; role: 'owner' | 'member'; crews: Crew }[]
      if (rows.length === 0) return []

      const crewIds = rows.map(r => r.crew_id)
      const { data: allMembers, error: mErr } = await supabase
        .from('crew_members')
        .select('crew_id')
        .in('crew_id', crewIds)
      if (mErr) throw mErr
      const counts = new Map<string, number>()
      for (const m of allMembers ?? []) counts.set(m.crew_id as string, (counts.get(m.crew_id as string) ?? 0) + 1)

      return rows
        .filter(r => r.crews)
        .map(r => ({ crew: r.crews, role: r.role, memberCount: counts.get(r.crew_id) ?? 1 }))
        .sort((a, b) => (a.crew.created_at < b.crew.created_at ? 1 : -1))
    },
  })
}

/** Invites addressed to the current user (with crew details). */
export function usePendingCrewInvites() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['pending_crew_invites', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<CrewInvite[]> => {
      const { data, error } = await supabase
        .from('crew_invites')
        .select('invited_by, crews(*)')
        .eq('invited_user', user!.id)
      if (error) throw error
      const rows = (data ?? []) as unknown as { invited_by: string | null; crews: Crew }[]
      return rows.filter(r => r.crews).map(r => ({ crew: r.crews, invited_by: r.invited_by }))
    },
  })
}

export function useCrewGroup(crewId: string) {
  return useQuery({
    queryKey: ['crew_group', crewId],
    enabled: !!crewId,
    queryFn: async (): Promise<Crew> => {
      const { data, error } = await supabase.from('crews').select('*').eq('id', crewId).single()
      if (error) throw error
      return data as Crew
    },
  })
}

export function useCrewMembers(crewId: string) {
  return useQuery({
    queryKey: ['crew_members', crewId],
    enabled: !!crewId,
    queryFn: async (): Promise<CrewMemberProfile[]> => {
      const { data, error } = await supabase
        .from('crew_members')
        .select('user_id, role, joined_at')
        .eq('crew_id', crewId)
      if (error) throw error
      const rows = (data ?? []) as { user_id: string; role: 'owner' | 'member'; joined_at: string }[]
      const byId = await profilesByIds(rows.map(r => r.user_id))
      return rows
        .map(r => ({ ...r, username: byId.get(r.user_id)?.username ?? null, avatar_url: byId.get(r.user_id)?.avatar_url ?? null }))
        // Owner first, then by join time.
        .sort((a, b) => (a.role === b.role ? (a.joined_at < b.joined_at ? -1 : 1) : a.role === 'owner' ? -1 : 1))
    },
  })
}

/** Pending invites for a crew (so members can see who's been asked). */
export function useCrewPendingInvites(crewId: string) {
  return useQuery({
    queryKey: ['crew_invites', crewId],
    enabled: !!crewId,
    queryFn: async (): Promise<{ user_id: string; username: string | null; avatar_url: string | null }[]> => {
      const { data, error } = await supabase.from('crew_invites').select('invited_user').eq('crew_id', crewId)
      if (error) throw error
      const ids = (data ?? []).map(r => r.invited_user as string)
      const byId = await profilesByIds(ids)
      return ids.map(id => ({ user_id: id, username: byId.get(id)?.username ?? null, avatar_url: byId.get(id)?.avatar_url ?? null }))
    },
  })
}

/** Inside-crew standings: members ranked by beta points in the given cycle. */
export function useCrewLeaderboard(memberIds: string[], cycleMonth: string) {
  return useQuery({
    queryKey: ['crew_leaderboard', [...memberIds].sort().join(','), cycleMonth],
    enabled: memberIds.length > 0 && !!cycleMonth,
    queryFn: async (): Promise<CrewLeaderRow[]> => {
      const { data, error } = await supabase
        .from('beta_points')
        .select('user_id, points')
        .in('user_id', memberIds)
        .eq('cycle_month', cycleMonth)
      if (error) throw error
      const points = new Map<string, number>()
      for (const r of (data ?? []) as { user_id: string; points: number }[]) {
        points.set(r.user_id, (points.get(r.user_id) ?? 0) + r.points)
      }
      const byId = await profilesByIds(memberIds)
      return memberIds
        .map(id => ({ user_id: id, username: byId.get(id)?.username ?? null, avatar_url: byId.get(id)?.avatar_url ?? null, points: points.get(id) ?? 0 }))
        .sort((a, b) => b.points - a.points)
    },
  })
}

// ── Phase 2: completion tracker + crew feed ──────────────────────────────────

export interface CrewBoulderProgress {
  crewId: string
  name: string
  emoji: string | null
  members: { user_id: string; username: string | null; avatar_url: string | null; done: boolean }[]
  doneCount: number
  total: number
}

/**
 * For each of the current user's crews (2+ members), how many have sent this
 * boulder — the "everyone's done it" tracker. A boulder counts as done for a
 * member when they've logged a sent problem linked to it.
 */
export function useCrewBoulderProgress(gymProblemId: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['crew_boulder_progress', gymProblemId, user?.id],
    enabled: !!gymProblemId && !!user,
    queryFn: async (): Promise<CrewBoulderProgress[]> => {
      const { data: mine, error } = await supabase.from('crew_members').select('crew_id').eq('user_id', user!.id)
      if (error) throw error
      const crewIds = (mine ?? []).map(r => r.crew_id as string)
      if (crewIds.length === 0) return []

      const [memRes, crewRes, sendRes] = await Promise.all([
        supabase.from('crew_members').select('crew_id, user_id').in('crew_id', crewIds),
        supabase.from('crews').select('id, name, emoji').in('id', crewIds),
        supabase.from('problems').select('user_id, sent').eq('gym_problem_id', gymProblemId),
      ])
      if (memRes.error) throw memRes.error
      if (crewRes.error) throw crewRes.error
      if (sendRes.error) throw sendRes.error

      const senders = new Set((sendRes.data ?? []).filter(p => p.sent).map(p => p.user_id as string))
      const memberIds = Array.from(new Set((memRes.data ?? []).map(r => r.user_id as string)))
      const byId = await profilesByIds(memberIds)
      const crewsById = new Map((crewRes.data ?? []).map(c => [c.id as string, c as { id: string; name: string; emoji: string | null }]))
      const byCrew = new Map<string, string[]>()
      for (const r of memRes.data ?? []) {
        const arr = byCrew.get(r.crew_id as string) ?? []
        arr.push(r.user_id as string)
        byCrew.set(r.crew_id as string, arr)
      }

      const out: CrewBoulderProgress[] = []
      for (const cid of crewIds) {
        const uids = byCrew.get(cid) ?? []
        const crew = crewsById.get(cid)
        if (!crew || uids.length < 2) continue // solo crews make "everyone did it" meaningless
        const members = uids
          .map(uid => ({ user_id: uid, username: byId.get(uid)?.username ?? null, avatar_url: byId.get(uid)?.avatar_url ?? null, done: senders.has(uid) }))
          .sort((a, b) => (a.done === b.done ? 0 : a.done ? -1 : 1))
        out.push({ crewId: cid, name: crew.name, emoji: crew.emoji, members, doneCount: members.filter(m => m.done).length, total: members.length })
      }
      return out.sort((a, b) => b.doneCount / b.total - a.doneCount / a.total)
    },
  })
}

export type CrewSession = FriendSessionSummary & { authorName: string | null; authorAvatarUrl: string | null }

/** Recent sessions of a crew's members, for the crew home feed. */
export function useCrewActivityFeed(memberIds: string[]) {
  return useQuery({
    queryKey: ['crew_feed', [...memberIds].sort().join(',')],
    enabled: memberIds.length > 0,
    queryFn: async (): Promise<CrewSession[]> => {
      const [problemsRes, challengesRes] = await Promise.all([
        supabase
          .from('problems')
          .select('user_id, session_id, gym, grade_value, grade_value_font, sent, image_url, beta_video_url, created_at')
          .in('user_id', memberIds)
          .is('crag', null)
          .order('created_at', { ascending: false })
          .limit(300),
        supabase
          .from('challenge_attempts')
          .select('user_id, session_id, created_at')
          .in('user_id', memberIds)
          .order('created_at', { ascending: false })
          .limit(300),
      ])
      if (problemsRes.error) throw problemsRes.error
      if (challengesRes.error) throw challengesRes.error
      const byId = await profilesByIds(memberIds)
      return summarizeFriendSessions({
        problems: (problemsRes.data ?? []) as FriendProblemRow[],
        challenges: (challengesRes.data ?? []) as FriendActivityRow[],
      }).map(s => ({ ...s, authorName: byId.get(s.userId)?.username ?? null, authorAvatarUrl: byId.get(s.userId)?.avatar_url ?? null }))
    },
  })
}

export interface CrewStanding {
  crew_id: string
  name: string
  emoji: string | null
  home_gym: string | null
  member_count: number
  total_points: number
  avg_points: number
}

/** Cross-crew leaderboard, ranked by average points per member. `gym` null = everywhere. */
export function useCrewStandings(gym: string | null, cycleMonth: string) {
  return useQuery({
    queryKey: ['crew_standings', gym ?? 'all', cycleMonth],
    enabled: !!cycleMonth,
    queryFn: async (): Promise<CrewStanding[]> => {
      const { data, error } = await supabase.rpc('crew_standings', { p_gym: gym, p_cycle: cycleMonth })
      if (error) throw error
      return (data ?? []) as CrewStanding[]
    },
  })
}

// ── Phase 3: crew-vs-crew battles ────────────────────────────────────────────
export interface CrewBattle {
  id: string
  challenger_crew: string
  opponent_crew: string
  created_by: string | null
  battle_type: 'boulder' | 'sends'
  gym_problem_id: string | null
  duration_days: number
  status: 'pending' | 'active' | 'declined'
  starts_at: string | null
  ends_at: string | null
  created_at: string
  challenger: { name: string; emoji: string | null } | null
  opponent: { name: string; emoji: string | null } | null
  boulder: { name: string | null } | null
}

export interface CrewBattleScore {
  challenger_score: number
  challenger_total: number
  opponent_score: number
  opponent_total: number
}

/** Battles involving a crew (excludes declined). */
export function useCrewBattles(crewId: string) {
  return useQuery({
    queryKey: ['crew_battles', crewId],
    enabled: !!crewId,
    queryFn: async (): Promise<CrewBattle[]> => {
      const { data, error } = await supabase
        .from('crew_battles')
        .select('*, challenger:crews!challenger_crew(name, emoji), opponent:crews!opponent_crew(name, emoji), boulder:gym_problems(name)')
        .or(`challenger_crew.eq.${crewId},opponent_crew.eq.${crewId}`)
        .neq('status', 'declined')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as CrewBattle[]
    },
  })
}

export function useCrewBattleScore(battleId: string, enabled = true) {
  return useQuery({
    queryKey: ['crew_battle_score', battleId],
    enabled: !!battleId && enabled,
    queryFn: async (): Promise<CrewBattleScore> => {
      const { data, error } = await supabase.rpc('crew_battle_score', { p_battle: battleId })
      if (error) throw error
      const row = (Array.isArray(data) ? data[0] : data) as CrewBattleScore | undefined
      return row ?? { challenger_score: 0, challenger_total: 0, opponent_score: 0, opponent_total: 0 }
    },
  })
}

export function useCreateCrewBattle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { challengerCrew: string; opponentCrew: string; type: 'boulder' | 'sends'; gymProblemId: string | null; durationDays: number }) => {
      const { data, error } = await supabase.rpc('create_crew_battle', {
        p_challenger: v.challengerCrew, p_opponent: v.opponentCrew, p_type: v.type, p_gym_problem: v.gymProblemId, p_duration: v.durationDays,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['crew_battles', v.challengerCrew] })
      qc.invalidateQueries({ queryKey: ['crew_battles', v.opponentCrew] })
    },
  })
}

export function useRespondCrewBattle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { battleId: string; accept: boolean }) => {
      const { error } = await supabase.rpc('respond_crew_battle', { p_battle: v.battleId, p_accept: v.accept })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crew_battles'] }),
  })
}

// ── Mutations (all via SECURITY DEFINER RPCs) ────────────────────────────────
export function useCreateCrew() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { name: string; emoji: string | null; homeGym: string | null }) => {
      const { data, error } = await supabase.rpc('create_crew', { p_name: v.name, p_emoji: v.emoji, p_home_gym: v.homeGym })
      if (error) throw error
      return data as string
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my_crews'] }),
  })
}

export function useInviteToCrew() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { crewId: string; userId: string }) => {
      const { error } = await supabase.rpc('invite_to_crew', { p_crew: v.crewId, p_user: v.userId })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['crew_invites', v.crewId] }),
  })
}

export function useAcceptCrewInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (crewId: string) => {
      const { error } = await supabase.rpc('accept_crew_invite', { p_crew: crewId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my_crews'] })
      qc.invalidateQueries({ queryKey: ['pending_crew_invites'] })
    },
  })
}

export function useDeclineCrewInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (crewId: string) => {
      const { error } = await supabase.rpc('decline_crew_invite', { p_crew: crewId })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pending_crew_invites'] }),
  })
}

export function useLeaveCrew() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (crewId: string) => {
      const { error } = await supabase.rpc('leave_crew', { p_crew: crewId })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my_crews'] }),
  })
}

export function useDeleteCrew() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (crewId: string) => {
      const { error } = await supabase.rpc('delete_crew', { p_crew: crewId })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my_crews'] }),
  })
}
