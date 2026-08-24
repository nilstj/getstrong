import { useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import { exportFilename, type ExportEnvelope } from '../utils/myData'

// Both buckets store objects under `<user id>/…`, which is what migration 087
// made enforceable and what makes a per-user sweep possible at all.
const BUCKETS = ['avatars', 'problem-images'] as const

export function useExportMyData() {
  return useMutation({
    mutationFn: async (): Promise<ExportEnvelope> => {
      const { data, error } = await supabase.rpc('export_my_data')
      if (error) throw error
      return data as ExportEnvelope
    },
  })
}

export function downloadExport(envelope: ExportEnvelope, now: Date): void {
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = exportFilename(now)
  a.click()
  URL.revokeObjectURL(url)
}

export function useDeleteMyAccount() {
  const { user } = useAuth()
  return useMutation({
    mutationFn: async () => {
      const uid = user?.id
      if (!uid) throw new Error('Not signed in')

      // Storage first, deliberately: the files themselves only go away through
      // the storage API, and a failure here leaves the account intact and
      // retryable. Doing it after the RPC would leave orphans with no session
      // left to delete them.
      for (const bucket of BUCKETS) {
        const { data: files, error: listError } = await supabase.storage.from(bucket).list(uid)
        if (listError) throw listError
        const paths = (files ?? []).map(f => `${uid}/${f.name}`)
        if (paths.length > 0) {
          const { error: removeError } = await supabase.storage.from(bucket).remove(paths)
          if (removeError) throw removeError
        }
      }

      const { error } = await supabase.rpc('delete_my_account')
      if (error) throw error
    },
  })
}
