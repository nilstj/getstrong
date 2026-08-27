import { describe, it, expect } from 'vitest'
import { betaNotificationText } from '../betaNotification'

// The shared half of every case: only the fields under test vary.
const base = {
  actor: 'Ada',
  label: 'the blue 6C',
  gym: 'Klatreverket',
  body: null,
  riskMove: null,
} as const

describe('betaNotificationText', () => {
  it('tells an asker their ask was answered', () => {
    const { text } = betaNotificationText({ ...base, type: 'beta_answered', kind: 'beta' })
    expect(text).toBe('Ada answered your ask for beta on the blue 6C at Klatreverket')
  })

  it('tells a projector, and says why they are hearing about it', () => {
    const { text } = betaNotificationText({ ...base, type: 'beta_on_project', kind: 'beta' })
    expect(text).toBe("Ada posted beta on the blue 6C at Klatreverket — you're working on it")
  })

  it('never calls a caution "beta" to an asker', () => {
    const { text } = betaNotificationText({ ...base, type: 'beta_answered', kind: 'caution' })
    expect(text).toBe(
      'Ada flagged a move to watch out for on the blue 6C at Klatreverket — you asked for beta ⚠️',
    )
    expect(text).not.toContain('beta on')
  })

  it('never calls a caution "beta" to a projector', () => {
    const { text } = betaNotificationText({ ...base, type: 'beta_on_project', kind: 'caution' })
    expect(text).toBe(
      "Ada flagged a move to watch out for on the blue 6C at Klatreverket — you're working on it ⚠️",
    )
    expect(text).not.toContain('posted beta')
  })

  it('omits the gym clause when the gym is unknown', () => {
    const { text } = betaNotificationText({ ...base, gym: null, type: 'beta_answered', kind: 'beta' })
    expect(text).toBe('Ada answered your ask for beta on the blue 6C')
    expect(text).not.toContain(' at ')
  })

  it('quotes the tip as the detail line', () => {
    const { detail } = betaNotificationText({
      ...base, type: 'beta_on_project', kind: 'beta', body: 'heel hook the arête',
    })
    expect(detail).toBe('"heel hook the arête"')
  })

  it('has no detail line for a video-only beta', () => {
    // body is null when a beta is a bare video link — 052's constraint allows it.
    const { detail } = betaNotificationText({ ...base, type: 'beta_on_project', kind: 'beta' })
    expect(detail).toBeUndefined()
  })

  it('treats a whitespace-only tip as no tip', () => {
    const { detail } = betaNotificationText({
      ...base, type: 'beta_on_project', kind: 'beta', body: '   ',
    })
    expect(detail).toBeUndefined()
  })

  it('shows the risk move as the detail line for a caution, not the tip', () => {
    const { detail } = betaNotificationText({
      ...base, type: 'beta_answered', kind: 'caution',
      riskMove: 'heel_hook', body: 'go static instead',
    })
    expect(detail).toBe('Heel-hook / drop-knee')
  })

  it('falls back to the raw risk move id when it is not in the vocabulary', () => {
    // 090 constrains risk_move to seven ids, so this is defence against a row
    // written before a future id is added to the client's RISK_MOVES.
    const { detail } = betaNotificationText({
      ...base, type: 'beta_answered', kind: 'caution', riskMove: 'mantel',
    })
    expect(detail).toBe('mantel')
  })

  it('has no detail line for a caution with no move', () => {
    // 090's boulder_beta_caution_shape forbids this, so it is pure defence.
    const { detail } = betaNotificationText({ ...base, type: 'beta_answered', kind: 'caution' })
    expect(detail).toBeUndefined()
  })

  it('reads an unknown kind as a plain beta', () => {
    // A future kind must degrade to the neutral sentence, never to caution
    // wording that would claim a hazard nobody reported.
    const { text } = betaNotificationText({ ...base, type: 'beta_answered', kind: 'mystery' })
    expect(text).toBe('Ada answered your ask for beta on the blue 6C at Klatreverket')
  })

  it('reads a missing kind as a plain beta', () => {
    const { text } = betaNotificationText({ ...base, type: 'beta_on_project', kind: null })
    expect(text).toBe("Ada posted beta on the blue 6C at Klatreverket — you're working on it")
  })
})
