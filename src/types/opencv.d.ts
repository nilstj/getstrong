// Minimal ambient declaration for the OpenCV.js surface this app uses.
export interface CvMat {
  rows: number
  cols: number
  data: Uint8Array
  type(): number
  delete(): void
}
export interface CvMatVector {
  size(): number
  get(i: number): CvMat
  delete(): void
}
export interface OpenCV {
  Mat: {
    new (): CvMat
    new (rows: number, cols: number, type: number, scalar: number[]): CvMat
    ones(rows: number, cols: number, type: number): CvMat
  }
  MatVector: { new (): CvMatVector }
  imread(canvas: HTMLCanvasElement): CvMat
  imshow(canvas: HTMLCanvasElement, mat: CvMat): void
  cvtColor(src: CvMat, dst: CvMat, code: number): void
  inRange(src: CvMat, lower: CvMat, upper: CvMat, dst: CvMat): void
  bitwise_or(a: CvMat, b: CvMat, dst: CvMat): void
  morphologyEx(src: CvMat, dst: CvMat, op: number, kernel: CvMat): void
  findContours(img: CvMat, contours: CvMatVector, hierarchy: CvMat, mode: number, method: number): void
  drawContours(dst: CvMat, contours: CvMatVector, idx: number, color: number[], thickness: number): void
  contourArea(contour: CvMat): number
  COLOR_RGBA2RGB: number
  COLOR_RGB2HSV: number
  MORPH_CLOSE: number
  MORPH_OPEN: number
  RETR_EXTERNAL: number
  CHAIN_APPROX_SIMPLE: number
  CV_8U: number
  onRuntimeInitialized?: () => void
}

declare global {
  // OpenCV.js attaches itself to window as `cv`.
  var cv: OpenCV
}
