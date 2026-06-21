import type { OpenCV } from '../types/opencv'

const OPENCV_URL = 'https://docs.opencv.org/4.10.0/opencv.js'
let promise: Promise<OpenCV> | null = null

export function loadOpenCv(): Promise<OpenCV> {
  if (promise) return promise
  promise = new Promise<OpenCV>((resolve, reject) => {
    // Already present (e.g. a prior load).
    if (typeof window !== 'undefined' && window.cv && 'imread' in window.cv) {
      resolve(window.cv)
      return
    }
    const script = document.createElement('script')
    script.src = OPENCV_URL
    script.async = true
    script.onload = () => {
      const cv = window.cv
      if (!cv) {
        reject(new Error('OpenCV failed to initialize'))
        return
      }
      // Newer builds expose onRuntimeInitialized; if wasm is already ready, imread exists.
      if ('imread' in cv) {
        resolve(cv as OpenCV)
      } else if ('onRuntimeInitialized' in cv) {
        const cvObj = cv as { onRuntimeInitialized?: () => void }
        cvObj.onRuntimeInitialized = () => resolve(cv as OpenCV)
      } else {
        // Fallback: assume it will resolve quickly
        resolve(cv as OpenCV)
      }
    }
    script.onerror = () => {
      promise = null // allow a retry on the next open
      reject(new Error('Could not load OpenCV'))
    }
    document.body.appendChild(script)
  })
  return promise
}
