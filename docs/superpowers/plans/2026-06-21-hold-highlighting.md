# Hold Highlighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a climber tap a hold in their boulder photo to sample its color and highlight every matching hold with colored contour outlines, saved on the problem and visible to anyone viewing the image.

**Architecture:** A lazy-loaded full-screen `HoldHighlightViewer` renders the photo on a canvas; OpenCV.js (pinned CDN, loaded once on first open) builds an HSV color mask around the sampled hold color, cleans it with morphology, finds contours, and draws outlines. The owner taps to sample + adjusts tolerance + saves; the sample (HSV + tolerance) persists in a new `problems.hold_highlight` jsonb column that all viewers read. Pure color math is isolated and unit-tested; the OpenCV pipeline and component are verified by typecheck/build.

**Tech Stack:** React 18 + TypeScript, `@tanstack/react-query`, Supabase, Tailwind, `react-hot-toast`, `lucide-react`, OpenCV.js (runtime via pinned CDN), Vitest (jsdom).

## Global Constraints

- **OpenCV.js is loaded lazily from a pinned CDN** (`https://docs.opencv.org/4.10.0/opencv.js`) via a one-time script injection, only when a viewer first opens — never in the main bundle or on other screens. (Decision: CDN over vendoring, to avoid a ~9MB repo/diff binary; revisit if a strict CSP is added.)
- **No `any`.** OpenCV has no bundled types; declare a minimal ambient `OpenCV` interface (`src/types/opencv.d.ts`) covering only the surface used. `@typescript-eslint/no-explicit-any` is an error here.
- **Stored shape:** `problems.hold_highlight jsonb` = `{ "h": 0-360, "s": 0-100, "v": 0-100, "tol": <int> }`, or `null`. HSV is standard-scale in storage; convert to OpenCV's scale (H 0-179, S/V 0-255) only inside `hsvBounds`.
- **No new RLS/RPC.** `problems` is world-readable (migration 015) and owner-writable (migration 001); the owner saves with a plain `update`, viewers read via `select('*')`.
- **Tuning defaults:** downscale so the longest image side ≤ **1024px** before processing; morphology kernel **3×3**; drop contours with area < **0.05%** of the (downscaled) image area.
- **OpenCV memory:** every `cv.Mat` / `cv.MatVector` created MUST be `.delete()`d (wasm has no GC). Use try/finally.
- **Migrations are numbered SQL applied manually** (no CLI/local DB, no SQL test harness); make them re-runnable. Verify by reading + the provided query.
- **Tests exist only for pure utilities** (`src/utils/__tests__/`). Hooks/components/pipeline verified via `npx tsc -b` + `npm run lint` (baseline 17, 0 new) + `npm run build`. TDD only for the pure helpers in Task 2.
- **Naming/style:** React Query array keys, `useX` hooks, `sage-700` accent, `lucide-react` icons, `react-hot-toast`. Follow existing patterns.
- **Out of scope:** inline outlines on thumbnails/lists, the Crew page surface, multiple colors per problem, a separate on/off toggle (non-null `hold_highlight` is the signal), ML detection.

---

### Task 1: Migration 049 — `problems.hold_highlight` column

**Files:**
- Create: `supabase/migrations/049_hold_highlight.sql`

**Interfaces:**
- Produces (relied on by Tasks 2, 4): `problems.hold_highlight jsonb null`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/049_hold_highlight.sql`:

```sql
-- Hold highlighting: store the sampled hold color (HSV) + tolerance per problem
-- so the highlight persists and is visible to anyone viewing the photo.
-- Additive; problems is already owner-writable (001) and world-readable (015),
-- so no new policy is needed.
alter table problems
  add column if not exists hold_highlight jsonb;
```

- [ ] **Step 2: Self-review**

Confirm: additive `add column if not exists`, nullable (no default → null), `jsonb`. No policy change needed.

- [ ] **Step 3: Apply via the Supabase SQL editor and verify**

Apply `049_hold_highlight.sql`, then:

```sql
select column_name, data_type from information_schema.columns
 where table_name = 'problems' and column_name = 'hold_highlight';
```
Expected: one row, `jsonb`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/049_hold_highlight.sql
git commit -m "feat: add problems.hold_highlight column (migration 049)"
```

---

### Task 2: `HoldHighlight` type + pure color helpers (TDD)

**Files:**
- Modify: `src/types/index.ts` (add `HoldHighlight`, extend `Problem`)
- Create: `src/utils/holdColor.ts`
- Test: `src/utils/__tests__/holdColor.test.ts`

**Interfaces:**
- Produces (relied on by Tasks 4–6):
  - `interface HoldHighlight { h: number; s: number; v: number; tol: number }` (h 0-360, s/v 0-100)
  - `Problem.hold_highlight: HoldHighlight | null`
  - `rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number }` (h 0-360, s/v 0-100)
  - `clampTolerance(tol: number): number` — clamp to 1..60
  - `type CvRange = { lower: [number, number, number]; upper: [number, number, number] }`
  - `hsvBounds(sample: HoldHighlight): CvRange[]` — OpenCV-scale ranges (H 0-179, S/V 0-255); returns 2 ranges when the hue window wraps past 0/179, else 1.

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/holdColor.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { rgbToHsv, clampTolerance, hsvBounds } from '../holdColor'

describe('rgbToHsv', () => {
  it('converts pure red', () => {
    expect(rgbToHsv(255, 0, 0)).toEqual({ h: 0, s: 100, v: 100 })
  })
  it('converts pure green', () => {
    expect(rgbToHsv(0, 255, 0)).toEqual({ h: 120, s: 100, v: 100 })
  })
  it('converts pure blue', () => {
    expect(rgbToHsv(0, 0, 255)).toEqual({ h: 240, s: 100, v: 100 })
  })
  it('converts black (no hue/sat)', () => {
    expect(rgbToHsv(0, 0, 0)).toEqual({ h: 0, s: 0, v: 0 })
  })
  it('converts mid-gray', () => {
    expect(rgbToHsv(128, 128, 128)).toEqual({ h: 0, s: 0, v: 50 })
  })
})

describe('clampTolerance', () => {
  it('clamps below 1 up to 1', () => { expect(clampTolerance(0)).toBe(1) })
  it('clamps above 60 down to 60', () => { expect(clampTolerance(99)).toBe(60) })
  it('passes a mid value through', () => { expect(clampTolerance(15)).toBe(15) })
  it('rounds to an integer', () => { expect(clampTolerance(15.7)).toBe(16) })
})

describe('hsvBounds', () => {
  it('returns a single OpenCV-scale range for a mid-spectrum hue (blue)', () => {
    // h=240 -> opencv 120; tol 20 hue -> [100,140]
    const ranges = hsvBounds({ h: 240, s: 70, v: 80, tol: 20 })
    expect(ranges).toHaveLength(1)
    expect(ranges[0].lower[0]).toBe(100)
    expect(ranges[0].upper[0]).toBe(140)
  })
  it('splits into two ranges when the hue window wraps past 0 (red)', () => {
    // h=0 -> opencv 0; tol 20 hue -> wraps: [0..20] and [160..179]
    const ranges = hsvBounds({ h: 0, s: 70, v: 80, tol: 20 })
    expect(ranges).toHaveLength(2)
    const hues = ranges.map(r => [r.lower[0], r.upper[0]]).sort((a, b) => a[0] - b[0])
    expect(hues[0]).toEqual([0, 20])
    expect(hues[1]).toEqual([160, 179])
  })
  it('clamps saturation/value floors so dark/washed pixels are excluded', () => {
    const r = hsvBounds({ h: 240, s: 70, v: 80, tol: 20 })[0]
    // S/V lower bounded at >= 40 (opencv scale ~ 40), upper 255
    expect(r.lower[1]).toBeGreaterThanOrEqual(40)
    expect(r.lower[2]).toBeGreaterThanOrEqual(40)
    expect(r.upper[1]).toBe(255)
    expect(r.upper[2]).toBe(255)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/holdColor.test.ts`
Expected: FAIL — cannot resolve module `../holdColor`.

- [ ] **Step 3: Write the helpers**

Create `src/utils/holdColor.ts`:

```ts
import type { HoldHighlight } from '../types'

export type CvRange = { lower: [number, number, number]; upper: [number, number, number] }

export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : d / max
  return { h: Math.round(h), s: Math.round(s * 100), v: Math.round(max * 100) }
}

export function clampTolerance(tol: number): number {
  return Math.min(60, Math.max(1, Math.round(tol)))
}

// Convert the stored standard-scale HSV sample + tolerance into one or two
// OpenCV-scale ranges (H 0-179, S/V 0-255). Two ranges when the hue window
// wraps past the 0/179 boundary.
export function hsvBounds(sample: HoldHighlight): CvRange[] {
  const hCenter = Math.round((sample.h / 360) * 179)
  const hTol = Math.round((clampTolerance(sample.tol) / 360) * 179) || 1
  const sFloor = 40, vFloor = 40
  const lo = hCenter - hTol
  const hi = hCenter + hTol

  if (lo < 0) {
    return [
      { lower: [0, sFloor, vFloor], upper: [hi, 255, 255] },
      { lower: [180 + lo, sFloor, vFloor], upper: [179, 255, 255] },
    ]
  }
  if (hi > 179) {
    return [
      { lower: [lo, sFloor, vFloor], upper: [179, 255, 255] },
      { lower: [0, sFloor, vFloor], upper: [hi - 180, 255, 255] },
    ]
  }
  return [{ lower: [lo, sFloor, vFloor], upper: [hi, 255, 255] }]
}
```

- [ ] **Step 4: Add the types**

Append to `src/types/index.ts`:

```ts
export interface HoldHighlight {
  h: number   // 0-360
  s: number   // 0-100
  v: number   // 0-100
  tol: number // hue tolerance
}
```

And in the existing `Problem` interface, add (after `notes`):

```ts
  hold_highlight: HoldHighlight | null
```

This new required field will break object literals typed as `Problem` (test fixtures, any `Omit<Problem,...>` insert types). Add `'hold_highlight'` to the `Omit<Problem, ...>` unions in `src/components/ProblemForm.tsx`, `src/hooks/useProblems.ts` (`useAddProblem`), and `src/pages/SessionDetailPage.tsx` (`handleAddProblem` param + `EditProblemSheet.onSave`), mirroring how `gym_problem_id` was handled; and add `hold_highlight: null` to `Problem` fixtures in `src/utils/__tests__/stats.test.ts`. Run `npx tsc -b` and fix exactly the spots it flags this way.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/holdColor.test.ts` then `npx tsc -b`
Expected: tests PASS; tsc clean after the Omit/fixture updates.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add HoldHighlight type and pure color helpers"
```

---

### Task 3: OpenCV ambient types + lazy loader

**Files:**
- Create: `src/types/opencv.d.ts`
- Create: `src/lib/loadOpenCv.ts`

**Interfaces:**
- Produces (relied on by Tasks 4–5):
  - Ambient `interface OpenCV { ... }` (the used surface) and a global `cv` of that type.
  - `loadOpenCv(): Promise<OpenCV>` — injects the pinned OpenCV.js script once, resolves after runtime init, caches the promise; rejects on load error.

- [ ] **Step 1: Declare the ambient OpenCV surface**

Create `src/types/opencv.d.ts` (only what the pipeline uses):

```ts
// Minimal ambient declaration for the OpenCV.js surface this app uses.
export interface CvMat {
  rows: number
  cols: number
  data: Uint8Array
  type(): number
  delete(): void
}
export interface CvMatVector {
  size(): number
  get(i: number): CvMat
  delete(): void
}
export interface OpenCV {
  Mat: {
    new (): CvMat
    new (rows: number, cols: number, type: number, scalar: number[]): CvMat
    ones(rows: number, cols: number, type: number): CvMat
  }
  MatVector: { new (): CvMatVector }
  imread(canvas: HTMLCanvasElement): CvMat
  imshow(canvas: HTMLCanvasElement, mat: CvMat): void
  cvtColor(src: CvMat, dst: CvMat, code: number): void
  inRange(src: CvMat, lower: CvMat, upper: CvMat, dst: CvMat): void
  bitwise_or(a: CvMat, b: CvMat, dst: CvMat): void
  morphologyEx(src: CvMat, dst: CvMat, op: number, kernel: CvMat): void
  findContours(img: CvMat, contours: CvMatVector, hierarchy: CvMat, mode: number, method: number): void
  drawContours(dst: CvMat, contours: CvMatVector, idx: number, color: number[], thickness: number): void
  contourArea(contour: CvMat): number
  COLOR_RGBA2RGB: number
  COLOR_RGB2HSV: number
  MORPH_CLOSE: number
  MORPH_OPEN: number
  RETR_EXTERNAL: number
  CHAIN_APPROX_SIMPLE: number
  CV_8U: number
  onRuntimeInitialized?: () => void
}

declare global {
  // OpenCV.js attaches itself to window as `cv`.
  // eslint-disable-next-line no-var
  var cv: OpenCV
}
```

- [ ] **Step 2: Write the loader**

Create `src/lib/loadOpenCv.ts`:

```ts
import type { OpenCV } from '../types/opencv'

const OPENCV_URL = 'https://docs.opencv.org/4.10.0/opencv.js'
let promise: Promise<OpenCV> | null = null

export function loadOpenCv(): Promise<OpenCV> {
  if (promise) return promise
  promise = new Promise<OpenCV>((resolve, reject) => {
    // Already present (e.g. a prior load).
    if (typeof window !== 'undefined' && window.cv && 'imread' in window.cv) {
      resolve(window.cv)
      return
    }
    const script = document.createElement('script')
    script.src = OPENCV_URL
    script.async = true
    script.onload = () => {
      const cv = window.cv
      if (!cv) {
        reject(new Error('OpenCV failed to initialize'))
        return
      }
      // Newer builds expose onRuntimeInitialized; if wasm is already ready, imread exists.
      if ('imread' in cv) {
        resolve(cv)
      } else {
        cv.onRuntimeInitialized = () => resolve(cv)
      }
    }
    script.onerror = () => {
      promise = null // allow a retry on the next open
      reject(new Error('Could not load OpenCV'))
    }
    document.body.appendChild(script)
  })
  return promise
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/opencv.d.ts src/lib/loadOpenCv.ts
git commit -m "feat: add OpenCV ambient types and lazy CDN loader"
```

---

### Task 4: Detection pipeline + owner save hook

**Files:**
- Create: `src/lib/detectHolds.ts`
- Create: `src/hooks/useHoldHighlight.ts`

**Interfaces:**
- Consumes: `OpenCV`/`CvMat` types (Task 3), `hsvBounds`/`HoldHighlight` (Task 2), `supabase`, `useAuth`.
- Produces (relied on by Task 5):
  - `drawHoldOutlines(cv: OpenCV, srcCanvas: HTMLCanvasElement, outCanvas: HTMLCanvasElement, sample: HoldHighlight): void` — runs the mask→morphology→contours pipeline and draws the photo + outlines into `outCanvas`. Filters contours below 0.05% of area. Cleans up all Mats.
  - `useUpdateHoldHighlight()` — owner mutation `{ problemId, sessionId, value }` → `update problems set hold_highlight = value`; invalidates problem/session queries.

- [ ] **Step 1: Write the pipeline**

Create `src/lib/detectHolds.ts`:

```ts
import type { OpenCV, CvMat } from '../types/opencv'
import { hsvBounds } from '../utils/holdColor'
import type { HoldHighlight } from '../types'

const OUTLINE_RGBA = [233, 30, 99, 255] // bright magenta, readable on most holds
const MIN_AREA_RATIO = 0.0005 // 0.05% of image area

// Build an HSV mask for one range; caller owns the returned Mat.
function rangeMask(cv: OpenCV, hsv: CvMat, lower: number[], upper: number[]): CvMat {
  const lo = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [...lower, 0])
  const hi = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [...upper, 255])
  const out = new cv.Mat()
  try {
    cv.inRange(hsv, lo, hi, out)
    return out
  } finally {
    lo.delete()
    hi.delete()
  }
}

export function drawHoldOutlines(
  cv: OpenCV,
  srcCanvas: HTMLCanvasElement,
  outCanvas: HTMLCanvasElement,
  sample: HoldHighlight,
): void {
  const src = cv.imread(srcCanvas)
  const rgb = new cv.Mat()
  const hsv = new cv.Mat()
  const mask = new cv.Mat()
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U)
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  const extraMasks: CvMat[] = []
  try {
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB)
    cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV)

    const ranges = hsvBounds(sample)
    const first = rangeMask(cv, hsv, ranges[0].lower, ranges[0].upper)
    // Accumulate into `mask`.
    cv.bitwise_or(first, first, mask)
    extraMasks.push(first)
    for (let i = 1; i < ranges.length; i++) {
      const m = rangeMask(cv, hsv, ranges[i].lower, ranges[i].upper)
      extraMasks.push(m)
      cv.bitwise_or(mask, m, mask)
    }

    cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel)
    cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel)

    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    const minArea = src.rows * src.cols * MIN_AREA_RATIO
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i)
      if (cv.contourArea(c) >= minArea) {
        cv.drawContours(src, contours, i, OUTLINE_RGBA, 3)
      }
    }
    cv.imshow(outCanvas, src)
  } finally {
    src.delete()
    rgb.delete()
    hsv.delete()
    mask.delete()
    kernel.delete()
    contours.delete()
    hierarchy.delete()
    for (const m of extraMasks) m.delete()
  }
}
```

- [ ] **Step 2: Write the save hook**

Create `src/hooks/useHoldHighlight.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { HoldHighlight } from '../types'

export function useUpdateHoldHighlight() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ problemId, value }: { problemId: string; sessionId: string; value: HoldHighlight | null }) => {
      const { error } = await supabase
        .from('problems')
        .update({ hold_highlight: value })
        .eq('id', problemId)
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['problems', variables.sessionId] })
      queryClient.invalidateQueries({ queryKey: ['problems'] })
      queryClient.invalidateQueries({ queryKey: ['help_request_for_problem', variables.problemId] })
    },
  })
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: no errors. (Pipeline + hook are not unit-tested — type checker is the gate.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/detectHolds.ts src/hooks/useHoldHighlight.ts
git commit -m "feat: hold detection pipeline + hold_highlight save hook"
```

---

### Task 5: `HoldHighlightViewer` component

**Files:**
- Create: `src/components/HoldHighlightViewer.tsx`

**Interfaces:**
- Consumes: `loadOpenCv` (Task 3), `drawHoldOutlines` + `useUpdateHoldHighlight` (Task 4), `rgbToHsv`/`clampTolerance` (Task 2), `HoldHighlight`/`Problem` types, `react-hot-toast`, `lucide-react`.
- Produces (relied on by Task 6): `HoldHighlightViewer({ problem, isOwner, onClose }: { problem: Problem; isOwner: boolean; onClose: () => void })`.

**Design:** A fixed full-screen overlay. It loads the image into an offscreen source canvas (downscaled to ≤1024px), lazy-loads OpenCV, and renders into a visible output canvas. State: `sample: HoldHighlight | null` (seeded from `problem.hold_highlight`), `loading`, `error`. When `sample` and `cv` are ready, call `drawHoldOutlines`; otherwise draw the plain photo. Owner-only: tapping the output canvas samples the tapped pixel (mapped through the downscale) → `rgbToHsv` → new `sample` (keeping current `tol`); a tolerance range input; Save (writes `sample`) and Clear (writes `null`). On OpenCV load failure: show the plain photo + a toast, disable Save.

- [ ] **Step 1: Write the component**

Create `src/components/HoldHighlightViewer.tsx`:

```tsx
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
```

- [ ] **Step 2: Typecheck, lint, build**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: no type errors, 0 new lint problems (baseline 17), build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/HoldHighlightViewer.tsx
git commit -m "feat: HoldHighlightViewer — tap-to-sample + contour overlay"
```

---

### Task 6: Wire the "Highlight holds" affordance

**Files:**
- Modify: `src/pages/SessionDetailPage.tsx` (problem card)
- Modify: `src/components/CallForHelp.tsx` (so helpers can open it on the asker's photo)

**Interfaces:**
- Consumes: `HoldHighlightViewer` (Task 5), `useAuth`, `Problem` type.
- Produces: nothing.

**Design:** A small "✨ Highlight holds" button shown only when the problem has `image_url`. Clicking opens `HoldHighlightViewer` with `isOwner = problem.user_id === user?.id`. Manage open state locally where the button lives.

- [ ] **Step 1: Add the button on the problem card (SessionDetailPage)**

In `src/pages/SessionDetailPage.tsx`, near the per-problem `CallForHelp`/`GymProblemMatcher` render (search `<GymProblemMatcher`), and where the problem image is shown, add a button + local open state. The cleanest place is inside the per-problem card component that already renders the image. Add:

```tsx
import { Sparkles } from 'lucide-react'
import { HoldHighlightViewer } from '../components/HoldHighlightViewer'
```

Add a small state + button + viewer in the card scope (use the existing `problem` and `user` in scope; `useAuth` is already imported on this page — if the card is a sub-component without `user`, pass `user?.id` down or call `useAuth` there):

```tsx
const [holdOpen, setHoldOpen] = useState(false)
// ...
{problem.image_url && (
  <button onClick={() => setHoldOpen(true)} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-sage-700 hover:text-sage-900">
    <Sparkles size={13} strokeWidth={2} /> Highlight holds
  </button>
)}
{holdOpen && (
  <HoldHighlightViewer problem={problem} isOwner={problem.user_id === user?.id} onClose={() => setHoldOpen(false)} />
)}
```

Read the file to place this inside the correct per-problem JSX scope with the `problem` binding; match indentation. If the image/card is rendered in a sub-component that lacks `user`, call `const { user } = useAuth()` there (the import exists on the page).

- [ ] **Step 2: Add the button in CallForHelp**

In `src/components/CallForHelp.tsx`, the prop is already `Pick<Problem, 'id' | 'image_url' | 'beta_video_url' | 'gym_problem_id'>`. The viewer needs the full `Problem` (it reads `hold_highlight`, `session_id`, `user_id`). Widen the prop to accept the full `Problem` (the call site in SessionDetailPage passes a full `problem`, so this is safe — verify), add `useAuth`, and render the affordance when `problem.image_url` is set:

```tsx
import { useAuth } from '../providers/AuthProvider'
import { HoldHighlightViewer } from './HoldHighlightViewer'
import { Sparkles } from 'lucide-react'
```

Change the signature to `export function CallForHelp({ problem }: { problem: Problem }) {`, add `const { user } = useAuth()` and `const [holdOpen, setHoldOpen] = useState(false)` with the other hooks, and render — next to the existing "Ask for beta" button — when `problem.image_url`:

```tsx
<button onClick={() => setHoldOpen(true)} className="mt-1.5 ml-3 inline-flex items-center gap-1 text-xs font-medium text-sage-700 hover:text-sage-900">
  <Sparkles size={13} strokeWidth={2} /> Highlight holds
</button>
{holdOpen && <HoldHighlightViewer problem={problem} isOwner={problem.user_id === user?.id} onClose={() => setHoldOpen(false)} />}
```

(The existing `hasMedia`/`existing` early-return paths must still render the button when there's an image — place the button so it shows in both the "no request yet" and "help requested" states, or at minimum the default state. Keep it simple: render it alongside whichever beta control shows.)

- [ ] **Step 3: Typecheck, lint, build**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: no type errors, 0 new lint problems (baseline 17), build succeeds.

- [ ] **Step 4: Manual verification**

With migration 049 applied and `npm run dev`: open a session problem that has a photo → "✨ Highlight holds" appears → opens the viewer → (owner) tap a hold → matching holds get magenta outlines → adjust tolerance → Save → reopen and the highlight persists. Post a Call-for-Help on that problem, open it as another user (or check the read-only path), and confirm the saved outlines render.

- [ ] **Step 5: Commit**

```bash
git add src/pages/SessionDetailPage.tsx src/components/CallForHelp.tsx
git commit -m "feat: 'Highlight holds' entry point on problem card and Call-for-Help"
```

---

## Self-Review

**Spec coverage:**
- Tap-to-sample → Task 5 (`onCanvasClick` → `rgbToHsv`) ✓
- Persist sampled HSV+tol on the problem → Task 1 (column) + Task 2 (type) + Task 4 (`useUpdateHoldHighlight`) ✓
- Contour outlines → Task 4 (`drawHoldOutlines` / `findContours` + `drawContours`) ✓
- Lazy-loaded viewer; owner sets, others view → Task 5 (`isOwner`) + Task 3 (lazy loader) ✓
- OpenCV pipeline (mask→morphology→contours, downscale, wrap-around) → Task 2 (`hsvBounds` wrap) + Task 4 ✓
- No new RLS/RPC → Task 1 ✓
- Error handling (load fail graceful, no photo hides affordance) → Task 5 (`cvFailed`) + Task 6 (`image_url` guard) ✓
- Tests on pure color math only → Task 2 ✓
- Affordance on problem card + Call-for-Help → Task 6 ✓

**Placeholder scan:** No TBD/TODO; every code step is complete.

**Type consistency:** `HoldHighlight {h,s,v,tol}` defined in Task 2, used in 4/5/6. `hsvBounds`→`CvRange[]` consumed by `drawHoldOutlines`. `OpenCV`/`CvMat` (Task 3) used by Task 4/5. `useUpdateHoldHighlight({problemId, sessionId, value})` matches between Task 4 (def) and Task 5 (call). `HoldHighlightViewer({problem, isOwner, onClose})` matches Task 5 (def) and Task 6 (calls). ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-21-hold-highlighting.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
