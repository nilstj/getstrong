import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import type { StrengthTest, TestResult } from '../types'

export function useStrengthTests() {
  return useQuery({
    queryKey: ['strength_tests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strength_tests')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      return data as StrengthTest[]
    },
  })
}

export function useMyLatestTestResult(testId: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['test_results', 'latest', testId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('test_results')
        .select('*')
        .eq('test_id', testId!)
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as TestResult | null
    },
    enabled: !!testId && !!user?.id,
  })
}

export function useSessionTestResults(sessionId: string) {
  return useQuery({
    queryKey: ['test_results', 'session', sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('test_results')
        .select('*, strength_tests(name, unit)')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as (TestResult & { strength_tests: { name: string; unit: string } })[]
    },
  })
}

export function useLogTestResult() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: Pick<TestResult, 'test_id' | 'value' | 'session_id'>) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('test_results')
        .insert({ ...values, user_id: session.user.id })
        .select()
        .single()
      if (error) throw error
      return data as TestResult
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['test_results', 'latest', result.test_id] })
      if (result.session_id) {
        queryClient.invalidateQueries({ queryKey: ['test_results', 'session', result.session_id] })
      }
    },
  })
}

export function useDeleteTestResult() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, sessionId }: { id: string; sessionId: string | null }) => {
      const { error } = await supabase.from('test_results').delete().eq('id', id)
      if (error) throw error
      return sessionId
    },
    onSuccess: (sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['test_results'] })
      if (sessionId) {
        queryClient.invalidateQueries({ queryKey: ['test_results', 'session', sessionId] })
      }
    },
  })
}

export function useCreateStrengthTest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: Pick<StrengthTest, 'name' | 'description' | 'unit'>) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('strength_tests')
        .insert({ ...values, created_by: session.user.id })
        .select()
        .single()
      if (error) throw error
      return data as StrengthTest
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strength_tests'] })
    },
  })
}

export function useUpdateStrengthTest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: Pick<StrengthTest, 'id' | 'name' | 'description' | 'unit'>) => {
      const { data, error } = await supabase
        .from('strength_tests')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as StrengthTest
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strength_tests'] })
    },
  })
}

export function useDeleteStrengthTest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('strength_tests').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strength_tests'] })
    },
  })
}
