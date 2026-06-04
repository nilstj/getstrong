# AI Coaching Feature Design

**Date:** 2026-06-04  
**Status:** Approved

## Overview

An on-demand AI coaching feature in the Analysis page. The user taps "Get AI Coaching", the app sends their last 90 days of climbing data to a Vercel serverless function, which calls the Groq API (Llama 3.3 70B) and streams back a structured coaching response — insights, training recommendations, and a concrete next-session plan.

---

## Architecture

```
AnalysisPage
  → user taps "Get AI Coaching"
  → collects data already in React Query cache (no extra fetches)
  → POST /api/coach  { sessions, problems, exercises, tagStats, testResults }
       Vercel serverless function (api/coach.ts)
  → formats summarized prompt (~1500 tokens)
  → calls Groq API (llama-3.3-70b-versatile) with streaming
  → streams text response back to frontend
  → AnalysisPage renders streamed markdown in three sections
```

The function never reads from the database directly. It receives pre-aggregated data from the client (which already holds auth and has loaded the data) and forwards a formatted prompt to Groq. `GROQ_API_KEY` is configured once as a Vercel environment variable.

---

## Backend — `/api/coach.ts`

**Method:** POST  
**Request body:**
```typescript
{
  sessions: Session[]          // last 90 days
  problems: Problem[]          // all problems from those sessions
  exercises: Exercise[]        // all exercises from those sessions
  tagStats: TagStat[]          // user's tag usage stats
  testResults: TestResult[]    // latest strength test results
  gradeScale: 'font' | 'v_scale'
  gradeMappings: GradeMapping[]
}
```

**Response:** `text/plain` stream (Groq streaming response forwarded directly)

**Prompt structure:**

```
You are an expert climbing coach. Analyze the athlete's last 90 days and respond in exactly three sections with these exact headings:

## Insights
3-5 bullet points flagging patterns (grade plateaus, session frequency, undertrained move types, etc.)

## Training Recommendations
What the athlete should focus on over the next 2-4 weeks, referencing their weak move types, grade trends, and exercise history.

## Next Session Plan
A concrete plan: warm-up, main exercises (sets/reps/load), problems to attempt (grade targets per board), cool-down.

---
Athlete data:
[summarized data — not raw JSON, formatted as readable text to keep tokens low]
```

**Data summarization** (done in the function, not the client):
- Sessions: count, weeks active, avg sessions/week, locations, intensity breakdown
- Problems: hardest sent per board, overall send rate, most-used tags, least-used tags (weak spots)
- Exercises: list of recent exercises with sets/reps/weight
- Strength tests: latest result per test (name, value, unit)
- DNA: top 5 strong tags, top 5 weak tags

**Estimated token usage:** ~1500 input, ~800 output = ~2300 tokens per request. Groq free tier allows 14,400 req/day at 6000 tokens/req — well within limits.

---

## Frontend — `AnalysisPage.tsx`

**New state:**
- `coachingText: string` — accumulated streamed response
- `coachingLoading: boolean`
- `coachingError: string | null`

**New data fetched for the button:**
- Exercises: a new `useRecentExercises(sessionIds)` hook that fetches all exercises for the given session IDs in a single Supabase query (`.in('session_id', sessionIds)`)
- Strength test results: fetched inline via a single Supabase query for the user's latest result per test

**UI placement:** Between the stats card and the Climbing DNA section.

**Button:**
```
[ ✨ Get AI Coaching ]   (sage green, full width, disabled while loading)
```

**Loading state:** Button shows "Thinking…" with a spinner, disabled.

**Response card:**
- Appears below the button once streaming starts
- Renders markdown text progressively as chunks arrive
- A small refresh icon (↺) in the top-right of the card lets the user regenerate
- The card stays visible until the user navigates away or regenerates

**Error state:** Inline red text below the button: "Couldn't reach AI coach. Try again."

---

## New Files

| File | Purpose |
|---|---|
| `api/coach.ts` | Vercel serverless function — formats prompt, calls Groq, streams response |
| `src/hooks/useCoach.ts` | React hook — manages fetch state, streams response into `coachingText` |

## Modified Files

| File | Change |
|---|---|
| `src/pages/AnalysisPage.tsx` | Add coaching button + response card between stats and DNA |
| `src/hooks/useRecentExercises.ts` | New hook — fetches exercises for a list of session IDs |
| `src/pages/AnalysisPage.tsx` | Add coaching button + response card between stats and DNA |

---

## Out of Scope

- Caching AI responses between sessions
- Automatic post-session coaching nudges
- User feedback on coaching quality
- Fine-tuning or custom models
- Any data sent to the AI is not stored
