import { describe, it, expect } from 'vitest'
import { RISK_MOVES, riskMoveLabel } from './riskMoves'

describe('RISK_MOVES', () => {
  it('has stable snake_case ids', () => {
    for (const m of RISK_MOVES) expect(m.id).toMatch(/^[a-z][a-z_]*$/)
  })

  it('has no duplicate ids', () => {
    const ids = RISK_MOVES.map(m => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('riskMoveLabel', () => {
  it('renders a known id', () => {
    expect(riskMoveLabel('heel_hook')).toBe('Heel-hook / drop-knee')
  })

  it('falls back to the raw stored value when the id is unknown', () => {
    // A vocabulary entry can be renamed or dropped; a row written before that
    // must still render something rather than an empty chip.
    expect(riskMoveLabel('some_retired_move')).toBe('some_retired_move')
  })

  it('renders nothing for a missing value', () => {
    expect(riskMoveLabel(null)).toBe('')
  })
})
