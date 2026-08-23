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
interface TagStat { name: string; category: string; count: number }
interface Payload {
  sessions: Session[]; problems: Problem[]
  tagStats: TagStat[]; gradeScale: 'font' | 'v_scale'
  promptTemplate?: string
}

/**
 * Groq retires models with little notice -- `llama-3.3-70b-versatile` was
 * hardcoded here and started returning model_not_found, the same way Maverick
 * went in Feb 2026 (see video-coach.ts).
 *
 * So the model is configurable: set GROQ_MODEL in Vercel to pin one, and no
 * deploy is needed the next time one is retired. With nothing set, these are
 * tried in order and a model this account cannot reach is skipped. All three
 * are text-only, which is what this endpoint wants -- the vision models live in
 * video-coach.ts.
 *
 * To see what the key can actually reach:
 *   curl -H "Authorization: Bearer $GROQ_API_KEY" https://api.groq.com/openai/v1/models
 */
const MODELS = process.env.GROQ_MODEL
  ? [process.env.GROQ_MODEL]
  : ['openai/gpt-oss-120b', 'llama-3.1-8b-instant', 'meta-llama/llama-4-scout-17b-16e-instruct']

const DEFAULT_INSTRUCTION = `You are an expert climbing coach. Analyze this athlete's last 90 days and provide a focused coaching report. Be specific and concise. Respond in exactly three sections with these exact headings:

## Insights
3-5 bullet points flagging patterns (grade trends, session frequency, strengths, weaknesses, recovery).

## Training Recommendations
What the athlete should prioritize over the next 2-4 weeks. Reference their weak move types and grade targets.

## Next Session Plan
A concrete session: warm-up, main exercises (sets/reps/load), problems to attempt (grade range per board), cool-down. Be specific.`

function buildPrompt(payload: Payload): string {
  const { sessions, problems, tagStats, gradeScale } = payload
  const instruction = payload.promptTemplate ?? DEFAULT_INSTRUCTION

  const cutoffMs = Date.now() - 90 * 24 * 60 * 60 * 1000
  const recentSessions = sessions.filter(s => new Date(s.date).getTime() >= cutoffMs)
  const sessionIdSet = new Set(recentSessions.map(s => s.id))
  const recentProblems = problems.filter(p => sessionIdSet.has(p.session_id))

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

  const strongTags = tagStats.slice(0, 6).map(t => t.name).join(', ') || 'none recorded'
  const weakTags = [...tagStats].reverse().slice(0, 6).map(t => t.name).join(', ') || 'none recorded'

  return `${instruction}

---
ATHLETE DATA (last 90 days):

Sessions: ${recentSessions.length} sessions | intensity: ${intensityLine}

Problems: ${recentProblems.length} total, ${sentProblems.length} sent (${sendRate}% send rate)
Sends by board/context:
${boardLines}

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

  let lastErr = ''
  for (const model of MODELS) {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        max_tokens: 1000,
        temperature: 0.7,
      }),
    })

    if (groqRes.ok) {
      const json = await groqRes.json() as { choices: { message: { content: string } }[] }
      const content = json.choices?.[0]?.message?.content ?? ''
      return new Response(content, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }

    lastErr = await groqRes.text()
    // model_not_found is the ONLY error that advances the list. A rate limit, a
    // bad key or a malformed prompt must surface as itself rather than being
    // retried against every candidate and reported as the last one's failure.
    if (!lastErr.includes('model_not_found')) break
  }

  return new Response(`Groq error: ${lastErr}`, { status: 503 })
}
