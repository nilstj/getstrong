import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'

export interface WallComment {
  id: string
  announcement_id: string
  user_id: string
  body: string
  created_at: string
}

export function useAnnouncementComments(announcementId: string) {
  return useQuery({
    queryKey: ['wall_comments', announcementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wall_comments')
        .select('*')
        .eq('announcement_id', announcementId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as WallComment[]
    },
  })
}

export function usePostComment() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({ announcementId, body }: { announcementId: string; body: string }) => {
      const { data, error } = await supabase
        .from('wall_comments')
        .insert({ announcement_id: announcementId, user_id: user!.id, body })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as WallComment
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['wall_comments', data.announcement_id] })
    },
  })
}
