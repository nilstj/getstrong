import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { profilesByIds } from '../lib/profiles'
import { useAuth } from '../providers/AuthProvider'
import type { AwardTag } from '../types'
import type { AwardVoteRow, AwardTagRow, AwardHistoryRow } from '../utils/sessionAwards'

export interface AwardRoundState {
  round_id: string
  participants: number
  voted: number
  closes_at: string
  unlocked: boolean
  voters: string[]
  /** Always present: whether you were a climber in this session at all. A
   *  crew member who did not climb that session is not invited to vote. */
  am_participant: boolean
  /** Every user id with live group membership for this round's session. */
  roster: string[]
  /** Always present: what you personally submitted, so you can change it. */
  mine: {
    votes: { kind: 'goat' | 'donkey'; subject_id: string }[]
    tags: AwardTagRow[]
    notes: { subject_id: string; body: string }[]
  }
  /** Present only once `unlocked` — the RPC withholds these until then. */
  votes?: AwardVoteRow[]
  tags?: { voter_id: string; subject_id: string; tag: AwardTag }[]
  notes?: { voter_id: string; subject_id: string; body: string }[]
}

export interface AwardParticipant {
  user_id: string
  username: string | null
  avatar_url: string | null
}

export interface AwardMessage {
  id: string
  user_id: string
  body: string
  created_at: string
  username: string | null
  avatar_url: string | null
}

/** Opens (or re-snapshots) a round for a session's group and returns its id. Idempotent. */
export function useOpenAwardRound() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { groupId: string }): Promise<string> => {
      const { data, error } = await supabase.rpc('open_award_round', {
        p_group: v.groupId,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['award_round_for_group', v.groupId] }),
  })
}

/** One round's progress, your own picks, and — once unlocked — everyone's. */
export function useAwardRound(roundId: string | null) {
  return useQuery({
    queryKey: ['award_round', roundId],
    enabled: !!roundId,
    queryFn: async (): Promise<AwardRoundState> => {
      const { data, error } = await supabase.rpc('get_award_round', { p_round: roundId })
      if (error) throw error
      return data as AwardRoundState
    },
  })
}

/** The award round for a session's group, or null if nobody has opened one. */
export function useAwardRoundForGroup(groupId: string | null) {
  return useQuery({
    queryKey: ['award_round_for_group', groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<AwardRoundState | null> => {
      const { data: round, error } = await supabase
        .from('crew_award_rounds')
        .select('id')
        .eq('group_id', groupId)
        .maybeSingle()
      if (error) throw error
      if (!round) return null
      const { data, error: rErr } = await supabase.rpc('get_award_round', { p_round: round.id })
      if (rErr) throw rErr
      return data as AwardRoundState
    },
  })
}

/** One dig emoji's count on a round's verdict, and whether you sent it. */
export interface AwardReactionSummary {
  emoji: string
  count: number
  mine: boolean
}

/** Dig reactions on a round's GOAT and donkey verdict cards, by kind. */
export function useAwardReactions(roundId: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['award_reactions', roundId],
    enabled: !!roundId,
    queryFn: async (): Promise<Record<'goat' | 'donkey', AwardReactionSummary[]>> => {
      const { data, error } = await supabase
        .from('crew_award_reactions')
        .select('kind, emoji, user_id')
        .eq('round_id', roundId)
      if (error) throw error
      const rows = (data ?? []) as { kind: 'goat' | 'donkey'; emoji: string; user_id: string }[]
      const byKind: Record<'goat' | 'donkey', Map<string, AwardReactionSummary>> = {
        goat: new Map(),
        donkey: new Map(),
      }
      for (const r of rows) {
        const map = byKind[r.kind]
        const entry = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false }
        entry.count += 1
        if (r.user_id === user?.id) entry.mine = true
        map.set(r.emoji, entry)
      }
      return { goat: Array.from(byKind.goat.values()), donkey: Array.from(byKind.donkey.values()) }
    },
  })
}

/** Toggles the caller's dig reaction on a round's verdict on or off. */
export function useToggleAwardReaction() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (v: { roundId: string; kind: 'goat' | 'donkey'; emoji: string }) => {
      const cached = qc.getQueryData<Record<'goat' | 'donkey', AwardReactionSummary[]>>([
        'award_reactions', v.roundId,
      ])
      const mine = cached?.[v.kind]?.some(r => r.emoji === v.emoji && r.mine) ?? false

      if (mine) {
        const { error } = await supabase
          .from('crew_award_reactions')
          .delete()
          .eq('round_id', v.roundId).eq('user_id', user!.id).eq('kind', v.kind).eq('emoji', v.emoji)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('crew_award_reactions')
          .insert({ round_id: v.roundId, user_id: user!.id, kind: v.kind, emoji: v.emoji })
        if (error && error.code !== '23505') throw error // ignore "already reacted"
      }
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['award_reactions', v.roundId] }),
  })
}

export function useCastAwardVote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { roundId: string; kind: 'goat' | 'donkey'; subjectId: string }) => {
      const { error } = await supabase.rpc('cast_award_vote', {
        p_round: v.roundId, p_kind: v.kind, p_subject: v.subjectId,
      })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['award_round', v.roundId] }),
  })
}

export function useToggleAwardTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { roundId: string; subjectId: string; tag: AwardTag }): Promise<boolean> => {
      const { data, error } = await supabase.rpc('toggle_award_tag', {
        p_round: v.roundId, p_subject: v.subjectId, p_tag: v.tag,
      })
      if (error) throw error
      return data as boolean
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['award_round', v.roundId] }),
  })
}

export function useSetAwardNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { roundId: string; subjectId: string; body: string }) => {
      const { error } = await supabase.rpc('set_award_note', {
        p_round: v.roundId, p_subject: v.subjectId, p_body: v.body,
      })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['award_round', v.roundId] }),
  })
}

export function useAwardMessages(roundId: string | null) {
  return useQuery({
    queryKey: ['award_messages', roundId],
    enabled: !!roundId,
    queryFn: async (): Promise<AwardMessage[]> => {
      const { data, error } = await supabase
        .from('crew_award_messages')
        .select('id, user_id, body, created_at')
        .eq('round_id', roundId)
        .order('created_at', { ascending: true })
      if (error) throw error
      const rows = (data ?? []) as Omit<AwardMessage, 'username' | 'avatar_url'>[]
      const byId = await profilesByIds(Array.from(new Set(rows.map(r => r.user_id))))
      return rows.map(r => ({
        ...r,
        username: byId.get(r.user_id)?.username ?? null,
        avatar_url: byId.get(r.user_id)?.avatar_url ?? null,
      }))
    },
  })
}

export function usePostAwardMessage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (v: { roundId: string; body: string }) => {
      const { error } = await supabase
        .from('crew_award_messages')
        .insert({ round_id: v.roundId, user_id: user!.id, body: v.body })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['award_messages', v.roundId] }),
  })
}

/** Unlocked rounds' raw vote counts, for the repeat-donkey streak. */
export function useCrewAwardHistory(crewId: string) {
  return useQuery({
    queryKey: ['award_history', crewId],
    enabled: !!crewId,
    queryFn: async (): Promise<AwardHistoryRow[]> => {
      const { data, error } = await supabase.rpc('crew_award_history', { p_crew: crewId, p_limit: 12 })
      if (error) throw error
      return (data ?? []) as AwardHistoryRow[]
    },
  })
}
