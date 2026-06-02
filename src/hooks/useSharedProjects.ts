import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { SharedProject, ProjectAttempt } from '../types'

export function useSharedProjects() {
  return useQuery({
    queryKey: ['shared_projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shared_projects')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as SharedProject[]
    },
  })
}

export function useCreateSharedProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: Pick<SharedProject, 'title' | 'description' | 'grade_value_font' | 'grade_value_vscale' | 'board' | 'board_angle' | 'gym'>) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('shared_projects')
        .insert({ ...values, creator_id: session.user.id })
        .select()
        .single()
      if (error) throw error
      return data as SharedProject
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared_projects'] })
    },
  })
}

export function useDeleteSharedProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('shared_projects').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared_projects'] })
    },
  })
}

export function useProjectAttempts(projectId: string) {
  return useQuery({
    queryKey: ['project_attempts', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_attempts')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as ProjectAttempt[]
    },
  })
}

export function useAddProjectAttempt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, sent }: { projectId: string; sent: boolean }) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('project_attempts')
        .insert({ project_id: projectId, user_id: session.user.id, sent })
        .select()
        .single()
      if (error) throw error
      return data as ProjectAttempt
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project_attempts', variables.projectId] })
      queryClient.invalidateQueries({ queryKey: ['shared_projects'] })
    },
  })
}

export function useDeleteProjectAttempt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; projectId: string }) => {
      const { error } = await supabase.from('project_attempts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project_attempts', variables.projectId] })
      queryClient.invalidateQueries({ queryKey: ['shared_projects'] })
    },
  })
}
