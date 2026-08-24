import { describe, it, expect } from 'vitest'
import {
  exportFilename, summariseExport, deletionConfirmationMatches,
  type ExportEnvelope,
} from '../myData'

const envelope = (over: Partial<ExportEnvelope> = {}): ExportEnvelope => ({
  generated_at: '2026-08-24T10:00:00Z',
  user_id: 'u1',
  data: {},
  unmapped_tables: [],
  ...over,
})

describe('exportFilename', () => {
  it('names the file for the day it was generated', () => {
    expect(exportFilename(new Date(2026, 7, 24))).toBe('moresends-export-2026-08-24.json')
  })
})

describe('summariseExport', () => {
  it('counts rows across every section', () => {
    const s = summariseExport(envelope({
      data: { 'sessions.user_id': [{}, {}, {}], 'problems.user_id': [{}] },
    }))
    expect(s.rowCount).toBe(4)
    expect(s.tableCount).toBe(2)
  })

  it('reports an empty log as zero rather than throwing', () => {
    expect(summariseExport(envelope())).toEqual({ rowCount: 0, tableCount: 0, unmapped: [] })
  })

  it('passes through the tables the export could not reach', () => {
    expect(summariseExport(envelope({ unmapped_tables: ['new_table'] })).unmapped)
      .toEqual(['new_table'])
  })
})

describe('deletionConfirmationMatches', () => {
  it('accepts the username', () => {
    expect(deletionConfirmationMatches('nils', 'nils')).toBe(true)
  })

  it('forgives surrounding space and capitals', () => {
    expect(deletionConfirmationMatches('  NILS ', 'nils')).toBe(true)
  })

  it('rejects a near miss', () => {
    expect(deletionConfirmationMatches('nil', 'nils')).toBe(false)
  })

  it('rejects an empty confirmation', () => {
    expect(deletionConfirmationMatches('', 'nils')).toBe(false)
    expect(deletionConfirmationMatches('   ', 'nils')).toBe(false)
  })

  it('cannot be satisfied when there is no username to type', () => {
    expect(deletionConfirmationMatches('', null)).toBe(false)
    expect(deletionConfirmationMatches('anything', null)).toBe(false)
    expect(deletionConfirmationMatches('', undefined)).toBe(false)
  })
})
