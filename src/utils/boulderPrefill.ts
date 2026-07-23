import type { GymProblem, ProblemPrefill } from '../types'

// New-problem field defaults derived from a shared boulder.
export function boulderToPrefill(gp: GymProblem): ProblemPrefill {
  return {
    name: gp.name,
    color: gp.color,
    hold_color: gp.hold_color,
    grade_value: gp.community_grade,
    image_url: gp.image_url,
    beta_video_url: gp.beta_video_url,
    gym: gp.gym,
  }
}
