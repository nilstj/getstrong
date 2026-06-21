import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { HoldHighlight } from '../types'

export function useUpdateHoldHighlight() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ problemId, value }: { problemId: string; sessionId: string; value: HoldHighlight | null }) => {
      const { error } = await supabase
        .from('problems')
        .update({ hold_highlight: value })
        .eq('id', problemId)
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['problems', variables.sessionId] })
      queryClient.invalidateQueries({ queryKey: ['problems'] })
      queryClient.invalidateQueries({ queryKey: ['help_request_for_problem', variables.problemId] })
    },
  })
}
