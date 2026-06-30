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
  wisdom: string | null
  wisdom_shared: boolean
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
  image_url: string | null
  crag: string | null
  notes: string | null
  created_at: string
  gym_problem_id: string | null
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
  is_public: boolean
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
  video_url: string | null
  device: string | null
  preset_sets: number | null
  preset_reps: number | null
  preset_pause_seconds: number | null
  preset_rest_seconds: number | null
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

export type NotificationType =
  | 'problem_comment'
  | 'problem_reaction'
  | 'attempt_reaction'
  | 'challenge_comment'
  | 'follow_request'
  | 'new_follower'
  | 'challenge_invitation'
  | 'hype'
  | 'session_tag'
  | 'wall_comment'
  | 'beta_video'
  | 'proof_video'
  | 'help_response'
  | 'help_marked_helpful'
  | 'badge_earned'
  | 'crew_send'
  | 'crew_stripped'

export interface Notification {
  id: string
  recipient_id: string
  actor_id: string | null
  type: NotificationType
  entity_id: string | null
  data: Record<string, unknown>
  read_at: string | null
  created_at: string
}

export type HelpVisibility = 'friends' | 'global'

export interface HelpRequest {
  id: string
  problem_id: string
  user_id: string
  message: string | null
  visibility: HelpVisibility
  resolved: boolean
  bounty: number
  gym_problem_id: string | null
  bounty_awarded: boolean
  created_at: string
}

export interface HelpResponse {
  id: string
  request_id: string
  user_id: string
  body: string
  video_url: string | null
  helpful: boolean
  reply: string | null
  created_at: string
}

export type BadgeKey = 'spotter' | 'beta_sprayer' | 'crux_crusher' | 'beta_legend'

export interface UserBadge {
  user_id: string
  badge: BadgeKey
  earned_at: string
}

export const BADGES: { key: BadgeKey; label: string; emoji: string; threshold: number; blurb: string }[] = [
  { key: 'spotter',      label: 'Spotter',      emoji: '🤲', threshold: 1,   blurb: 'First helpful beta' },
  { key: 'beta_sprayer', label: 'Beta Sprayer', emoji: '💦', threshold: 5,   blurb: '5 helpful betas' },
  { key: 'crux_crusher', label: 'Crux Crusher', emoji: '💥', threshold: 25,  blurb: '25 helpful betas' },
  { key: 'beta_legend',  label: 'Beta Legend',  emoji: '👑', threshold: 100, blurb: '100 helpful betas' },
]

export interface GymProblem {
  id: string
  gym: string
  wall_angle: string | null
  color: string | null
  community_grade: string | null
  name: string | null
  setter: string | null
  image_url: string | null
  beta_video_url: string | null
  created_by: string | null
  set_at: string
  expires_at: string
  status: 'active' | 'archived'
  created_at: string
}

export interface BoulderReview {
  gym_problem_id: string
  user_id: string
  stars: number
  review: string | null
  created_at: string
}

export interface BoulderComment {
  id: string
  gym_problem_id: string
  user_id: string
  body: string
  created_at: string
}

export interface GymProblemMatchCriteria {
  gym: string | null
  color: string | null
}

export type CrewState = 'projecting' | 'sent' | 'flashed'

export interface CrewMember {
  user_id: string
  username: string | null
  avatar_url: string | null
  state: CrewState
  joined_at: string
}

export interface CrewSummary {
  total: number
  sent: number
  flashed: number
  sendRate: number
}

export interface CrewProblemRow {
  user_id: string
  username: string | null
  avatar_url: string | null
  sent: boolean
  attempts: number
  created_at: string
}

export type BetaPointReason = 'bounty_won' | 'helpful' | 'first_logger'

export interface BetaPointRow {
  user_id: string
  points: number
}

export interface LeaderboardEntry {
  user_id: string
  username: string | null
  avatar_url: string | null
  points: number
  rank: number
}

export interface BoulderSummary {
  id: string
  title: string
  gym: string
  color: string | null
  community_grade: string | null
  image_url: string | null
  set_at: string
  isBoard: boolean
  expires_at: string
  crewCount: number
  claimed: boolean
}

export interface GymSuggestion {
  name: string
  uses: number
}

export interface ProblemPrefill {
  name: string | null
  color: string | null
  grade_value: string | null
  image_url: string | null
  beta_video_url: string | null
  gym: string | null
}

export interface BoulderBeta {
  id: string
  gym_problem_id: string
  user_id: string
  body: string | null
  video_url: string | null
  created_at: string
  worked_count: number
  worked_by_me: boolean
}

export interface BoulderReaction {
  id: string
  gym_problem_id: string
  user_id: string
  emoji: string
  created_at: string
}

export type FeedEventType = 'boulder_new' | 'send' | 'beta_added' | 'beta_worked'

export interface FeedEvent {
  event_type: FeedEventType
  event_at: string
  actor_id: string
  gym_problem_id: string
  boulder_name: string | null
  boulder_color: string | null
  boulder_grade: string | null
  boulder_image_url: string | null
  gym: string | null
  beta_id: string | null
  beta_snippet: string | null
  beta_video_url: string | null
}

export type CrewTitle = 'flash' | 'grinder' | 'first_send' | 'sandbagger'
