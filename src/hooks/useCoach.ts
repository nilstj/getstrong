import { useState, useCallback } from 'react'
import type { Session, Problem, Exercise } from '../types'
import type { TagStat } from './useProblemTags'

export interface CoachPayload {
  sessions: Session[]
  problems: Problem[]
  exercises: Exercise[]
  tagStats: TagStat[]
  gradeScale: 'font' | 'v_scale'
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        setText(prev => prev + decoder.decode(value, { stream: true }))
      }
    } catch {
      setError("Couldn't reach AI coach. Try again.")
    } finally {
      setLoading(false)
    }
  }, [])

  return { text, loading, error, trigger }
}
