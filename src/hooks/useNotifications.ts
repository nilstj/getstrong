import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import type { Notification } from '../types'

const NOTIFICATIONS_LIMIT = 50

export function useNotifications() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(NOTIFICATIONS_LIMIT)
      if (error) throw error
      return (data ?? []) as Notification[]
    },
    enabled: !!user,
  })
}

export function useUnreadNotificationCount() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['notifications', user?.id, 'unread_count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', user!.id)
        .is('read_at', null)
      if (error) throw error
      return count ?? 0
    },
    enabled: !!user,
  })
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('recipient_id', user!.id)
        .is('read_at', null)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] })
    },
  })
}

export function useDeleteNotification() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('notifications').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] })
    },
  })
}

// Subscribe to inserts on the user's notifications so the bell badge updates
// live without polling. Invalidates the cached queries on each new row.
export function useNotificationsRealtime() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['notifications', user.id] })
          queryClient.invalidateQueries({ queryKey: ['crew'] })
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, queryClient])
}
