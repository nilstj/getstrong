import type { GradeMapping, GradeSystem } from '../types'

export const FONT_GRADES_ORDERED = [
  '3', '4', '5', '5+',
  '6A', '6A+', '6B', '6B+', '6C', '6C+',
  '7A', '7A+', '7B', '7B+', '7C', '7C+',
  '8A', '8A+', '8B', '8B+', '8C', '8C+',
  '9A',
]

export const V_GRADES = [
  'VB', 'V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8',
  'V9', 'V10', 'V11', 'V12', 'V13', 'V14', 'V15', 'V16', 'V17',
]

export function vScaleToFont(vGrade: string, mappings: GradeMapping[]): string | null {
  return mappings.find(m => m.v_scale === vGrade)?.font_equivalent ?? null
}

export function fontToVScale(fontGrade: string, mappings: GradeMapping[]): string | null {
  return mappings.find(m => m.font_equivalent === fontGrade)?.v_scale ?? null
}

export function normalizeToFont(
  gradeSystem: GradeSystem,
  gradeValue: string | null,
  mappings: GradeMapping[],
): string | null {
  if (gradeSystem === 'color' || gradeValue === null) return null
  if (gradeSystem === 'font') return gradeValue
  return vScaleToFont(gradeValue, mappings)
}

export function fontGradeToIndex(grade: string): number {
  return FONT_GRADES_ORDERED.indexOf(grade)
}
