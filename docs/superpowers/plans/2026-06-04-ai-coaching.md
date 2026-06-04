# AI Coaching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-demand "Get AI Coaching" button to the Analysis page that sends the user's last 90 days of climbing data to a Vercel Edge Function, calls the Groq API (Llama 3.3 70B), and streams a structured coaching response back to the UI.

**Architecture:** A Vercel Edge Function at `/api/coach.ts` receives a data payload from the client, formats it into a coaching prompt, calls Groq's OpenAI-compatible streaming API, and pipes the text stream back. The client reads the stream chunk-by-chunk and renders it progressively. No new database queries on the server — the client sends pre-loaded data.

**Tech Stack:** React, TypeScript, TanStack Query, Tailwind CSS, Vercel Edge Functions (Web Request/Response API), Groq API (fetch, no SDK), lucide-react

---

## File Map

| Action | Path |
|---|---|
| Create | `api/coach.ts` |
| Create | `vercel.json` |
| Create | `src/hooks/useRecentExercises.ts` |
| Create | `src/hooks/useCoach.ts` |
| Modify | `src/pages/AnalysisPage.tsx` |

---

## Task 1: `useRecentExercises` hook

**Files:**
- Create: `src/hooks/useRecentExercises.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Exercise } from '../types'

export function useRecentExercises(sessionIds: string[]) {
  return useQuery({
    queryKey: ['exercises', 'recent', sessionIds],
    queryFn: async () => {
      if (sessionIds.length === 0) return [] as Exercise[]
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .in('session_id', sessionIds)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Exercise[]
    },
    enabled: sessionIds.length > 0,
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`  
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useRecentExercises.ts
git commit -m "feat: add useRecentExercises hook for AI coaching"
```

---

## Task 2: `vercel.json` configuration

**Files:**
- Create: `vercel.json`

Vercel needs to know the Vite build output directory so it can serve the SPA alongside the `/api` functions.

- [ ] **Step 1: Create `vercel.json` at the project root**

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "feat: add vercel.json for SPA + API function routing"
```

---

## Task 3: Vercel Edge Function `api/coach.ts`

**Files:**
- Create: `api/coach.ts`

This is a Vercel Edge Function (Web Request/Response API, no Node.js). It receives the user's data, builds a prompt, calls Groq with streaming enabled, transforms the SSE stream into a plain-text stream, and returns it.

**Before coding:** Add your Groq API key to Vercel:  
1. Get a free API key at https://console.groq.com  
2. In your Vercel project → Settings → Environment Variables → add `GROQ_API_KEY`

- [ ] **Step 1: Create `api/coach.ts`**

```typescript
export const config = { runtime: 'edge' }

interface Session {
  id: string; date: string; location: string
  duration_minutes: number | null; intensity: string | null
}
interface Problem {
  session_id: string; sent: boolean; board: string | null
  grade_value_font: string | null; grade_value: string | null
}
interface Exercise {
  session_id: string; name: string; sets: number | null
  reps: number | null; duration_seconds: number | null; weight_kg: number | null
}
interface TagStat { name: string; category: string; count: number }
interface Payload {
  sessions: Session[]; problems: Problem[]; exercises: Exercise[]
  tagStats: TagStat[]; gradeScale: 'font' | 'v_scale'
}

function buildPrompt(payload: Payload): string {
  const { sessions, problems, exercises, tagStats, gradeScale } = payload

  const cutoffMs = Date.now() - 90 * 24 * 60 * 60 * 1000
  const recentSessions = sessions.filter(s => new Date(s.date).getTime() >= cutoffMs)
  const sessionIdSet = new Set(recentSessions.map(s => s.id))
  const recentProblems = problems.filter(p => sessionIdSet.has(p.session_id))
  const recentExercises = exercises.filter(e => sessionIdSet.has(e.session_id))

  const sentProblems = recentProblems.filter(p => p.sent)
  const sendRate = recentProblems.length > 0
    ? Math.round(sentProblems.length / recentProblems.length * 100)
    : 0

  const byBoard: Record<string, string[]> = {}
  for (const p of sentProblems) {
    const board = p.board ?? 'outdoor'
    const grade = p.grade_value_font ?? p.grade_value
    if (grade) {
      if (!byBoard[board]) byBoard[board] = []
      byBoard[board].push(grade)
    }
  }
  const boardLines = Object.entries(byBoard)
    .map(([board, grades]) => {
      const sorted = grades.slice().sort()
      return `  - ${board}: ${grades.length} sends, hardest ${sorted[sorted.length - 1]}`
    }).join('\n') || '  (none)'

  const intensityCounts: Record<string, number> = {}
  for (const s of recentSessions) {
    if (s.intensity) intensityCounts[s.intensity] = (intensityCounts[s.intensity] ?? 0) + 1
  }
  const intensityLine = Object.entries(intensityCounts)
    .map(([k, v]) => `${k}: ${v}`).join(', ') || 'not recorded'

  const exerciseLines = recentExercises.slice(0, 12)
    .map(e => {
      const vol = e.reps != null ? `${e.sets ?? '?'}×${e.reps}` : `${e.sets ?? '?'}×${e.duration_seconds ?? '?'}s`
      return `  - ${e.name}: ${vol}${e.weight_kg ? ` @ ${e.weight_kg}kg` : ''}`
    }).join('\n') || '  (none)'

  const strongTags = tagStats.slice(0, 6).map(t => t.name).join(', ') || 'none recorded'
  const weakTags = [...tagStats].reverse().slice(0, 6).map(t => t.name).join(', ') || 'none recorded'

  return `You are an expert climbing coach. Analyze this athlete's last 90 days and provide a focused coaching report. Be specific and concise. Respond in exactly three sections with these exact headings:

## Insights
3-5 bullet points flagging patterns (grade trends, session frequency, strengths, weaknesses, recovery).

## Training Recommendations
What the athlete should prioritize over the next 2-4 weeks. Reference their weak move types, grade targets, and exercise gaps.

## Next Session Plan
A concrete session: warm-up, main exercises (sets/reps/load), problems to attempt (grade range per board), cool-down. Be specific.

---
ATHLETE DATA (last 90 days):

Sessions: ${recentSessions.length} sessions | intensity: ${intensityLine}

Problems: ${recentProblems.length} total, ${sentProblems.length} sent (${sendRate}% send rate)
Sends by board/context:
${boardLines}

Exercises:
${exerciseLines}

Climbing DNA:
  Most trained moves: ${strongTags}
  Least trained moves: ${weakTags}

Grade display preference: ${gradeScale}`
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const apiKey = process.env.GROQ_API_KEY

  if (!apiKey) {
    return new Response('GROQ_API_KEY not configured', { status: 503 })
  }

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const prompt = buildPrompt(payload)

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      max_tokens: 1000,
      temperature: 0.7,
    }),
  })

  if (!groqRes.ok) {
    const err = await groqRes.text()
    return new Response(`Groq error: ${err}`, { status: 503 })
  }

  const reader = groqRes.body!.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) { controller.close(); return }
      const text = decoder.decode(value, { stream: true })
      for (const line of text.split('\n')) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
        try {
          const json = JSON.parse(line.slice(6))
          const content = json.choices?.[0]?.delta?.content
          if (content) controller.enqueue(encoder.encode(content))
        } catch { /* skip malformed chunks */ }
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`  
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add api/coach.ts
git commit -m "feat: add Vercel edge function for AI coaching via Groq"
```

---

## Task 4: `useCoach` hook

**Files:**
- Create: `src/hooks/useCoach.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useState, useCallback } from 'react'
import type { Session, Problem, Exercise, GradeMapping } from '../types'
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`  
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCoach.ts
git commit -m "feat: add useCoach hook for streaming AI coaching response"
```

---

## Task 5: Wire up `AnalysisPage`

**Files:**
- Modify: `src/pages/AnalysisPage.tsx`

- [ ] **Step 1: Add imports at the top of `src/pages/AnalysisPage.tsx`**

Add these imports after the existing import block:

```typescript
import { useRecentExercises } from '../hooks/useRecentExercises'
import { useCoach } from '../hooks/useCoach'
import { subDays } from 'date-fns'
import { RefreshCw, Sparkles } from 'lucide-react'
```

- [ ] **Step 2: Add coaching data and state inside `AnalysisPage` function, after `const total = totalProblems(problems)`**

```typescript
  const recentSessions90 = sessions.filter(s => new Date(s.date) >= subDays(new Date(), 90))
  const recentSessionIds = recentSessions90.map(s => s.id)
  const { data: recentExercises = [] } = useRecentExercises(recentSessionIds)
  const { text: coachText, loading: coachLoading, error: coachError, trigger: triggerCoach } = useCoach()

  const handleCoach = () => {
    triggerCoach({ sessions, problems, exercises: recentExercises, tagStats, gradeScale })
  }
```

- [ ] **Step 3: Add the coaching UI between the stats card and the ClimbingDNA section**

Replace:
```tsx
      {allTagDefs.length > 0 && (
        <ClimbingDNA tagStats={tagStats} allTags={allTagDefs} />
      )}
```

With:
```tsx
      {/* AI Coaching */}
      <div>
        <button
          onClick={handleCoach}
          disabled={coachLoading}
          className="w-full bg-sage-700 text-white py-3 rounded-2xl font-medium flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
        >
          {coachLoading ? (
            <>
              <RefreshCw size={16} className="animate-spin" />
              Thinking…
            </>
          ) : (
            <>
              <Sparkles size={16} />
              Get AI Coaching
            </>
          )}
        </button>
        {coachError && (
          <p className="text-sm text-red-500 mt-2 text-center">{coachError}</p>
        )}
        {coachText && (
          <div className="mt-3 bg-white border border-gray-200 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">AI Coach</p>
              <button
                onClick={handleCoach}
                disabled={coachLoading}
                className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40"
                title="Regenerate"
              >
                <RefreshCw size={14} />
              </button>
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {coachText}
            </div>
          </div>
        )}
      </div>

      {allTagDefs.length > 0 && (
        <ClimbingDNA tagStats={tagStats} allTags={allTagDefs} />
      )}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`  
Expected: no errors

- [ ] **Step 5: Verify build passes**

Run: `npm run build`  
Expected: `✓ built in Xs` (only chunk-size warnings are OK)

- [ ] **Step 6: Commit**

```bash
git add src/pages/AnalysisPage.tsx
git commit -m "feat: add AI coaching button and streaming response to Analysis page"
```

---

## Task 6: Deploy and configure API key

- [ ] **Step 1: Push to GitHub (Vercel auto-deploys)**

```bash
git push origin main
```

- [ ] **Step 2: Add GROQ_API_KEY to Vercel**

1. Go to https://console.groq.com → API Keys → Create new key
2. Go to your Vercel project dashboard → Settings → Environment Variables
3. Add: `GROQ_API_KEY` = `<your-key>` (Production + Preview + Development)
4. Trigger a redeploy: Vercel dashboard → Deployments → Redeploy latest

- [ ] **Step 3: Test the feature**

Open the deployed app → Analysis tab → tap "Get AI Coaching"  
Expected: button shows "Thinking…", then coaching text streams in with three sections (Insights, Training Recommendations, Next Session Plan)

---

## Manual Verification Checklist

- [ ] "Get AI Coaching" button appears in Analysis page between stats card and DNA
- [ ] Button shows spinner and "Thinking…" while loading
- [ ] Text streams in progressively (appears chunk by chunk, not all at once)
- [ ] Response contains all three sections: `## Insights`, `## Training Recommendations`, `## Next Session Plan`
- [ ] Refresh icon (↺) in the response card regenerates the coaching
- [ ] If `GROQ_API_KEY` is missing or Groq is unreachable, shows "Couldn't reach AI coach. Try again."
- [ ] Button is disabled (not double-triggerable) while a request is in flight
