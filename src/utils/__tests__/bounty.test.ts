import { describe, it, expect } from 'vitest'
import { BOUNTY_BUDGET, remainingBudget } from '../bounty'

describe('remainingBudget', () => {
  it('is the full budget when nothing is staked', () => {
    expect(remainingBudget(0)).toBe(BOUNTY_BUDGET)
  })
  it('subtracts what is staked', () => {
    expect(remainingBudget(30)).toBe(70)
  })
  it('is zero when fully staked', () => {
    expect(remainingBudget(100)).toBe(0)
  })
  it('never goes negative', () => {
    expect(remainingBudget(150)).toBe(0)
  })
})
