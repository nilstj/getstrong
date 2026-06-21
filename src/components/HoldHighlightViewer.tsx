import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Sparkles, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { loadOpenCv } from '../lib/loadOpenCv'
import { drawHoldOutlines } from '../lib/detectHolds'
import { rgbToHsv, clampTolerance } from '../utils/holdColor'
import { useUpdateHoldHighlight } from '../hooks/useHoldHighlight'
import type { OpenCV } from '../types/opencv'
import type { HoldHighlight, Problem } from '../types'

const MAX_DIM = 1024

export function HoldHighlightViewer({
  problem, isOwner, onClose,
}: { problem: Problem; isOwner: boolean; onClose: () => void }) {
  const srcCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'))
  const outCanvasRef = useRef<HTMLCanvasElement>(null)
  const cvRef = useRef<OpenCV | null>(null)
  const [sample, setSample] = useState<HoldHighlight | null>(problem.hold_highlight)
  const [ready, setReady] = useState(false)
  const [cvFailed, setCvFailed] = useState(false)
  const update = useUpdateHoldHighlight()

  // Render: outlines when cv + sample are ready, else the plain photo.
  const render = useCallback((s: HoldHighlight | null) => {
    const out = outCanvasRef.current
    const srcC = srcCanvasRef.current
    if (!out) return
    out.width = srcC.width
    out.height = srcC.height
    if (cvRef.current && s) {
      try {
        drawHoldOutlines(cvRef.current, srcC, out, s)
        return
      } catch {
        toast.error('Could not highlight holds')
      }
    }
    out.getContext('2d')?.drawImage(srcC, 0, 0)
  }, [])

  // Load image into the offscreen source canvas (downscaled), then OpenCV.
  useEffect(() => {
    if (!problem.image_url) return
    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (cancelled) return
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height))
      const srcC = srcCanvasRef.current
      srcC.width = Math.round(img.width * scale)
      srcC.height = Math.round(img.height * scale)
      srcC.getContext('2d')?.drawImage(img, 0, 0, srcC.width, srcC.height)
      render(null) // show photo immediately
      loadOpenCv()
        .then(cv => { if (cancelled) return; cvRef.current = cv; setReady(true); render(sample) })
        .catch(() => { if (cancelled) return; setCvFailed(true); toast.error("Couldn't load hold detection") })
    }
    img.onerror = () => { if (!cancelled) toast.error('Could not load image') }
    img.src = problem.image_url
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem.image_url])

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isOwner) return
    const out = outCanvasRef.current
    if (!out) return
    const rect = out.getBoundingClientRect()
    const x = Math.round(((e.clientX - rect.left) / rect.width) * out.width)
    const y = Math.round(((e.clientY - rect.top) / rect.height) * out.height)
    const px = srcCanvasRef.current.getContext('2d')?.getImageData(x, y, 1, 1).data
    if (!px) return
    const { h, s, v } = rgbToHsv(px[0], px[1], px[2])
    const next: HoldHighlight = { h, s, v, tol: sample?.tol ?? 15 }
    setSample(next)
    render(next)
  }

  const onTol = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!sample) return
    const next = { ...sample, tol: clampTolerance(Number(e.target.value)) }
    setSample(next)
    render(next)
  }

  const save = () => {
    update.mutate(
      { problemId: problem.id, sessionId: problem.session_id, value: sample },
      { onSuccess: () => { toast.success('Highlight saved'); onClose() }, onError: () => toast.error('Failed to save') },
    )
  }
  const clear = () => {
    setSample(null); render(null)
    update.mutate(
      { problemId: problem.id, sessionId: problem.session_id, value: null },
      { onSuccess: () => toast.success('Highlight cleared'), onError: () => toast.error('Failed to clear') },
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles size={16} /> Hold highlight
        </span>
        <button onClick={onClose} aria-label="Close" className="p-1"><X size={22} /></button>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center p-2">
        <canvas
          ref={outCanvasRef}
          onClick={onCanvasClick}
          className={`max-w-full max-h-full object-contain ${isOwner ? 'cursor-crosshair' : ''}`}
        />
      </div>

      <div className="px-4 py-3 space-y-3 text-white">
        {isOwner ? (
          <>
            <p className="text-xs text-gray-300">
              {cvFailed ? 'Hold detection unavailable.' : !ready ? 'Loading detection…' : sample ? 'Tap a hold to re-sample. Drag to adjust tolerance.' : 'Tap a hold to highlight matching holds.'}
            </p>
            {sample && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-300">Tolerance</span>
                <input type="range" min={1} max={60} value={sample.tol} onChange={onTol} className="flex-1 accent-sage-500" disabled={!ready} />
                <span className="text-xs w-6 text-right">{sample.tol}</span>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={save} disabled={update.isPending || cvFailed} className="flex-1 bg-sage-600 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">Save</button>
              {problem.hold_highlight && (
                <button onClick={clear} disabled={update.isPending} className="px-4 bg-white/10 text-white py-2.5 rounded-xl text-sm">Clear</button>
              )}
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-300 text-center flex items-center justify-center gap-1.5">
            {!ready && !cvFailed && <Loader2 size={13} className="animate-spin" />}
            {cvFailed ? 'Hold detection unavailable.' : sample ? 'Holds highlighted by the climber.' : 'No highlight set for this problem.'}
          </p>
        )}
      </div>
    </div>
  )
}
