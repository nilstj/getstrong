import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'

export interface WallAnnouncement {
  id: string
  user_id: string
  location: string
  label: string | null
  starts_at: string
  created_at: string
  wall_joins: { id: string }[]
}

export interface WallJoin {
  id: string
  announcement_id: string
  user_id: string
  created_at: string
}

const THREE_HOURS_AGO = () =>
  new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()

export function useMyAnnouncement() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['wall_announcement', 'mine', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wall_announcements')
        .select('*, wall_joins(id)')
        .eq('user_id', user!.id)
        .gte('starts_at', THREE_HOURS_AGO())
        .order('starts_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as WallAnnouncement | null
    },
    enabled: !!user,
  })
}

export function useCreateAnnouncement() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({
      location,
      label,
      starts_at,
    }: {
      location: string
      label: string | null
      starts_at: string
    }) => {
      // Delete any existing announcement first
      await supabase
        .from('wall_announcements')
        .delete()
        .eq('user_id', user!.id)

      const { data, error } = await supabase
        .from('wall_announcements')
        .insert({ user_id: user!.id, location, label, starts_at })
        .select('*, wall_joins(id)')
        .single()
      if (error) throw error
      return data as WallAnnouncement
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wall_announcement'] })
    },
  })
}

export function useClearAnnouncement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('wall_announcements')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wall_announcement'] })
    },
  })
}

export function useFriendsAnnouncements(followingIds: string[]) {
  const sortedKey = followingIds.slice().sort().join(',')
  return useQuery({
    queryKey: ['wall_announcement', 'friends', sortedKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wall_announcements')
        .select('*, wall_joins(id)')
        .in('user_id', followingIds)
        .gte('starts_at', THREE_HOURS_AGO())
        .order('starts_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as WallAnnouncement[]
    },
    enabled: followingIds.length > 0,
  })
}

export function useJoinAnnouncement() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (announcementId: string) => {
      const { error } = await supabase
        .from('wall_joins')
        .insert({ announcement_id: announcementId, user_id: user!.id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wall_announcement'] })
      queryClient.invalidateQueries({ queryKey: ['my_joins'] })
    },
  })
}

export function useUnjoinAnnouncement() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (announcementId: string) => {
      const { error } = await supabase
        .from('wall_joins')
        .delete()
        .eq('announcement_id', announcementId)
        .eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wall_announcement'] })
      queryClient.invalidateQueries({ queryKey: ['my_joins'] })
    },
  })
}

export function useMyJoins() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my_joins', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wall_joins')
        .select('announcement_id')
        .eq('user_id', user!.id)
      if (error) throw error
      return new Set((data ?? []).map(j => j.announcement_id as string))
    },
    enabled: !!user,
  })
}

export function useAnnouncementJoiners(announcementId: string) {
  return useQuery({
    queryKey: ['wall_joins', announcementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wall_joins')
        .select('*')
        .eq('announcement_id', announcementId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as WallJoin[]
    },
  })
}
