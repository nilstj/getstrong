import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { BoulderReview, BoulderComment } from '../types'

type WithAuthor<T> = T & { authorName: string | null; authorAvatarUrl: string | null }

async function profilesByIds(ids: string[]) {
  const map = new Map<string, { username: string | null; avatar_url: string | null }>()
  if (ids.length === 0) return map
  const { data } = await supabase.from('profiles').select('id, username, avatar_url').in('id', ids)
  for (const p of data ?? []) {
    map.set(p.id as string, { username: p.username as string | null, avatar_url: p.avatar_url as string | null })
  }
  return map
}

// ── Setter name (community-editable via SECURITY DEFINER RPC) ────────────────
export function useSetBoulderSetter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { gymProblemId: string; setter: string }) => {
      const { error } = await supabase.rpc('set_boulder_setter', {
        p_gym_problem_id: v.gymProblemId,
        p_setter: v.setter,
      })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['gym_problem', v.gymProblemId] }),
  })
}

// ── Setter's intention (admin/setter-only, via SECURITY DEFINER RPC) ─────────
export function useSetBoulderSetterIntention() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { gymProblemId: string; intention: string }) => {
      const { error } = await supabase.rpc('set_boulder_setter_intention', {
        p_gym_problem_id: v.gymProblemId,
        p_intention: v.intention,
      })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['gym_problem', v.gymProblemId] }),
  })
}

// ── Star reviews ─────────────────────────────────────────────────────────────
export interface BoulderReviewsResult {
  reviews: WithAuthor<BoulderReview>[]
  average: number | null
  count: number
  myReview: BoulderReview | null
}

export function useBoulderReviews(gymProblemId: string) {
  return useQuery({
    queryKey: ['boulder_reviews', gymProblemId],
    enabled: !!gymProblemId,
    queryFn: async (): Promise<BoulderReviewsResult> => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('gym_problem_reviews')
        .select('*')
        .eq('gym_problem_id', gymProblemId)
        .order('created_at', { ascending: false })
      if (error) throw error
      const rows = (data ?? []) as BoulderReview[]
      const profileById = await profilesByIds(Array.from(new Set(rows.map(r => r.user_id))))
      const reviews = rows.map(r => ({
        ...r,
        authorName: profileById.get(r.user_id)?.username ?? null,
        authorAvatarUrl: profileById.get(r.user_id)?.avatar_url ?? null,
      }))
      const count = rows.length
      const average = count > 0 ? rows.reduce((s, r) => s + r.stars, 0) / count : null
      const myReview = rows.find(r => r.user_id === user?.id) ?? null
      return { reviews, average, count, myReview }
    },
  })
}

export function useUpsertBoulderReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { gymProblemId: string; stars: number; review: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('gym_problem_reviews')
        .upsert(
          { gym_problem_id: v.gymProblemId, user_id: user?.id, stars: v.stars, review: v.review },
          { onConflict: 'gym_problem_id,user_id' },
        )
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['boulder_reviews', v.gymProblemId] }),
  })
}

// ── Comments ─────────────────────────────────────────────────────────────────
export function useBoulderComments(gymProblemId: string) {
  return useQuery({
    queryKey: ['boulder_comments', gymProblemId],
    enabled: !!gymProblemId,
    queryFn: async (): Promise<WithAuthor<BoulderComment>[]> => {
      const { data, error } = await supabase
        .from('gym_problem_comments')
        .select('*')
        .eq('gym_problem_id', gymProblemId)
        .order('created_at', { ascending: true })
      if (error) throw error
      const rows = (data ?? []) as BoulderComment[]
      const profileById = await profilesByIds(Array.from(new Set(rows.map(r => r.user_id))))
      return rows.map(r => ({
        ...r,
        authorName: profileById.get(r.user_id)?.username ?? null,
        authorAvatarUrl: profileById.get(r.user_id)?.avatar_url ?? null,
      }))
    },
  })
}

export function useAddBoulderComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { gymProblemId: string; body: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('gym_problem_comments')
        .insert({ gym_problem_id: v.gymProblemId, user_id: user?.id, body: v.body })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['boulder_comments', v.gymProblemId] }),
  })
}

// ── Beta help ("help wanted") ────────────────────────────────────────────────
export function useBoulderHelp(gymProblemId: string) {
  return useQuery({
    queryKey: ['boulder_help', gymProblemId],
    enabled: !!gymProblemId,
    queryFn: async (): Promise<{ open: boolean; mineOpen: boolean }> => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('gym_problem_help')
        .select('user_id')
        .eq('gym_problem_id', gymProblemId)
        .is('resolved_at', null)
      if (error) throw error
      const rows = (data ?? []) as { user_id: string }[]
      return { open: rows.length > 0, mineOpen: rows.some(r => r.user_id === user?.id) }
    },
  })
}

export function useRequestBetaHelp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { gymProblemId: string; note: string | null; videoUrl: string | null }) => {
      const { error } = await supabase.rpc('request_beta_help', {
        p_gym_problem_id: v.gymProblemId,
        p_note: v.note,
        p_video_url: v.videoUrl,
      })
      if (error) throw error
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['boulder_help', v.gymProblemId] })
      qc.invalidateQueries({ queryKey: ['discover_boulders'] })
    },
  })
}

export function useDeleteBoulderComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { commentId: string; gymProblemId: string }) => {
      const { error } = await supabase.from('gym_problem_comments').delete().eq('id', v.commentId)
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['boulder_comments', v.gymProblemId] }),
  })
}
