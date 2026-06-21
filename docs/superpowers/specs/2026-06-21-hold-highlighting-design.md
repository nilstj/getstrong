# Hold Highlighting Design

**Date:** 2026-06-21
**Status:** Approved

## Summary

Let a climber tap a hold in their boulder photo to sample its color, then highlight every matching hold with colored outlines. The sampled color is saved on the problem so the highlight persists and is visible to anyone viewing that photo — most usefully to helpers studying the image in the Call-for-Help beta flow. Detection runs client-side with OpenCV.js (color mask → morphology → contours), lazy-loaded only when the viewer opens.

This is a **highlight assist**, not perfect hold detection: accuracy depends on image quality, lighting, and how distinct the hold color is. Expectations are set accordingly in the UI.

## Decisions (from brainstorming)

- **Color source:** the user **taps a hold** in the image; we sample that pixel's actual color (robust to gym lighting, unlike mapping a color *name*).
- **Persistence:** the sampled color is **saved on the problem** (a new column), so the highlight auto-applies on later views and is visible to others.
- **Output:** **colored contour outlines** around matching holds (legible on busy walls; the natural OpenCV output).
- **Placement:** a dedicated, **lazy-loaded full-screen viewer**. The owner sets the highlight (tap + tolerance + save); anyone opening the viewer sees the saved outlines. OpenCV.js never loads on normal screens.
- **CV engine:** **OpenCV.js** (vs a hand-rolled canvas approach) for robust morphology + contours. The ~8MB wasm is lazy-loaded on first viewer open and browser-cached.

## Scope

**In scope:**
- `problems.hold_highlight` column (sampled HSV + tolerance).
- `HoldHighlightViewer` overlay: render photo on canvas, lazy-load OpenCV, draw contours; owner-only tap-to-sample + tolerance slider + save.
- Lazy OpenCV.js loader (load once, cache the promise).
- Pure color-math utilities (`utils/holdColor.ts`) with unit tests.
- `useUpdateHoldHighlight` owner mutation.
- A "Highlight holds" affordance on problem-image displays (problem card in SessionDetailPage; the Call-for-Help image) that opens the viewer.

**Out of scope (YAGNI / later):**
- Auto-rendering outlines inline on thumbnails / list views (keeps the heavy wasm out of scroll rendering).
- Surfacing the viewer on the Crew page or matcher (can be added later by opening the same viewer).
- Multiple highlight colors per problem (one sampled color per problem for v1).
- A persisted on/off toggle — presence of `hold_highlight` (non-null) is the on/off signal; the viewer always lets you re-sample or clear.
- ML/vision-model hold detection.

## Design

### Data model

Add one nullable column to `problems` (migration 049, additive):

```
hold_highlight jsonb null
-- shape: { "h": <0-360>, "s": <0-100>, "v": <0-100>, "tol": <int> }
-- null = no highlight set
```

`h/s/v` is the sampled hold color in HSV; `tol` is the matching tolerance (hue-centric). Stored as `jsonb` for flexibility.

**No new RLS or RPC.** `problems` is already readable by every authenticated user (migration 015) and writable by its owner (migration 001: `for all using (auth.uid() = user_id)`). The owner saves `hold_highlight` with a plain `update`; all viewers read it via the existing `select('*')`. Clearing the highlight sets it back to `null`.

The `HelpRequest`/problem reads already use `select('*')`, so the column flows through automatically; the `Problem` type gains `hold_highlight: HoldHighlight | null`.

### Components

- **`HoldHighlightViewer`** (`src/components/HoldHighlightViewer.tsx`) — a full-screen overlay (like the existing BottomSheet pattern but full-bleed for the image). Props: `{ problem, isOwner, onClose }`. Renders the photo onto a `<canvas>`; on open, lazy-loads OpenCV and, if `problem.hold_highlight` is set, computes and draws the outlines. Owner controls: tap the canvas to sample a hold, a tolerance slider, **Save** and **Clear**. Non-owners get a read-only render of the saved highlight plus a plain-photo fallback.
- **`src/lib/loadOpenCv.ts`** — `loadOpenCv(): Promise<OpenCV>` that injects the OpenCV.js script once and caches the resolved promise, so it's fetched at most once per session and only when a viewer first opens. Self-hosted (vendored in `public/`) or a pinned CDN URL — decided at plan time; must be CSP/offline-safe.
- **`src/utils/holdColor.ts`** — pure functions, unit-tested:
  - `rgbToHsv(r, g, b): { h, s, v }`
  - `hsvBounds(sample: HoldHighlight): Array<{ lower: [number,number,number]; upper: [number,number,number] }>` — returns one range normally, **two** when the hue window wraps past 0/360 (red), each in OpenCV's HSV scale (H 0-179, S/V 0-255).
  - `clampTolerance(tol: number): number`
- **`useUpdateHoldHighlight`** (`src/hooks/useHoldHighlight.ts`) — owner mutation: `update problems set hold_highlight = <value|null> where id`; invalidates the problem/session queries. (Reuses the existing problem-owner update policy.)
- **Affordance** — a small "✨ Highlight holds" button shown on a problem image that has a photo, in: the problem card (SessionDetailPage) and the Call-for-Help image. Clicking opens `HoldHighlightViewer` with `isOwner = (problem.user_id === currentUser.id)`.

### CV pipeline (inside the viewer)

1. Draw the image to a canvas, downscaled so the longest side ≤ a max dimension (e.g. 1024px) for speed.
2. `cv.imread(canvas)` → `cv.cvtColor(src, hsv, COLOR_RGB2HSV)`.
3. For each range from `hsvBounds(sample)`: `cv.inRange(hsv, lower, upper, mask)`; OR the masks together for wrap-around.
4. `cv.morphologyEx(mask, CLOSE)` then `OPEN` with a small kernel — closes gaps inside a hold, drops isolated specks.
5. `cv.findContours(mask, RETR_EXTERNAL, CHAIN_APPROX_SIMPLE)`; filter out tiny contours below an area threshold.
6. Draw contours as outlines onto a transparent overlay canvas layered over the photo.

Owner interaction: a tap on the canvas maps (accounting for the downscale) to an image pixel; sample its RGB → `rgbToHsv` → set as the working color and re-run steps 3-6 live. The tolerance slider re-runs from step 3. **Save** writes `{ h, s, v, tol }`; **Clear** writes `null`.

### Error handling

- **OpenCV load failure / unsupported** → toast ("Couldn't load hold detection") and the viewer still shows the plain photo; Save is disabled.
- **No photo on the problem** → the affordance isn't shown.
- **Hue wrap-around** (reds) → handled by `hsvBounds` returning two ranges.
- **Tap with no detectable color / empty mask** → outlines simply don't appear; no error.

### Testing

- **Unit (Vitest):** `holdColor.ts` — `rgbToHsv` known conversions; `hsvBounds` produces one range mid-spectrum and two ranges at red wrap-around, in OpenCV's 0-179 hue scale; `clampTolerance` bounds. This is the repo's only unit-tested layer.
- **Verification (no unit tests, per repo convention):** the viewer, OpenCV loader, hook, and affordance are verified with `npx tsc -b` + `npm run lint` (baseline 17, 0 new) + `npm run build`. Manual check: sample a hold on a real photo, confirm outlines + Save persist and reload, and that a second user viewing the image (e.g. via Call-for-Help) sees the saved outlines.

## Open questions for implementation

- **OpenCV.js delivery:** vendor the wasm/js in `public/` (offline/CSP-safe, larger repo) vs a pinned CDN URL (simpler, external dependency). Lean: vendored, to keep the app self-contained like the rest of it. Decide at plan time.
- **Max processing dimension and morphology kernel size / min-contour area** — pick sane defaults (e.g. 1024px, 3×3 kernel, drop contours < ~0.05% of image area), tune during manual testing.
