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
  name: string | null
  grade_system: GradeSystem
  grade_value: string | null
  grade_value_font: string | null
  grade_value_vscale: string | null
  color: string | null
  attempts: number
  sent: boolean
  board: string | null
  board_angle: number | null
  gym: string | null
  beta_video_url: string | null
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

export interface ProblemTagDefinition {
  id: string
  name: string
  category: string
  created_by: string
  created_at: string
}

export interface ProblemReaction {
  id: string
  problem_id: string
  user_id: string
  emoji: string
  created_at: string
}

export interface HypeMessage {
  id: string
  to_user_id: string
  from_user_id: string
  created_at: string
}

export interface SharedProject {
  id: string
  title: string
  description: string | null
  grade_value_font: string | null
  grade_value_vscale: string | null
  board: string | null
  board_angle: number | null
  gym: string | null
  creator_id: string
  created_at: string
}

export interface ProjectAttempt {
  id: string
  project_id: string
  user_id: string
  sent: boolean
  created_at: string
}

export interface ChallengeBeta {
  id: string
  challenge_id: string
  user_id: string
  crux: string | null
  footwork: string | null
  sequence: string | null
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
