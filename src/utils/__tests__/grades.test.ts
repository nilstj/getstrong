import { describe, it, expect } from 'vitest'
import {
  vScaleToFont,
  fontToVScale,
  normalizeToFont,
  fontGradeToIndex,
  gradeSystemFor,
  FONT_GRADES_ORDERED,
  V_GRADES,
} from '../grades'
import type { GradeMapping } from '../../types'

const MAPPINGS: GradeMapping[] = [
  { v_scale: 'V0', font_equivalent: '4' },
  { v_scale: 'V5', font_equivalent: '6C+' },
  { v_scale: 'V6', font_equivalent: '7A' },
  { v_scale: 'V10', font_equivalent: '7C+' },
]

describe('vScaleToFont', () => {
  it('converts a known V grade to Font', () => {
    expect(vScaleToFont('V6', MAPPINGS)).toBe('7A')
  })
  it('returns null for an unknown grade', () => {
    expect(vScaleToFont('V99', MAPPINGS)).toBeNull()
  })
})

describe('fontToVScale', () => {
  it('converts a known Font grade to V scale', () => {
    expect(fontToVScale('7A', MAPPINGS)).toBe('V6')
  })
  it('returns null for an unknown grade', () => {
    expect(fontToVScale('9C', MAPPINGS)).toBeNull()
  })
})

describe('normalizeToFont', () => {
  it('returns the grade as-is for font system', () => {
    expect(normalizeToFont('font', '7A', MAPPINGS)).toBe('7A')
  })
  it('converts v_scale to font equivalent', () => {
    expect(normalizeToFont('v_scale', 'V6', MAPPINGS)).toBe('7A')
  })
  it('returns null for color system', () => {
    expect(normalizeToFont('color', null, MAPPINGS)).toBeNull()
  })
  it('returns null when grade_value is null', () => {
    expect(normalizeToFont('v_scale', null, MAPPINGS)).toBeNull()
  })
})

describe('fontGradeToIndex', () => {
  it('returns the correct index for a known grade', () => {
    const idx = FONT_GRADES_ORDERED.indexOf('7A')
    expect(fontGradeToIndex('7A')).toBe(idx)
  })
  it('returns -1 for an unknown grade', () => {
    expect(fontGradeToIndex('99Z')).toBe(-1)
  })
})

describe('V_GRADES', () => {
  it('starts with VB and ends with V17', () => {
    expect(V_GRADES[0]).toBe('VB')
    expect(V_GRADES[V_GRADES.length - 1]).toBe('V17')
  })
})

describe('gradeSystemFor', () => {
  it('recognizes V grades regardless of case', () => {
    expect(gradeSystemFor('V5')).toBe('v_scale')
    expect(gradeSystemFor('v5')).toBe('v_scale')
    expect(gradeSystemFor('VB')).toBe('v_scale')
  })
  it('recognizes Font grades', () => {
    expect(gradeSystemFor('6C')).toBe('font')
    expect(gradeSystemFor('6C+')).toBe('font')
    expect(gradeSystemFor('5+')).toBe('font')
    expect(gradeSystemFor('3')).toBe('font')
  })
  it('trims whitespace before checking', () => {
    expect(gradeSystemFor(' V5 ')).toBe('v_scale')
  })
  it('defaults to font for an empty string', () => {
    expect(gradeSystemFor('')).toBe('font')
  })
})
