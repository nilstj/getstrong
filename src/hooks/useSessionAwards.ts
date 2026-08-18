import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { profilesByIds } from '../lib/profiles'
import { useAuth } from '../providers/AuthProvider'
import type { AwardTag } from '../types'
import type { AwardVoteRow, AwardTagRow, AwardHistoryRow } from '../utils/sessionAwards'

/** A recent day where two or more crew members logged a session at one gym. */
export interface AwardCandidate {
  round_date: string
  gym: string
  climbers: number
  round_id: string | null
}

export interface AwardRoundState {
  round_id: string
  participants: number
  voted: number
  closes_at: string
  unlocked: boolean
  voters: string[]
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

/** Sessions from the last 7 days that two or more of this crew were at. */
export function useAwardCandidates(crewId: string) {
  return useQuery({
    queryKey: ['award_candidates', crewId],
    enabled: !!crewId,
    queryFn: async (): Promise<AwardCandidate[]> => {
      const { data, error } = await supabase.rpc('crew_award_candidates', { p_crew: crewId })
      if (error) throw error
      return (data ?? []) as AwardCandidate[]
    },
  })
}

/** Opens (or re-snapshots) a round and returns its id. Idempotent. */
export function useOpenAwardRound() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { crewId: string; date: string; gym: string }): Promise<string> => {
      const { data, error } = await supabase.rpc('open_award_round', {
        p_crew: v.crewId, p_date: v.date, p_gym: v.gym,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['award_candidates', v.crewId] }),
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

export function useAwardParticipants(roundId: string | null) {
  return useQuery({
    queryKey: ['award_participants', roundId],
    enabled: !!roundId,
    queryFn: async (): Promise<AwardParticipant[]> => {
      const { data, error } = await supabase
        .from('crew_award_participants')
        .select('user_id')
        .eq('round_id', roundId)
      if (error) throw error
      const ids = (data ?? []).map(r => r.user_id as string)
      const byId = await profilesByIds(ids)
      return ids.map(id => ({
        user_id: id,
        username: byId.get(id)?.username ?? null,
        avatar_url: byId.get(id)?.avatar_url ?? null,
      }))
    },
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
