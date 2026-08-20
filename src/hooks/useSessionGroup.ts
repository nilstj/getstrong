import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import { profilesByIds } from '../lib/profiles'
import { fontToVScale, vScaleToFont } from '../utils/grades'
import type { GroupBoulder } from '../utils/sessionGroups'

export interface SessionGroup {
  id: string
  date: string
  gym: string
  crew_id: string | null
  created_by: string | null
}

export interface GroupMember {
  user_id: string
  session_id: string
  username: string | null
  avatar_url: string | null
}

export interface PendingInvite {
  invited_user: string
  username: string | null
  avatar_url: string | null
}

/** The group a session belongs to, or null for a solo session. */
export function useSessionGroupRow(groupId: string | null) {
  return useQuery({
    queryKey: ['session_group', groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<SessionGroup | null> => {
      const { data, error } = await supabase
        .from('session_groups')
        .select('id, date, gym, crew_id, created_by')
        .eq('id', groupId)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as SessionGroup | null
    },
  })
}

/** Who has accepted. Ids come from the RPC; names from a second profiles query. */
export function useGroupRoster(groupId: string | null) {
  return useQuery({
    queryKey: ['session_group_roster', groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<GroupMember[]> => {
      const { data, error } = await supabase.rpc('session_group_roster', { p_group: groupId })
      if (error) throw error
      const rows = (data ?? []) as { user_id: string; session_id: string }[]
      const byId = await profilesByIds(rows.map(r => r.user_id))
      return rows.map(r => ({
        ...r,
        username: byId.get(r.user_id)?.username ?? null,
        avatar_url: byId.get(r.user_id)?.avatar_url ?? null,
      }))
    },
  })
}

/** Who has been asked but not yet accepted. */
export function useGroupInvites(groupId: string | null) {
  return useQuery({
    queryKey: ['session_group_invites', groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<PendingInvite[]> => {
      const { data, error } = await supabase
        .from('session_group_invites')
        .select('invited_user')
        .eq('group_id', groupId)
      if (error) throw error
      const rows = (data ?? []) as { invited_user: string }[]
      const byId = await profilesByIds(rows.map(r => r.invited_user))
      return rows.map(r => ({
        ...r,
        username: byId.get(r.invited_user)?.username ?? null,
        avatar_url: byId.get(r.invited_user)?.avatar_url ?? null,
      }))
    },
  })
}

/** The shared boulder list. */
export function useGroupBoulders(groupId: string | null) {
  return useQuery({
    queryKey: ['session_group_boulders', groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<GroupBoulder[]> => {
      const { data, error } = await supabase
        .from('session_group_boulders')
        .select('id, gym_problem_id, grade_system, grade_value, grade_value_font, grade_value_vscale, color, hold_color, image_url, beta_video_url, created_at')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as GroupBoulder[]
    },
  })
}

/** Sessions I have been invited to and not yet accepted. */
export function useMyGroupInvites() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my_session_group_invites', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<{ group: SessionGroup; invited_by: string | null }[]> => {
      const { data, error } = await supabase
        .from('session_group_invites')
        .select('invited_by, session_groups(id, date, gym, crew_id, created_by)')
        .eq('invited_user', user!.id)
      if (error) throw error
      const rows = (data ?? []) as unknown as { invited_by: string | null; session_groups: SessionGroup | null }[]
      return rows
        .filter(r => !!r.session_groups)
        .map(r => ({ group: r.session_groups as SessionGroup, invited_by: r.invited_by }))
    },
  })
}

export function useCreateSessionGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { sessionId: string }): Promise<string> => {
      const { data, error } = await supabase.rpc('create_session_group', { p_session: v.sessionId })
      if (error) throw error
      return data as string
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['sessions', v.sessionId] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
      // create_session_group also stamps group_boulder_id on the owner's own
      // problems rows (the back-fill), so an already-mounted problems cache is
      // stale too -- without this a colour-only problem has no gym_problem_id
      // fallback and renders "Not logged" until the 60s staleTime lapses.
      qc.invalidateQueries({ queryKey: ['problems', v.sessionId] })
      qc.invalidateQueries({ queryKey: ['problems'] })
    },
  })
}

export function useInviteToSessionGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { groupId: string; userId: string }) => {
      const { error } = await supabase.rpc('invite_to_session_group', { p_group: v.groupId, p_user: v.userId })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['session_group_invites', v.groupId] }),
  })
}

export function useAcceptSessionGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { groupId: string }): Promise<string> => {
      const { data, error } = await supabase.rpc('accept_session_group', { p_group: v.groupId })
      if (error) throw error
      return data as string
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['my_session_group_invites'] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
      // accept_session_group writes both a roster row and deletes the invite,
      // so both queries are stale for everyone already in the group too.
      qc.invalidateQueries({ queryKey: ['session_group_roster', v.groupId] })
      qc.invalidateQueries({ queryKey: ['session_group_invites', v.groupId] })
    },
  })
}

export function useDeclineSessionGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { groupId: string }) => {
      const { error } = await supabase.rpc('decline_session_group', { p_group: v.groupId })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my_session_group_invites'] }),
  })
}

/**
 * Puts a boulder on the group's list, returning the list entry's id. A picked
 * shared boulder carries a single `community_grade` string with no scale attached,
 * unlike `useAddProblem`, which is told its scale by its caller. This hook has to
 * infer which scale the string is in, so it fetches the mapping table once and
 * derives both scales here, so the two writes cannot disagree and callers never do
 * grade maths.
 */
export function useAddGroupBoulder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      groupId: string
      gymProblemId: string | null
      grade: string | null
      color: string | null
      holdColor: string | null
      imageUrl: string | null
      betaVideoUrl: string | null
    }): Promise<string> => {
      // The column is `not null`, so an ungraded boulder still needs a permitted
      // value here -- default to 'font' with every grade value left null.
      let gradeSystem: 'font' | 'v_scale' = 'font'
      let gradeValueFont: string | null = null
      let gradeValueVscale: string | null = null

      if (v.grade) {
        const { data: mappings } = await supabase.from('grade_mappings').select('*')
        const m = mappings ?? []
        const vscaleIfFont = fontToVScale(v.grade, m)
        const fontIfVscale = vScaleToFont(v.grade, m)
        if (vscaleIfFont !== null) {
          gradeSystem = 'font'
          gradeValueFont = v.grade
          gradeValueVscale = vscaleIfFont
        } else if (fontIfVscale !== null) {
          gradeSystem = 'v_scale'
          gradeValueFont = fontIfVscale
          gradeValueVscale = v.grade
        } else {
          gradeSystem = 'font'
          gradeValueFont = v.grade
          gradeValueVscale = null
        }
      }

      const { data, error } = await supabase.rpc('add_group_boulder', {
        p_group: v.groupId,
        p_gym_problem_id: v.gymProblemId,
        p_grade_system: gradeSystem,
        p_grade_value: v.grade,
        p_grade_value_font: gradeValueFont,
        p_grade_value_vscale: gradeValueVscale,
        p_color: v.color,
        p_hold_color: v.holdColor,
        p_image_url: v.imageUrl,
        p_beta_video_url: v.betaVideoUrl,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['session_group_boulders', v.groupId] }),
  })
}

/**
 * Create or update my own entry for one boulder on the group's list. Creating is
 * what turns "on the wall" into "on my list": a first try makes it a project at
 * one attempt, and marking it sent from untouched records a single try, because a
 * send with zero attempts is not a thing.
 */
export function useSetMyBoulderEntry() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (v: {
      sessionId: string
      groupId: string
      groupBoulderId: string
      entryId: string | null
      attempts: number
      sent: boolean
      boulder: GroupBoulder
      // Not inferred here -- the caller supplies the gym so a send logged from
      // the shared list also exists for that gym's grade leaderboard, which
      // filters problems.eq('gym', gym).
      gym: string
    }) => {
      if (v.entryId) {
        const { error } = await supabase
          .from('problems')
          .update({ attempts: v.attempts, sent: v.sent })
          .eq('id', v.entryId)
        if (error) throw error
        return
      }
      const { error } = await supabase.from('problems').insert({
        session_id: v.sessionId,
        user_id: user!.id,
        group_boulder_id: v.groupBoulderId,
        gym: v.gym,
        // Carried from the list entry, not assumed: a colour-graded gym stores
        // 'color' here, and hardcoding 'font' would violate the check constraint.
        grade_system: v.boulder.grade_system,
        grade_value: v.boulder.grade_value,
        grade_value_font: v.boulder.grade_value_font,
        grade_value_vscale: v.boulder.grade_value_vscale,
        color: v.boulder.color,
        hold_color: v.boulder.hold_color,
        image_url: v.boulder.image_url,
        beta_video_url: v.boulder.beta_video_url,
        gym_problem_id: v.boulder.gym_problem_id,
        attempts: v.attempts,
        sent: v.sent,
      })
      // A double-tap can race two inserts for the same (group_boulder_id, user_id);
      // the unique index lets only one land, and the other's insert is treated as
      // success -- the row the other tap created is the row we wanted.
      if (error && error.code !== '23505') throw error
    },
    onSuccess: (_, v) => {
      // Mirrors useAddProblem's invalidation set: a send logged from the shared
      // list must also move the home dashboard and the all-problems views, not
      // just this session's own query.
      qc.invalidateQueries({ queryKey: ['problems', v.sessionId] })
      qc.invalidateQueries({ queryKey: ['problems'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
