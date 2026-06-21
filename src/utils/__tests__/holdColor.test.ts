import { describe, it, expect } from 'vitest'
import { rgbToHsv, clampTolerance, hsvBounds } from '../holdColor'

describe('rgbToHsv', () => {
  it('converts pure red', () => {
    expect(rgbToHsv(255, 0, 0)).toEqual({ h: 0, s: 100, v: 100 })
  })
  it('converts pure green', () => {
    expect(rgbToHsv(0, 255, 0)).toEqual({ h: 120, s: 100, v: 100 })
  })
  it('converts pure blue', () => {
    expect(rgbToHsv(0, 0, 255)).toEqual({ h: 240, s: 100, v: 100 })
  })
  it('converts black (no hue/sat)', () => {
    expect(rgbToHsv(0, 0, 0)).toEqual({ h: 0, s: 0, v: 0 })
  })
  it('converts mid-gray', () => {
    expect(rgbToHsv(128, 128, 128)).toEqual({ h: 0, s: 0, v: 50 })
  })
})

describe('clampTolerance', () => {
  it('clamps below 1 up to 1', () => { expect(clampTolerance(0)).toBe(1) })
  it('clamps above 60 down to 60', () => { expect(clampTolerance(99)).toBe(60) })
  it('passes a mid value through', () => { expect(clampTolerance(15)).toBe(15) })
  it('rounds to an integer', () => { expect(clampTolerance(15.7)).toBe(16) })
})

describe('hsvBounds', () => {
  it('returns a single OpenCV-scale range for a mid-spectrum hue (blue)', () => {
    // h=240 -> opencv 120; tol 20 hue -> [100,140]
    const ranges = hsvBounds({ h: 240, s: 70, v: 80, tol: 20 })
    expect(ranges).toHaveLength(1)
    expect(ranges[0].lower[0]).toBe(100)
    expect(ranges[0].upper[0]).toBe(140)
  })
  it('splits into two ranges when the hue window wraps past 0 (red)', () => {
    // h=0 -> opencv 0; tol 20 hue -> wraps: [0..20] and [160..179]
    const ranges = hsvBounds({ h: 0, s: 70, v: 80, tol: 20 })
    expect(ranges).toHaveLength(2)
    const hues = ranges.map(r => [r.lower[0], r.upper[0]]).sort((a, b) => a[0] - b[0])
    expect(hues[0]).toEqual([0, 20])
    expect(hues[1]).toEqual([160, 179])
  })
  it('clamps saturation/value floors so dark/washed pixels are excluded', () => {
    const r = hsvBounds({ h: 240, s: 70, v: 80, tol: 20 })[0]
    // S/V lower bounded at >= 40 (opencv scale ~ 40), upper 255
    expect(r.lower[1]).toBeGreaterThanOrEqual(40)
    expect(r.lower[2]).toBeGreaterThanOrEqual(40)
    expect(r.upper[1]).toBe(255)
    expect(r.upper[2]).toBe(255)
  })
})
