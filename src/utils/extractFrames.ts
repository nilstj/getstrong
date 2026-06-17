// Extract a handful of evenly-spaced still frames from a local video File,
// entirely in the browser. Works on any video the browser can decode (the file
// is a local blob, so there are no CORS/canvas-tainting issues). Returns
// chronologically-ordered JPEG data URLs, downscaled to stay well under Groq's
// 4MB-per-image base64 limit.

export interface ExtractFramesOptions {
  count?: number      // number of frames (Groq Scout accepts max 5)
  maxWidth?: number   // downscale longer side to this; preserves aspect ratio
  quality?: number    // JPEG quality 0–1
}

export async function extractFrames(
  file: File,
  { count = 5, maxWidth = 720, quality = 0.7 }: ExtractFramesOptions = {},
): Promise<string[]> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.src = url
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.crossOrigin = 'anonymous'

  try {
    await once(video, 'loadedmetadata')

    let duration = video.duration
    // Some encodings report Infinity/NaN until forced to seek to the end.
    if (!isFinite(duration) || duration <= 0) {
      duration = await probeDuration(video)
    }
    if (!isFinite(duration) || duration <= 0) {
      throw new Error('Could not read video duration')
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
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      frames.push(canvas.toDataURL('image/jpeg', quality))
    }
    return frames
  } finally {
    URL.revokeObjectURL(url)
    video.removeAttribute('src')
    video.load()
  }
}

function once(el: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onOk = () => { cleanup(); resolve() }
    const onErr = () => { cleanup(); reject(new Error(`Video failed to load (${event})`)) }
    const cleanup = () => {
      el.removeEventListener(event, onOk)
      el.removeEventListener('error', onErr)
    }
    el.addEventListener(event, onOk, { once: true })
    el.addEventListener('error', onErr, { once: true })
  })
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => { cleanup(); resolve() }
    const onErr = () => { cleanup(); reject(new Error('Seek failed')) }
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onErr)
    }
    video.addEventListener('seeked', onSeeked, { once: true })
    video.addEventListener('error', onErr, { once: true })
    video.currentTime = Math.min(time, Math.max(0, (video.duration || time) - 0.05))
  })
}

// Force the browser to resolve a streaming/Infinity duration by seeking far.
function probeDuration(video: HTMLVideoElement): Promise<number> {
  return new Promise(resolve => {
    const onUpdate = () => {
      if (isFinite(video.duration) && video.duration > 0) {
        video.removeEventListener('durationchange', onUpdate)
        video.currentTime = 0
        resolve(video.duration)
      }
    }
    video.addEventListener('durationchange', onUpdate)
    video.currentTime = 1e6
  })
}
