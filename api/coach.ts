/// <reference types="node" />
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
  promptTemplate?: string
}

const DEFAULT_INSTRUCTION = `You are an expert climbing coach. Analyze this athlete's last 90 days and provide a focused coaching report. Be specific and concise. Respond in exactly three sections with these exact headings:

## Insights
3-5 bullet points flagging patterns (grade trends, session frequency, strengths, weaknesses, recovery).

## Training Recommendations
What the athlete should prioritize over the next 2-4 weeks. Reference their weak move types, grade targets, and exercise gaps.

## Next Session Plan
A concrete session: warm-up, main exercises (sets/reps/load), problems to attempt (grade range per board), cool-down. Be specific.`

function buildPrompt(payload: Payload): string {
  const { sessions, problems, exercises, tagStats, gradeScale } = payload
  const instruction = payload.promptTemplate ?? DEFAULT_INSTRUCTION

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
    const board = p.board ?? 'gym'
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

  return `${instruction}

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
      stream: false,
      max_tokens: 1000,
      temperature: 0.7,
    }),
  })

  if (!groqRes.ok) {
    const err = await groqRes.text()
    return new Response(`Groq error: ${err}`, { status: 503 })
  }

  const json = await groqRes.json() as { choices: { message: { content: string } }[] }
  const content = json.choices?.[0]?.message?.content ?? ''

  return new Response(content, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
