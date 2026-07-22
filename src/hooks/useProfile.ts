import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'

export interface Profile {
  id: string
  username: string | null
  avatar_url: string | null
  is_admin: boolean
  grade_preference: 'font' | 'v_scale'
  default_gyms: string[]
  on_wall_at: string | null
  on_wall_label: string | null
  created_at: string
}

export function useProfile(userId?: string) {
  const { user } = useAuth()
  const id = userId ?? user?.id
  return useQuery({
    queryKey: ['profile', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as Profile
    },
    enabled: !!id,
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (values: Partial<Pick<Profile, 'username' | 'avatar_url' | 'grade_preference' | 'default_gyms'>>) => {
      const { data, error } = await supabase
        .from('profiles')
        .update(values)
        .eq('id', user!.id)
        .select()
        .single()
      if (error) throw error
      return data as Profile
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] })
    },
  })
}

export function useUploadAvatar() {
  const { user } = useAuth()
  const updateProfile = useUpdateProfile()
  return useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split('.').pop()
      const path = `${user!.id}/avatar.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(path)
      await updateProfile.mutateAsync({ avatar_url: publicUrl })
      return publicUrl
    },
  })
}

export function useSearchUsers(query: string) {
  return useQuery({
    queryKey: ['users', 'search', query],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('username', `%${query}%`)
        .limit(20)
      if (error) throw error
      return data as Profile[]
    },
    enabled: query.length >= 2,
  })
}
