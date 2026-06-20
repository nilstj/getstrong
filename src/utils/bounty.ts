export const BOUNTY_BUDGET = 100

export function remainingBudget(staked: number): number {
  return Math.max(0, BOUNTY_BUDGET - staked)
}
