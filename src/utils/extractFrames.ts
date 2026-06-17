// Extract a handful of evenly-spaced still frames from a local video File,
// entirely in the browser. Works on any video the browser can decode (the file
// is a local blob, so there are no CORS/canvas-tainting issues). Returns
// chronologically-ordered JPEG data URLs, downscaled to stay well under Groq's
// 4MB-per-image base64 limit.
//
// Every wait is time-bounded so a stalled decode surfaces as a clear error
// instead of hanging forever.

export interface ExtractFramesOptions {
  count?: number      // number of frames (Groq Scout accepts max 5)
  maxWidth?: number   // downscale longer side to this; preserves aspect ratio
  quality?: number    // JPEG quality 0–1
}

const METADATA_TIMEOUT_MS = 15000
const SEEK_TIMEOUT_MS = 10000

export async function extractFrames(
  file: File,
  { count = 5, maxWidth = 720, quality = 0.7 }: ExtractFramesOptions = {},
): Promise<string[]> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  // Some browsers refuse to decode/seek a <video> that isn't in the document,
  // so park it off-screen rather than leaving it detached.
  video.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none'
  document.body.appendChild(video)
  video.src = url

  const cleanup = () => {
    video.remove()
    video.removeAttribute('src')
    try { video.load() } catch { /* ignore */ }
    URL.revokeObjectURL(url)
  }

  try {
    await waitForEvent(video, ['loadedmetadata'], METADATA_TIMEOUT_MS, 'load video metadata')

    let duration = video.duration
    if (!isFinite(duration) || duration <= 0) {
      duration = await probeDuration(video)
    }
    if (!isFinite(duration) || duration <= 0) {
      throw new Error('Could not read this video’s duration')
    }

    // loadedmetadata only guarantees dimensions/duration — we need an actual
    // decodable frame (readyState >= HAVE_CURRENT_DATA) before seeking.
    //
    // iOS WebKit (every iPhone browser, incl. Firefox) ignores `preload` and
    // won't buffer frame data until playback starts. A muted, inline play() is
    // allowed without a user gesture and kicks the decoder; we pause once a
    // frame is available, then seek.
    if (video.readyState < 2 /* HAVE_CURRENT_DATA */) {
      try {
        const p = video.play()
        if (p && typeof p.catch === 'function') p.catch(() => { /* autoplay may be blocked */ })
      } catch { /* ignore */ }
      try {
        await waitForEvent(video, ['loadeddata', 'canplay', 'playing'], METADATA_TIMEOUT_MS, 'buffer video data')
      } finally {
        try { video.pause() } catch { /* ignore */ }
      }
    }

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas not supported')

    const vw = video.videoWidth || maxWidth
    const vh = video.videoHeight || maxWidth
    const scale = Math.min(1, maxWidth / Math.max(vw, vh))
    canvas.width = Math.round(vw * scale)
    canvas.height = Math.round(vh * scale)

    const frames: string[] = []
    for (let i = 1; i <= count; i++) {
      // Spread timestamps across the clip, avoiding the very first/last frame.
      const t = (duration * i) / (count + 1)
      await seek(video, t)
      await nextFrame() // let the seeked frame paint before we read it
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      frames.push(canvas.toDataURL('image/jpeg', quality))
    }
    return frames
  } finally {
    cleanup()
  }
}

function waitForEvent(
  el: HTMLVideoElement,
  events: string[],
  timeoutMs: number,
  what: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      for (const ev of events) el.removeEventListener(ev, onOk)
      el.removeEventListener('error', onErr)
      fn()
    }
    const onOk = () => finish(resolve)
    const onErr = () => finish(() => reject(new Error(`Failed to ${what}`)))
    const timer = setTimeout(
      () => finish(() => reject(new Error(`Timed out trying to ${what}`))),
      timeoutMs,
    )
    for (const ev of events) el.addEventListener(ev, onOk, { once: true })
    el.addEventListener('error', onErr, { once: true })
  })
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onErr)
      fn()
    }
    const onSeeked = () => finish(resolve)
    const onErr = () => finish(() => reject(new Error('Seek failed')))
    const timer = setTimeout(
      () => finish(() => reject(new Error(`Timed out seeking to ${time.toFixed(1)}s`))),
      SEEK_TIMEOUT_MS,
    )
    video.addEventListener('seeked', onSeeked, { once: true })
    video.addEventListener('error', onErr, { once: true })

    const target = Math.min(time, Math.max(0, (video.duration || time) - 0.1))
    // If currentTime is already at the target, no 'seeked' will fire — resolve.
    if (Math.abs(video.currentTime - target) < 0.01) {
      finish(resolve)
    } else {
      video.currentTime = target
    }
  })
}

function nextFrame(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

// Force the browser to resolve a streaming/Infinity duration by seeking far.
function probeDuration(video: HTMLVideoElement): Promise<number> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      video.removeEventListener('durationchange', onUpdate)
      fn()
    }
    const onUpdate = () => {
      if (isFinite(video.duration) && video.duration > 0) {
        const d = video.duration
        finish(() => { video.currentTime = 0; resolve(d) })
      }
    }
    const timer = setTimeout(
      () => finish(() => reject(new Error('Timed out reading video duration'))),
      METADATA_TIMEOUT_MS,
    )
    video.addEventListener('durationchange', onUpdate)
    video.currentTime = 1e6
  })
}
