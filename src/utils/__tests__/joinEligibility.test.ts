import { describe, it, expect } from 'vitest'
import { joinAffordance } from '../joinEligibility'

const base = { isMine: false, alreadyIn: false, requested: false, sharesCrew: false, verdictOut: false, hasGym: true }

describe('joinAffordance', () => {
  it('offers nothing on my own session', () => {
    expect(joinAffordance({ ...base, isMine: true })).toBe('none')
  })

  it('offers nothing when there is no gym to join', () => {
    expect(joinAffordance({ ...base, hasGym: false })).toBe('none')
  })

  it('lets a missing gym beat a crew relationship', () => {
    expect(joinAffordance({ ...base, hasGym: false, sharesCrew: true })).toBe('none')
  })

  it('still says joined with no gym, since that fact predates any current gym reading', () => {
    expect(joinAffordance({ ...base, hasGym: false, alreadyIn: true })).toBe('joined')
  })

  it('offers nothing once the verdict is out', () => {
    expect(joinAffordance({ ...base, sharesCrew: true, verdictOut: true })).toBe('none')
  })

  it('says joined when I am already in the session', () => {
    expect(joinAffordance({ ...base, alreadyIn: true })).toBe('joined')
  })

  it('says joined even if a stale request row is still around', () => {
    expect(joinAffordance({ ...base, alreadyIn: true, requested: true })).toBe('joined')
  })

  it('shows my request as pending', () => {
    expect(joinAffordance({ ...base, requested: true })).toBe('pending')
  })

  it('lets a crewmate join directly', () => {
    expect(joinAffordance({ ...base, sharesCrew: true })).toBe('join')
  })

  it('makes everyone else ask', () => {
    expect(joinAffordance(base)).toBe('ask')
  })

  it('prefers joined over every other signal', () => {
    expect(joinAffordance({ isMine: false, alreadyIn: true, requested: true, sharesCrew: true, verdictOut: false, hasGym: true })).toBe('joined')
  })

  it('lets my own session win over being already in it, since both mean no action', () => {
    expect(joinAffordance({ ...base, isMine: true, alreadyIn: true })).toBe('none')
  })
})
