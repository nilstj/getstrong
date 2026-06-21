import type { HoldHighlight } from '../types'

export type CvRange = { lower: [number, number, number]; upper: [number, number, number] }

export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : d / max
  return { h: Math.round(h), s: Math.round(s * 100), v: Math.round(max * 100) }
}

export function clampTolerance(tol: number): number {
  return Math.min(60, Math.max(1, Math.round(tol)))
}

// Convert the stored standard-scale HSV sample + tolerance into one or two
// OpenCV-scale ranges (H 0-179, S/V 0-255). Two ranges when the hue window
// wraps past the 0/179 boundary.
export function hsvBounds(sample: HoldHighlight): CvRange[] {
  const hCenter = Math.round(sample.h / 2)
  const hTol = clampTolerance(sample.tol)
  const sFloor = 40, vFloor = 40
  const lo = hCenter - hTol
  const hi = hCenter + hTol

  if (lo < 0) {
    return [
      { lower: [0, sFloor, vFloor], upper: [hi, 255, 255] },
      { lower: [180 + lo, sFloor, vFloor], upper: [179, 255, 255] },
    ]
  }
  if (hi > 179) {
    return [
      { lower: [lo, sFloor, vFloor], upper: [179, 255, 255] },
      { lower: [0, sFloor, vFloor], upper: [hi - 180, 255, 255] },
    ]
  }
  return [{ lower: [lo, sFloor, vFloor], upper: [hi, 255, 255] }]
}
