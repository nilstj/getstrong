import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'

/** Someone who has cleared a variation. */
export interface VariationClear {
  user_id: string
  username: string | null
  avatar_url: string | null
  /** Their proof clip, when they attached one. Only video-backed clears pay points. */
  video_url: string | null
}

/** A challenge anchored to a shared boulder: the same wall, altered rules. */
export interface Variation {
  id: string
  title: string
  description: string | null
  video_url: string | null
  creator_id: string
  creator_name: string | null
  created_at: string
  clears: VariationClear[]
}

/**
 * Variations set on one shared boulder, oldest first, each with everyone who has
 * cleared it. Profiles come from a second `.in('id', ids)` query — there is no FK
 * embed between challenges and profiles.
 */
export function useVariations(gymProblemId: string) {
  return useQuery({
    queryKey: ['variations', gymProblemId],
    enabled: !!gymProblemId,
    queryFn: async (): Promise<Variation[]> => {
      const { data: rows, error } = await supabase
        .from('challenges')
        .select('id, title, description, video_url, creator_id, created_at')
        .eq('gym_problem_id', gymProblemId)
        .order('created_at', { ascending: true })
      if (error) throw error
      const variations = (rows ?? []) as Omit<Variation, 'clears' | 'creator_name'>[]
      if (variations.length === 0) return []

      const ids = variations.map(v => v.id)
      const { data: attemptRows, error: e2 } = await supabase
        .from('challenge_attempts')
        .select('challenge_id, user_id, video_url')
        .in('challenge_id', ids)
        .eq('completed', true)
      if (e2) throw e2
      const attempts = (attemptRows ?? []) as
        { challenge_id: string; user_id: string; video_url: string | null }[]

      const userIds = Array.from(new Set([
        ...variations.map(v => v.creator_id),
        ...attempts.map(a => a.user_id),
      ]))
      const { data: profileRows, error: e3 } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', userIds)
      if (e3) throw e3
      const profiles = new Map(
        ((profileRows ?? []) as { id: string; username: string | null; avatar_url: string | null }[])
          .map(p => [p.id, p]),
      )

      // One clear per person per variation, keeping whichever row has a video so a
      // duplicate tick never hides the proof clip.
      const clearsBy = new Map<string, Map<string, VariationClear>>()
      for (const a of attempts) {
        const perVariation = clearsBy.get(a.challenge_id) ?? new Map<string, VariationClear>()
        const existing = perVariation.get(a.user_id)
        if (!existing || (!existing.video_url && a.video_url)) {
          const p = profiles.get(a.user_id)
          perVariation.set(a.user_id, {
            user_id: a.user_id,
            username: p?.username ?? null,
            avatar_url: p?.avatar_url ?? null,
            video_url: a.video_url,
          })
        }
        clearsBy.set(a.challenge_id, perVariation)
      }

      return variations.map(v => ({
        ...v,
        creator_name: profiles.get(v.creator_id)?.username ?? null,
        clears: Array.from(clearsBy.get(v.id)?.values() ?? []),
      }))
    },
  })
}

/**
 * Whether the current user may set a variation here — they must have logged a
 * *sent* go on this boulder. Mirrors the RLS check in migration 076 so the button
 * is never a trap; the database remains the real guard.
 */
export function useCanSetVariation(gymProblemId: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['can_set_variation', gymProblemId, user?.id],
    enabled: !!gymProblemId && !!user,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('problems')
        .select('id')
        .eq('user_id', user!.id)
        .eq('gym_problem_id', gymProblemId)
        .eq('sent', true)
        .limit(1)
      if (error) throw error
      return (data ?? []).length > 0
    },
  })
}

/**
 * Set a variation on a boulder. Always public — a variation on a shared boulder
 * is inherently public, so the boulder-page form has no visibility toggle. The
 * insert is written here rather than through useCreateChallenge so the portable
 * challenge path at /challenges keeps its own shape and its own invalidations.
 */
export function useCreateVariation() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (v: {
      gymProblemId: string
      title: string
      description: string | null
      videoUrl: string | null
      tags: string[]
    }) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase.from('challenges').insert({
        creator_id: user.id,
        gym_problem_id: v.gymProblemId,
        title: v.title,
        description: v.description,
        video_url: v.videoUrl,
        tags: v.tags,
        is_public: true,
      })
      if (error) throw error
    },
    onSuccess: (_data, v) => {
      qc.invalidateQueries({ queryKey: ['variations', v.gymProblemId] })
      qc.invalidateQueries({ queryKey: ['discover_boulders'] })
    },
  })
}

/**
 * Mark a variation cleared, optionally with a proof clip. Only a video-backed
 * clear pays points — the guard for that lives in the migration 076 trigger, not
 * here. Updating an existing attempt rather than inserting a second one needs the
 * UPDATE policy that migration 076 adds.
 */
export function useClearVariation() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (v: { challengeId: string; gymProblemId: string; videoUrl: string | null }) => {
      if (!user) throw new Error('Not authenticated')
      const { data: existing, error: e1 } = await supabase
        .from('challenge_attempts')
        .select('id')
        .eq('challenge_id', v.challengeId)
        .eq('user_id', user.id)
        .limit(1)
      if (e1) throw e1

      const mine = (existing ?? []) as { id: string }[]
      if (mine.length > 0) {
        const updatePayload: Record<string, unknown> = { completed: true }
        if (v.videoUrl) {
          // Re-tick without a new video must not erase an existing clip — the points
          // award depends on the video link staying intact.
          updatePayload.video_url = v.videoUrl
        }
        const { error } = await supabase
          .from('challenge_attempts')
          .update(updatePayload)
          .eq('id', mine[0].id)
        if (error) throw error
        return
      }
      const { error } = await supabase.from('challenge_attempts').insert({
        challenge_id: v.challengeId,
        user_id: user.id,
        completed: true,
        video_url: v.videoUrl,
      })
      if (error) throw error
    },
    onSuccess: (_data, v) => {
      qc.invalidateQueries({ queryKey: ['variations', v.gymProblemId] })
      qc.invalidateQueries({ queryKey: ['leaderboard'] })
    },
  })
}
