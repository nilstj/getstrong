import { useState, useCallback } from 'react'
import type { Session, Problem, Exercise } from '../types'
import type { TagStat } from './useProblemTags'

export interface CoachPayload {
  sessions: Session[]
  problems: Problem[]
  exercises: Exercise[]
  tagStats: TagStat[]
  gradeScale: 'font' | 'v_scale'
  promptTemplate?: string
}

export function useCoach() {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trigger = useCallback(async (payload: CoachPayload) => {
    setText('')
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(body || `HTTP ${res.status}`)
      }
      const result = await res.text()
      setText(result)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(`AI coach error: ${msg}`)
    } finally {
      setLoading(false)
    }
  }, [])

  return { text, loading, error, trigger }
}
