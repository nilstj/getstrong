import type { GymProblem, ProblemPrefill } from '../types'

// New-problem field defaults derived from a shared boulder.
export function boulderToPrefill(gp: GymProblem): ProblemPrefill {
  return {
    color: gp.color,
    hold_color: gp.hold_color,
    grade_value: gp.community_grade,
    image_url: gp.image_url,
    beta_video_url: gp.beta_video_url,
    gym: gp.gym,
  }
}

/**
 * Whether the problem form's Visible toggle starts on Public.
 *
 * A new problem starts Public: logging in a gym is a social act, and a boulder
 * nobody else can see is a boulder nobody else can learn from.
 *
 * An EXISTING problem reports its actual state instead, and that distinction is
 * the whole reason this is a function. A flat `true` would show Public when you
 * open a private problem to fix a typo, and saving would publish it to the gym
 * without you having asked — the toggle is also the control that publishes.
 */
export function defaultVisibilityPublic(
  existing: { gym_problem_id: string | null } | undefined,
): boolean {
  if (!existing) return true
  return !!existing.gym_problem_id
}
