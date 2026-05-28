export type GradeSystem = 'v_scale' | 'font' | 'color'
export type ExerciseType = 'reps' | 'time'

export interface Session {
  id: string
  user_id: string
  date: string
  location: string
  duration_minutes: number | null
  notes: string | null
  created_at: string
}

export interface Problem {
  id: string
  session_id: string
  user_id: string
  grade_system: GradeSystem
  grade_value: string | null
  color: string | null
  attempts: number
  sent: boolean
  notes: string | null
  created_at: string
}

export interface Exercise {
  id: string
  session_id: string
  user_id: string
  name: string
  type: ExerciseType
  sets: number | null
  reps: number | null
  duration_seconds: number | null
  notes: string | null
  created_at: string
}

export interface GradeMapping {
  v_scale: string
  font_equivalent: string
}
