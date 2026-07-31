import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Challenge, ChallengeAttempt, ChallengeInvitation, ChallengeComment } from '../types'
import { useAuth } from '../providers/AuthProvider'

type QueryResult<T> = { data: T | null; error: { code?: string; message?: string } | null }

// Migration 076 (challenges.gym_problem_id) is applied by hand and is not
// guaranteed to be live yet. Until it is, `gym_problems(...)` isn't a real
// relationship, so a select carrying that embed fails PostgREST-wide with
// PGRST200 ("Could not find a relationship…"). Unlike useVariations, which can
// afford to just throw because it only ever renders the Variations tab, a
// throw here would take down every *pre-existing* portable challenge on
// /challenges and in the add-to-session picker in SessionDetailPage — a
// regression that predates this feature entirely. So: try the embed, and on a
// relationship error specifically, retry the same query without it. Every
// render site already guards on `gym_problems` being present, so the fallback
// rows (which lack that key) render exactly as a portable challenge does.
// Same "degrade rather than break while a migration is late" call
// useVariations and useDiscoverBoulders make for this identical column.
//
// Checked by error code rather than by swallowing any failure: a genuine
// network failure, a timeout, or an RLS rejection carries a different code (or
// none), so `result.error.code !== 'PGRST200'` is false-y for those and they
// fall through to `return result` — still an error, still thrown by the
// caller, never silently retried into a second, unrelated failure.
async function withEmbedFallback<T>(
  result: QueryResult<T>,
  retry: () => PromiseLike<QueryResult<T>>,
): Promise<QueryResult<T>> {
  if (!result.error || result.error.code !== 'PGRST200') return result
  return retry()
}

export function useChallenges(followingIds: string[] = []) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['challenges', user?.id, [...followingIds].sort().join(',')],
    queryFn: async () => {
      const userId = user!.id
      // Both queries fire together whether or not either needs the fallback
      // retry — the retry (when triggered) also fires in parallel, so this
      // never serializes into up to four sequential round trips.
      const [publicEmbedded, privateEmbedded] = await Promise.all([
        supabase.from('challenges').select('*, gym_problems(gym, color, hold_color)')
          .eq('is_public', true).order('created_at', { ascending: false }),
        supabase.from('challenges').select('*, gym_problems(gym, color, hold_color)')
          .eq('is_public', false).in('creator_id', [userId, ...followingIds]).order('created_at', { ascending: false }),
      ])
      const [{ data: publicData, error: e1 }, { data: privateData, error: e2 }] = await Promise.all([
        withEmbedFallback(publicEmbedded, () =>
          supabase.from('challenges').select('*')
            .eq('is_public', true).order('created_at', { ascending: false })),
        withEmbedFallback(privateEmbedded, () =>
          supabase.from('challenges').select('*')
            .eq('is_public', false).in('creator_id', [userId, ...followingIds]).order('created_at', { ascending: false })),
      ])
      if (e1) throw e1
      if (e2) throw e2
      return [...(publicData ?? []), ...(privateData ?? [])] as Challenge[]
    },
    enabled: !!user,
  })
}

export function useCreateChallenge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: Pick<Challenge, 'title' | 'description' | 'video_url' | 'tags' | 'is_public'>) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('challenges')
        .insert({ ...values, creator_id: session.user.id })
        .select()
        .single()
      if (error) throw error
      return data as Challenge
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenges'] })
    },
  })
}

export function useChallengeAttempts(challengeId: string) {
  return useQuery({
    queryKey: ['challenge_attempts', challengeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('challenge_attempts')
        .select('*')
        .eq('challenge_id', challengeId)
      if (error) throw error
      return data as ChallengeAttempt[]
    },
  })
}

export function useSessionChallengeAttempts(sessionId: string) {
  return useQuery({
    queryKey: ['challenge_attempts', 'session', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('challenge_attempts')
        .select('*, challenges(title)')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as (ChallengeAttempt & { challenges: { title: string } })[]
    },
  })
}

export function useAddChallengeAttempt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: Pick<ChallengeAttempt, 'challenge_id' | 'session_id' | 'completed' | 'notes'>) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('challenge_attempts')
        .insert({ ...values, user_id: session.user.id })
        .select()
        .single()
      if (error) throw error
      return data as ChallengeAttempt
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['challenge_attempts'] })
      if (variables.session_id) {
        queryClient.invalidateQueries({ queryKey: ['challenge_attempts', 'session', variables.session_id] })
      }
    },
  })
}

export function useUpdateChallengeAttempt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, sessionId, ...values }: { id: string; sessionId: string; completed?: boolean; notes?: string | null; video_url?: string | null }) => {
      const { error } = await supabase.from('challenge_attempts').update(values).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['challenge_attempts', 'session', variables.sessionId] })
      queryClient.invalidateQueries({ queryKey: ['challenge_attempts'] })
    },
  })
}

export function useDeleteChallenge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('challenges').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenges'] })
    },
  })
}

export function useDeleteChallengeAttempt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, sessionId }: { id: string; sessionId: string | null }) => {
      const { error } = await supabase.from('challenge_attempts').delete().eq('id', id)
      if (error) throw error
      return sessionId
    },
    onSuccess: (sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['challenge_attempts'] })
      if (sessionId) {
        queryClient.invalidateQueries({ queryKey: ['challenge_attempts', 'session', sessionId] })
      }
    },
  })
}

export function useUpdateChallenge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: Pick<Challenge, 'id' | 'title' | 'description' | 'video_url' | 'tags' | 'is_public'>) => {
      const { data, error } = await supabase
        .from('challenges')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Challenge
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenges'] })
    },
  })
}

export function useSendChallenge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ challengeId, recipientIds }: { challengeId: string; recipientIds: string[] }) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const rows = recipientIds.map(recipient_id => ({
        challenge_id: challengeId,
        sender_id: session.user.id,
        recipient_id,
      }))
      const { error } = await supabase.from('challenge_invitations').insert(rows)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenge_invitations'] })
    },
  })
}

export function useChallengeComments(challengeId: string) {
  return useQuery({
    queryKey: ['challenge_comments', challengeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('challenge_comments')
        .select('*')
        .eq('challenge_id', challengeId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as ChallengeComment[]
    },
  })
}

export function useAddChallengeComment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ challengeId, content }: { challengeId: string; content: string }) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('challenge_comments')
        .insert({ challenge_id: challengeId, user_id: session.user.id, content })
        .select()
        .single()
      if (error) throw error
      return data as ChallengeComment
    },
    onSuccess: (comment) => {
      queryClient.invalidateQueries({ queryKey: ['challenge_comments', comment.challenge_id] })
    },
  })
}

export function useDeleteChallengeComment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, challengeId }: { id: string; challengeId: string }) => {
      const { error } = await supabase.from('challenge_comments').delete().eq('id', id)
      if (error) throw error
      return challengeId
    },
    onSuccess: (challengeId) => {
      queryClient.invalidateQueries({ queryKey: ['challenge_comments', challengeId] })
    },
  })
}

export function useMyCompletedChallenges() {
  return useQuery({
    queryKey: ['challenge_attempts', 'my_completed'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('challenge_attempts')
        .select('id, challenge_id, created_at, challenges(title)')
        .eq('user_id', session.user.id)
        .eq('completed', true)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as { id: string; challenge_id: string; created_at: string; challenges: { title: string } }[]
    },
  })
}

export function useReceivedChallenges() {
  return useQuery({
    queryKey: ['challenge_invitations', 'received'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const embedded = await supabase
        .from('challenge_invitations')
        // include gym_problem_id and gym_problems embed so received variations have boulder identity;
        // this nested object is handed straight to the detail sheet, so it needs the same boulder fields
        .select('*, challenges(id, title, description, video_url, creator_id, gym_problem_id, gym_problems(gym, color, hold_color)), profiles!sender_id(username)')
        .eq('recipient_id', session.user.id)
        .order('created_at', { ascending: false })
      // Same migration-076-not-applied-yet tolerance as useChallenges above, but
      // the retry select must drop BOTH gym_problem_id and the gym_problems embed,
      // not just the embed. gym_problem_id is itself the column 076 adds, so
      // before 076 is applied `PGRST200` fires at relationship-resolution time
      // (correctly triggering this retry), but a retry select that still names
      // gym_problem_id then fails at Postgres with 42703 ("column does not
      // exist") instead — a different code, so withEmbedFallback can't catch it
      // and `if (error) throw error` below empties the whole "Sent to me"
      // section for every user with a pending invitation. Every render site
      // guards on `gym_problems` *and* `gym_problem_id` being present, so a
      // fallback row lacking both still renders as a portable challenge — which
      // is correct, since pre-076 no variation can exist at all.
      const { data, error } = await withEmbedFallback(embedded, () =>
        supabase
          .from('challenge_invitations')
          .select('*, challenges(id, title, description, video_url, creator_id), profiles!sender_id(username)')
          .eq('recipient_id', session.user.id)
          .order('created_at', { ascending: false }))
      if (error) throw error
      return data as (ChallengeInvitation & {
        challenges: Challenge
        profiles: { username: string | null }
      })[]
    },
  })
}
