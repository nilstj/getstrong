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
  weight_kg: number | null
  notes: string | null
  created_at: string
}

export interface GradeMapping {
  v_scale: string
  font_equivalent: string
}

export interface Challenge {
  id: string
  creator_id: string
  title: string
  description: string | null
  video_url: string | null
  tags: string[]
  created_at: string
}

export interface ChallengeAttempt {
  id: string
  challenge_id: string
  session_id: string | null
  user_id: string
  completed: boolean
  notes: string | null
  video_url: string | null
  created_at: string
}

export interface StrengthTest {
  id: string
  name: string
  description: string | null
  unit: string
  created_by: string
  created_at: string
}

export interface TestResult {
  id: string
  test_id: string
  user_id: string
  value: number
  session_id: string | null
  created_at: string
}

export interface ExerciseTemplate {
  id: string
  name: string
  type: ExerciseType
  description: string | null
  test_id: string | null
  created_by: string
  created_at: string
}

export interface ChallengeComment {
  id: string
  challenge_id: string
  user_id: string
  content: string
  created_at: string
}

export interface ChallengeInvitation {
  id: string
  challenge_id: string
  sender_id: string
  recipient_id: string
  created_at: string
}
