import { useState, useCallback } from 'react'

export interface VideoCoachContext {
  grade?: string | null
  board?: string | null
  notes?: string | null
}

export function useVideoCoach() {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trigger = useCallback(async (frames: string[], context?: VideoCoachContext) => {
    setText('')
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/video-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frames, context }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(body || `HTTP ${res.status}`)
      }
      setText(await res.text())
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(`Video analysis error: ${msg}`)
    } finally {
      setLoading(false)
    }
  }, [])

  return { text, loading, error, trigger }
}
