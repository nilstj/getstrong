import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'

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
