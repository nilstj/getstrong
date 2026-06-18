import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import type { HelpRequest, HelpResponse, HelpVisibility } from '../types'

// A help request joined with the problem it's about (for the Help feed cards).
export interface HelpRequestWithProblem extends HelpRequest {
  problems: {
    id: string
    name: string | null
    image_url: string | null
    beta_video_url: string | null
    grade_value_font: string | null
    grade_value_vscale: string | null
    color: string | null
    board: string | null
    sessions: { location: string } | null
  } | null
  help_responses: { count: number }[]
}

// Open help requests visible to the current user (RLS handles friends/global).
export function useHelpRequests() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['help_requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('help_requests')
        .select(
          '*, problems(id, name, image_url, beta_video_url, grade_value_font, grade_value_vscale, color, board, sessions(location)), help_responses(count)',
        )
        .eq('resolved', false)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as HelpRequestWithProblem[]
    },
    enabled: !!user,
  })
}

// The current user's request for a specific problem (drives the problem button).
export function useProblemHelpRequest(problemId: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['help_request_for_problem', problemId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('help_requests')
        .select('*')
        .eq('problem_id', problemId)
        .eq('user_id', user!.id)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as HelpRequest | null
    },
    enabled: !!user,
  })
}

export function useCreateHelpRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ problemId, message, visibility }: { problemId: string; message: string | null; visibility: HelpVisibility }) => {
      const { data: id, error: rpcError } = await supabase
        .rpc('create_help_request', { p_problem_id: problemId, p_message: message, p_visibility: visibility })
      if (rpcError) throw new Error(rpcError.message)
      const { data, error } = await supabase
        .from('help_requests')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw new Error(error.message)
      return data as HelpRequest
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['help_requests'] })
      queryClient.invalidateQueries({ queryKey: ['help_request_for_problem', data.problem_id] })
    },
  })
}

export function useResolveHelpRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('help_requests').update({ resolved: true }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['help_requests'] })
      queryClient.invalidateQueries({ queryKey: ['help_request_for_problem'] })
    },
  })
}

export function useDeleteHelpRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('help_requests').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['help_requests'] })
      queryClient.invalidateQueries({ queryKey: ['help_request_for_problem'] })
    },
  })
}

// ── Responses ────────────────────────────────────────────────────────────────

export function useHelpResponses(requestId: string) {
  return useQuery({
    queryKey: ['help_responses', requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('help_responses')
        .select('*')
        .eq('request_id', requestId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as HelpResponse[]
    },
  })
}

export function useAddHelpResponse() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({ requestId, body, videoUrl }: { requestId: string; body: string; videoUrl: string | null }) => {
      const { data, error } = await supabase
        .from('help_responses')
        .insert({ request_id: requestId, user_id: user!.id, body, video_url: videoUrl })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as HelpResponse
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['help_responses', data.request_id] })
      queryClient.invalidateQueries({ queryKey: ['help_requests'] })
    },
  })
}

export function useMarkResponseHelpful() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, helpful }: { id: string; requestId: string; helpful: boolean }) => {
      const { error } = await supabase.from('help_responses').update({ helpful }).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['help_responses', variables.requestId] })
    },
  })
}
