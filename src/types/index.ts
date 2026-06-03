export type GradeSystem = 'v_scale' | 'font' | 'color'
export type ExerciseType = 'reps' | 'time'

export type SessionIntensity = 'boring' | 'sunshine' | 'hard' | 'really_hard' | 'to_the_max'

export const INTENSITY_OPTIONS: { value: SessionIntensity; label: string; emoji: string; active: string; badge: string }[] = [
  { value: 'boring',      label: 'Boring',      emoji: '😴', active: 'bg-gray-400 text-white border-gray-400',           badge: 'bg-gray-100 text-gray-600' },
  { value: 'sunshine',    label: 'Sunshine',    emoji: '☀️', active: 'bg-yellow-400 text-white border-yellow-400',       badge: 'bg-yellow-100 text-yellow-700' },
  { value: 'hard',        label: 'Hard',        emoji: '💪', active: 'bg-orange-500 text-white border-orange-500',       badge: 'bg-orange-100 text-orange-700' },
  { value: 'really_hard', label: 'Really Hard', emoji: '🔥', active: 'bg-red-500 text-white border-red-500',             badge: 'bg-red-100 text-red-700' },
  { value: 'to_the_max',  label: 'To the Max',  emoji: '🤯', active: 'bg-purple-600 text-white border-purple-600',       badge: 'bg-purple-100 text-purple-700' },
]

export interface Session {
  id: string
  user_id: string
  date: string
  location: string
  duration_minutes: number | null
  intensity: SessionIntensity | null
  goal: string | null
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
