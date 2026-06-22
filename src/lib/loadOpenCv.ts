import type { OpenCV } from '../types/opencv'

// 4.10.0 is NOT hosted on docs.opencv.org (404); 4.9.0 is the latest that is.
const OPENCV_URL = 'https://docs.opencv.org/4.9.0/opencv.js'
const READY_TIMEOUT_MS = 30000
let promise: Promise<OpenCV> | null = null

// OpenCV.js is "ready" once the wasm runtime has initialized and attached its
// methods to `window.cv`. Detecting that via `onRuntimeInitialized` is racy
// (the callback may be assigned after init already fired, and never run), so we
// poll for an actual usable method instead.
function cvReady(): boolean {
  const cv = window.cv as { imread?: unknown } | undefined
  return !!cv && typeof cv.imread === 'function'
}

export function loadOpenCv(): Promise<OpenCV> {
  if (promise) return promise
  promise = new Promise<OpenCV>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('OpenCV requires a browser'))
      return
    }
    if (cvReady()) {
      resolve(window.cv)
      return
    }

    let settled = false
    const started = Date.now()
    const poll = () => {
      if (settled) return
      if (cvReady()) {
        settled = true
        resolve(window.cv)
        return
      }
      if (Date.now() - started > READY_TIMEOUT_MS) {
        settled = true
        promise = null // allow a retry on the next open
        reject(new Error('OpenCV did not initialize in time'))
        return
      }
      setTimeout(poll, 50)
    }

    // Inject the script once; if it's already on the page (e.g. a prior attempt
    // that timed out), just keep polling for the runtime to come up.
    if (!document.querySelector(`script[src="${OPENCV_URL}"]`)) {
      const script = document.createElement('script')
      script.src = OPENCV_URL
      script.async = true
      script.onerror = () => {
        if (settled) return
        settled = true
        promise = null // allow a retry on the next open
        reject(new Error('Could not load OpenCV'))
      }
      document.body.appendChild(script)
    }

    poll()
  })
  return promise
}
