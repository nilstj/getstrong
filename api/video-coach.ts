/// <reference types="node" />
export const config = { runtime: 'edge' }

// Groq vision model. Llama 4 Scout accepts up to 5 images per request.
// (Maverick was deprecated Feb 2026; gpt-oss is text-only — Scout is the
// vision option on GroqCloud.)
const MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'
const MAX_FRAMES = 5

interface VideoCoachPayload {
  // Ordered, chronological still frames as data URLs (data:image/jpeg;base64,…)
  // or https image URLs. Capped at 5 by the client and again here.
  frames: string[]
  context?: {
    grade?: string | null
    board?: string | null
    notes?: string | null
  }
}

function buildInstruction(payload: VideoCoachPayload): string {
  const c = payload.context
  const ctxLines: string[] = []
  if (c?.grade) ctxLines.push(`Grade: ${c.grade}`)
  if (c?.board) ctxLines.push(`Wall/board: ${c.board}`)
  if (c?.notes) ctxLines.push(`Climber's note: ${c.notes}`)
  const ctx = ctxLines.length ? `\n\nContext provided by the climber:\n${ctxLines.join('\n')}` : ''

  return `You are an elite bouldering and climbing coach. The ${payload.frames.length} images attached are still frames sampled in chronological order from a single climbing attempt (early → late). They are sparse stills, not continuous video, so infer movement between frames cautiously and say when you are unsure.${ctx}

Give a focused, professional coaching analysis. Respond in markdown with exactly these headings:

## What I See
Body position, center of gravity, hip/foot placement and how they change across the sequence. Reference frames as early/mid/late.

## Technique Feedback
2-4 specific, actionable corrections (e.g. flagging, hip engagement, straight arms, foot precision). Be concrete about what to change and why.

## Drills
2-3 concrete drills or cues to address the issues above.

Be specific and concise. Do not invent details you cannot see in the frames.`
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return new Response('GROQ_API_KEY not configured', { status: 503 })
  }

  let payload: VideoCoachPayload
  try {
    payload = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const frames = (payload.frames ?? []).slice(0, MAX_FRAMES)
  if (frames.length === 0) {
    return new Response('No frames provided', { status: 400 })
  }

  const content = [
    { type: 'text', text: buildInstruction({ ...payload, frames }) },
    ...frames.map(url => ({ type: 'image_url', image_url: { url } })),
  ]

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content }],
      stream: false,
      max_tokens: 1200,
      temperature: 0.6,
    }),
  })

  if (!groqRes.ok) {
    const err = await groqRes.text()
    return new Response(`Groq error: ${err}`, { status: 503 })
  }

  const json = await groqRes.json() as { choices: { message: { content: string } }[] }
  const text = json.choices?.[0]?.message?.content ?? ''

  return new Response(text, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
