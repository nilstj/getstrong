import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { BetaSection, BetaBodyType } from '../types'

// ── View types ───────────────────────────────────────────────────────────────
export interface ReactionAgg { emoji: string; count: number; mine: boolean }

export interface BetaReply {
  id: string
  user_id: string
  body: string
  created_at: string
  authorName: string | null
  authorAvatarUrl: string | null
  reactions: ReactionAgg[]
}

export interface BetaThread {
  id: string
  gym_problem_id: string
  user_id: string
  body: string | null
  video_url: string | null
  section: BetaSection | null
  body_type: BetaBodyType | null
  created_at: string
  worked_count: number
  worked_by_me: boolean
  authorName: string | null
  authorAvatarUrl: string | null
  reactions: ReactionAgg[]
  replies: BetaReply[]
}

export interface PersonLite { user_id: string; name: string | null; avatarUrl: string | null }

export interface BoulderBetaThreadResult {
  threads: BetaThread[]
  asking: PersonLite[]
  worked: PersonLite[]
}

function aggregate(rows: { emoji: string; user_id: string }[], myId?: string): ReactionAgg[] {
  const map = new Map<string, { count: number; mine: boolean }>()
  for (const r of rows) {
    const e = map.get(r.emoji) ?? { count: 0, mine: false }
    e.count++
    if (r.user_id === myId) e.mine = true
    map.set(r.emoji, e)
  }
  return Array.from(map, ([emoji, v]) => ({ emoji, count: v.count, mine: v.mine })).sort((a, b) => b.count - a.count)
}

function pushInto<T>(map: Map<string, T[]>, key: string, val: T) {
  const arr = map.get(key)
  if (arr) arr.push(val)
  else map.set(key, [val])
}

// ── Beta thread (beta + worked + reactions + replies) + who's asking/helped ───
export function useBoulderBetaThread(gymProblemId: string) {
  return useQuery({
    queryKey: ['boulder_beta', gymProblemId],
    enabled: !!gymProblemId,
    queryFn: async (): Promise<BoulderBetaThreadResult> => {
      const { data: { user } } = await supabase.auth.getUser()
      const myId = user?.id

      const [betasRes, helpRes] = await Promise.all([
        supabase
          .from('boulder_beta')
          .select('id, gym_problem_id, user_id, body, video_url, section, body_type, created_at')
          .eq('gym_problem_id', gymProblemId),
        supabase
          .from('gym_problem_help')
          .select('user_id')
          .eq('gym_problem_id', gymProblemId)
          .is('resolved_at', null),
      ])
      if (betasRes.error) throw betasRes.error
      const betas = (betasRes.data ?? []) as {
        id: string; gym_problem_id: string; user_id: string; body: string | null
        video_url: string | null; section: BetaSection | null; body_type: BetaBodyType | null; created_at: string
      }[]
      const betaIds = betas.map(b => b.id)

      let worked: { beta_id: string; user_id: string }[] = []
      let betaRx: { beta_id: string; user_id: string; emoji: string }[] = []
      let comments: { id: string; beta_id: string; user_id: string; body: string; created_at: string }[] = []
      if (betaIds.length > 0) {
        const [w, r, c] = await Promise.all([
          supabase.from('boulder_beta_worked').select('beta_id, user_id').in('beta_id', betaIds),
          supabase.from('boulder_beta_reactions').select('beta_id, user_id, emoji').in('beta_id', betaIds),
          supabase.from('boulder_beta_comments').select('id, beta_id, user_id, body, created_at').in('beta_id', betaIds).order('created_at', { ascending: true }),
        ])
        worked = (w.data ?? []) as typeof worked
        betaRx = (r.data ?? []) as typeof betaRx
        comments = (c.data ?? []) as typeof comments
      }
      const commentIds = comments.map(c => c.id)

      let commentRx: { comment_id: string; user_id: string; emoji: string }[] = []
      if (commentIds.length > 0) {
        const { data } = await supabase.from('boulder_beta_comment_reactions').select('comment_id, user_id, emoji').in('comment_id', commentIds)
        commentRx = (data ?? []) as typeof commentRx
      }

      const askingIds = (helpRes.data ?? []).map(h => h.user_id as string)
      const workedUserIds = Array.from(new Set(worked.map(w => w.user_id)))
      const allIds = Array.from(new Set([
        ...betas.map(b => b.user_id),
        ...comments.map(c => c.user_id),
        ...askingIds,
        ...workedUserIds,
      ]))
      const profileById = new Map<string, { username: string | null; avatar_url: string | null }>()
      if (allIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, username, avatar_url').in('id', allIds)
        for (const p of profs ?? []) {
          profileById.set(p.id as string, { username: p.username as string | null, avatar_url: p.avatar_url as string | null })
        }
      }
      const person = (uid: string): PersonLite => ({ user_id: uid, name: profileById.get(uid)?.username ?? null, avatarUrl: profileById.get(uid)?.avatar_url ?? null })

      const workedByBeta = new Map<string, { count: number; mine: boolean }>()
      for (const w of worked) {
        const e = workedByBeta.get(w.beta_id) ?? { count: 0, mine: false }
        e.count++
        if (w.user_id === myId) e.mine = true
        workedByBeta.set(w.beta_id, e)
      }
      const rxByBeta = new Map<string, { emoji: string; user_id: string }[]>()
      for (const r of betaRx) pushInto(rxByBeta, r.beta_id, { emoji: r.emoji, user_id: r.user_id })
      const commentsByBeta = new Map<string, typeof comments>()
      for (const c of comments) pushInto(commentsByBeta, c.beta_id, c)
      const rxByComment = new Map<string, { emoji: string; user_id: string }[]>()
      for (const r of commentRx) pushInto(rxByComment, r.comment_id, { emoji: r.emoji, user_id: r.user_id })

      const threads: BetaThread[] = betas.map(b => ({
        id: b.id,
        gym_problem_id: b.gym_problem_id,
        user_id: b.user_id,
        body: b.body,
        video_url: b.video_url,
        section: b.section,
        body_type: b.body_type,
        created_at: b.created_at,
        worked_count: workedByBeta.get(b.id)?.count ?? 0,
        worked_by_me: workedByBeta.get(b.id)?.mine ?? false,
        authorName: profileById.get(b.user_id)?.username ?? null,
        authorAvatarUrl: profileById.get(b.user_id)?.avatar_url ?? null,
        reactions: aggregate(rxByBeta.get(b.id) ?? [], myId),
        replies: (commentsByBeta.get(b.id) ?? []).map(c => ({
          id: c.id,
          user_id: c.user_id,
          body: c.body,
          created_at: c.created_at,
          authorName: profileById.get(c.user_id)?.username ?? null,
          authorAvatarUrl: profileById.get(c.user_id)?.avatar_url ?? null,
          reactions: aggregate(rxByComment.get(c.id) ?? [], myId),
        })),
      }))
      // Top beta first: most "worked for me", then most recent.
      threads.sort((a, b) => b.worked_count - a.worked_count || (a.created_at < b.created_at ? 1 : -1))

      return { threads, asking: askingIds.map(person), worked: workedUserIds.map(person) }
    },
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────
export function useAddBoulderBeta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { gymProblemId: string; body: string | null; videoUrl: string | null; section: BetaSection | null; bodyType: BetaBodyType | null }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('boulder_beta')
        .insert({ gym_problem_id: v.gymProblemId, user_id: user?.id, body: v.body, video_url: v.videoUrl, section: v.section, body_type: v.bodyType })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['boulder_beta', v.gymProblemId] }),
  })
}

export function useMarkBetaWorked() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { betaId: string; gymProblemId: string }) => {
      const { error } = await supabase.rpc('mark_beta_worked', { p_beta_id: v.betaId })
      if (error) throw error
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['boulder_beta', v.gymProblemId] })
      // A worked-mark clears the marker's help request (resolved by a DB trigger).
      qc.invalidateQueries({ queryKey: ['boulder_help', v.gymProblemId] })
      qc.invalidateQueries({ queryKey: ['discover_boulders'] })
    },
  })
}

export function useUnmarkBetaWorked() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { betaId: string; gymProblemId: string }) => {
      const { error } = await supabase.rpc('unmark_beta_worked', { p_beta_id: v.betaId })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['boulder_beta', v.gymProblemId] }),
  })
}

export function useAddBetaComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { betaId: string; gymProblemId: string; body: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('boulder_beta_comments').insert({ beta_id: v.betaId, user_id: user?.id, body: v.body })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['boulder_beta', v.gymProblemId] }),
  })
}

export function useDeleteBetaComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { commentId: string; gymProblemId: string }) => {
      const { error } = await supabase.from('boulder_beta_comments').delete().eq('id', v.commentId)
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['boulder_beta', v.gymProblemId] }),
  })
}

export function useToggleBetaReaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { betaId: string; gymProblemId: string; emoji: string; mine: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (v.mine) {
        const { error } = await supabase.from('boulder_beta_reactions').delete()
          .eq('beta_id', v.betaId).eq('user_id', user?.id ?? '').eq('emoji', v.emoji)
        if (error) throw error
      } else {
        const { error } = await supabase.from('boulder_beta_reactions')
          .upsert({ beta_id: v.betaId, user_id: user?.id, emoji: v.emoji }, { onConflict: 'beta_id,user_id,emoji', ignoreDuplicates: true })
        if (error) throw error
      }
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['boulder_beta', v.gymProblemId] }),
  })
}

export function useToggleBetaCommentReaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { commentId: string; gymProblemId: string; emoji: string; mine: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (v.mine) {
        const { error } = await supabase.from('boulder_beta_comment_reactions').delete()
          .eq('comment_id', v.commentId).eq('user_id', user?.id ?? '').eq('emoji', v.emoji)
        if (error) throw error
      } else {
        const { error } = await supabase.from('boulder_beta_comment_reactions')
          .upsert({ comment_id: v.commentId, user_id: user?.id, emoji: v.emoji }, { onConflict: 'comment_id,user_id,emoji', ignoreDuplicates: true })
        if (error) throw error
      }
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['boulder_beta', v.gymProblemId] }),
  })
}
