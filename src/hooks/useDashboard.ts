import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Session, Problem, GradeMapping } from '../types'

interface DashboardData {
  sessions: Session[]
  problems: Problem[]
  gradeMappings: GradeMapping[]
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async (): Promise<DashboardData> => {
      const { data: { session: authSession } } = await supabase.auth.getSession()
      const userId = authSession?.user.id
      const [sessionsRes, problemsRes, mappingsRes] = await Promise.all([
        userId
          ? supabase.from('sessions').select('*').eq('user_id', userId).order('date', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        userId
          ? supabase.from('problems').select('*').eq('user_id', userId)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('grade_mappings').select('*'),
      ])
      if (sessionsRes.error) throw sessionsRes.error
      if (problemsRes.error) throw problemsRes.error
      if (mappingsRes.error) throw mappingsRes.error
      return {
        sessions: sessionsRes.data as Session[],
        problems: problemsRes.data as Problem[],
        gradeMappings: mappingsRes.data as GradeMapping[],
      }
    },
  })
}
