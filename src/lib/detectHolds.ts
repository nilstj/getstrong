import type { OpenCV, CvMat } from '../types/opencv'
import { hsvBounds } from '../utils/holdColor'
import type { HoldHighlight } from '../types'

const OUTLINE_RGBA = [233, 30, 99, 255] // bright magenta, readable on most holds
const MIN_AREA_RATIO = 0.0005 // 0.05% of image area

// Build an HSV mask for one range; caller owns the returned Mat.
function rangeMask(cv: OpenCV, hsv: CvMat, lower: number[], upper: number[]): CvMat {
  const lo = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [...lower, 0])
  const hi = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [...upper, 255])
  const out = new cv.Mat()
  try {
    cv.inRange(hsv, lo, hi, out)
    return out
  } finally {
    lo.delete()
    hi.delete()
  }
}

export function drawHoldOutlines(
  cv: OpenCV,
  srcCanvas: HTMLCanvasElement,
  outCanvas: HTMLCanvasElement,
  sample: HoldHighlight,
): void {
  const src = cv.imread(srcCanvas)
  const rgb = new cv.Mat()
  const hsv = new cv.Mat()
  const mask = new cv.Mat()
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U)
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  const extraMasks: CvMat[] = []
  try {
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB)
    cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV)

    const ranges = hsvBounds(sample)
    const first = rangeMask(cv, hsv, ranges[0].lower, ranges[0].upper)
    // Accumulate into `mask`.
    cv.bitwise_or(first, first, mask)
    extraMasks.push(first)
    for (let i = 1; i < ranges.length; i++) {
      const m = rangeMask(cv, hsv, ranges[i].lower, ranges[i].upper)
      extraMasks.push(m)
      cv.bitwise_or(mask, m, mask)
    }

    cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel)
    cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel)

    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    const minArea = src.rows * src.cols * MIN_AREA_RATIO
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i)
      if (cv.contourArea(c) >= minArea) {
        cv.drawContours(src, contours, i, OUTLINE_RGBA, 3)
      }
    }
    cv.imshow(outCanvas, src)
  } finally {
    src.delete()
    rgb.delete()
    hsv.delete()
    mask.delete()
    kernel.delete()
    contours.delete()
    hierarchy.delete()
    for (const m of extraMasks) m.delete()
  }
}
