import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import { POLICY_VERSION } from '../utils/policy'

/**
 * Writes the climber's own acceptance record. Plain profile update rather than
 * an RPC: it is their record of their own reading, and the existing "users can
 * update own profile" policy already scopes it correctly.
 */
export function useAcceptPolicy() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('profiles')
        .update({
          policy_version: POLICY_VERSION,
          policy_accepted_at: now,
          age_confirmed_at: now,
        })
        .eq('id', user!.id)
      if (error) throw error
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['profile'] }) },
  })
}
