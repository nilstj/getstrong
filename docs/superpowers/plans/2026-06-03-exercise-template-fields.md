# Exercise Template Extended Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `video_url`, `device`, `preset_sets`, `preset_reps`, `preset_pause_seconds`, and `preset_rest_seconds` to exercise templates, expose them in a new admin modal, and auto-fill + display them on the user-facing exercise selector.

**Architecture:** New migration adds 6 nullable columns to `exercise_templates`. A new `ExerciseTemplateModal` component handles both create and edit in the admin. The `ExerciseSelector` in `SessionDetailPage` conditionally shows device/video/preset metadata, and `ExerciseForm` accepts `initialSets`/`initialReps` props that auto-fill from the template.

**Tech Stack:** React, TypeScript, Tailwind CSS, Supabase, TanStack Query, react-hot-toast, lucide-react

---

## File Map

| Action | Path |
|---|---|
| Create | `supabase/migrations/025_exercise_template_fields.sql` |
| Modify | `src/types/index.ts` lines 104–112 |
| Modify | `src/hooks/useExerciseTemplates.ts` lines 22, 42 |
| Create | `src/components/ExerciseTemplateModal.tsx` |
| Modify | `src/pages/ProfilePage.tsx` lines 515–633 |
| Modify | `src/components/ExerciseForm.tsx` lines 17–44 |
| Modify | `src/pages/SessionDetailPage.tsx` lines 658–728 |

---

## Task 1: Migration — add columns to exercise_templates

**Files:**
- Create: `supabase/migrations/025_exercise_template_fields.sql`

- [ ] **Step 1: Create migration file**

```sql
alter table exercise_templates
  add column video_url text,
  add column device text,
  add column preset_sets integer,
  add column preset_reps integer,
  add column preset_pause_seconds integer,
  add column preset_rest_seconds integer;
```

- [ ] **Step 2: Apply migration**

Run: `npx supabase db push`  
Expected: migration applies without error

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/025_exercise_template_fields.sql
git commit -m "feat: add video_url, device, and preset fields to exercise_templates"
```

---

## Task 2: Extend TypeScript type

**Files:**
- Modify: `src/types/index.ts` lines 104–112

- [ ] **Step 1: Update `ExerciseTemplate` interface**

Replace lines 104–112:

```typescript
export interface ExerciseTemplate {
  id: string
  name: string
  type: ExerciseType
  description: string | null
  test_id: string | null
  video_url: string | null
  device: string | null
  preset_sets: number | null
  preset_reps: number | null
  preset_pause_seconds: number | null
  preset_rest_seconds: number | null
  created_by: string
  created_at: string
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`  
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: extend ExerciseTemplate type with new fields"
```

---

## Task 3: Update hooks to pass new fields

**Files:**
- Modify: `src/hooks/useExerciseTemplates.ts` lines 22 and 42

- [ ] **Step 1: Extend `useCreateExerciseTemplate` mutationFn signature**

Replace line 22:
```typescript
mutationFn: async (values: Pick<ExerciseTemplate, 'name' | 'type' | 'description' | 'test_id' | 'video_url' | 'device' | 'preset_sets' | 'preset_reps' | 'preset_pause_seconds' | 'preset_rest_seconds'>) => {
```

- [ ] **Step 2: Extend `useUpdateExerciseTemplate` mutationFn signature**

Replace line 42:
```typescript
mutationFn: async ({ id, ...values }: Pick<ExerciseTemplate, 'id' | 'name' | 'type' | 'description' | 'test_id' | 'video_url' | 'device' | 'preset_sets' | 'preset_reps' | 'preset_pause_seconds' | 'preset_rest_seconds'>) => {
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`  
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useExerciseTemplates.ts
git commit -m "feat: pass new exercise template fields through hooks"
```

---

## Task 4: Create ExerciseTemplateModal component

**Files:**
- Create: `src/components/ExerciseTemplateModal.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useState } from 'react'
import { X } from 'lucide-react'
import type { ExerciseTemplate, ExerciseType, StrengthTest } from '../types'

type SaveValues = Omit<ExerciseTemplate, 'id' | 'created_by' | 'created_at'>

interface ExerciseTemplateModalProps {
  template?: ExerciseTemplate | null
  tests: StrengthTest[]
  onSave: (values: SaveValues) => void
  onClose: () => void
  isSaving: boolean
}

export function ExerciseTemplateModal({ template, tests, onSave, onClose, isSaving }: ExerciseTemplateModalProps) {
  const [name, setName] = useState(template?.name ?? '')
  const [type, setType] = useState<ExerciseType>(template?.type ?? 'reps')
  const [description, setDescription] = useState(template?.description ?? '')
  const [testId, setTestId] = useState(template?.test_id ?? '')
  const [videoUrl, setVideoUrl] = useState(template?.video_url ?? '')
  const [device, setDevice] = useState(template?.device ?? '')
  const [presetSets, setPresetSets] = useState(template?.preset_sets?.toString() ?? '')
  const [presetReps, setPresetReps] = useState(template?.preset_reps?.toString() ?? '')
  const [presetPause, setPresetPause] = useState(template?.preset_pause_seconds?.toString() ?? '')
  const [presetRest, setPresetRest] = useState(template?.preset_rest_seconds?.toString() ?? '')

  const handleSave = () => {
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      type,
      description: description.trim() || null,
      test_id: testId || null,
      video_url: videoUrl.trim() || null,
      device: device.trim() || null,
      preset_sets: presetSets ? parseInt(presetSets, 10) : null,
      preset_reps: presetReps ? parseInt(presetReps, 10) : null,
      preset_pause_seconds: presetPause ? parseInt(presetPause, 10) : null,
      preset_rest_seconds: presetRest ? parseInt(presetRest, 10) : null,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-base font-semibold">{template ? 'Edit Exercise' : 'Add Exercise'}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-5">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Basic</p>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Exercise name"
              className="w-full border rounded-xl px-3 py-2.5 text-sm"
            />
            <div className="flex rounded-xl overflow-hidden border">
              {(['reps', 'time'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setType(v)}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${type === v ? 'bg-sage-700 text-white' : 'bg-white text-gray-600'}`}
                >
                  {v === 'reps' ? 'Reps' : 'Time'}
                </button>
              ))}
            </div>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="w-full border rounded-xl px-3 py-2.5 text-sm"
            />
            {tests.length > 0 && (
              <select
                value={testId}
                onChange={e => setTestId(e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm"
              >
                <option value="">No linked test</option>
                {tests.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.unit})</option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Media & Equipment</p>
            <input
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              placeholder="Video URL (optional)"
              className="w-full border rounded-xl px-3 py-2.5 text-sm"
            />
            <input
              value={device}
              onChange={e => setDevice(e.target.value)}
              placeholder="Device (optional, e.g. Beastmaker 2000)"
              className="w-full border rounded-xl px-3 py-2.5 text-sm"
            />
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Preset Training Values</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Sets</label>
                <input
                  value={presetSets}
                  onChange={e => setPresetSets(e.target.value)}
                  type="number"
                  min="1"
                  placeholder="—"
                  className="w-full border rounded-xl px-3 py-2 text-sm"
                />
              </div>
              {type === 'reps' && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Reps</label>
                  <input
                    value={presetReps}
                    onChange={e => setPresetReps(e.target.value)}
                    type="number"
                    min="1"
                    placeholder="—"
                    className="w-full border rounded-xl px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Pause between reps (s)</label>
                <input
                  value={presetPause}
                  onChange={e => setPresetPause(e.target.value)}
                  type="number"
                  min="0"
                  placeholder="—"
                  className="w-full border rounded-xl px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Rest between sets (s)</label>
                <input
                  value={presetRest}
                  onChange={e => setPresetRest(e.target.value)}
                  type="number"
                  min="0"
                  placeholder="—"
                  className="w-full border rounded-xl px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 px-4 pb-4">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || isSaving}
            className="flex-1 py-2.5 bg-sage-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`  
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ExerciseTemplateModal.tsx
git commit -m "feat: add ExerciseTemplateModal component"
```

---

## Task 5: Replace inline edit in ProfilePage with modal

**Files:**
- Modify: `src/pages/ProfilePage.tsx` lines 515–633

- [ ] **Step 1: Add import for ExerciseTemplateModal**

At the top of the file, after the existing imports, add:

```typescript
import { ExerciseTemplateModal } from '../components/ExerciseTemplateModal'
```

- [ ] **Step 2: Replace the ExerciseLibraryAdmin function**

Replace the entire `ExerciseLibraryAdmin` function (lines 515–633) with:

```tsx
function ExerciseLibraryAdmin() {
  const { data: templates = [] } = useExerciseTemplates()
  const { data: tests = [] } = useStrengthTests()
  const createTemplate = useCreateExerciseTemplate()
  const updateTemplate = useUpdateExerciseTemplate()
  const deleteTemplate = useDeleteExerciseTemplate()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<import('../types').ExerciseTemplate | null>(null)

  const openAdd = () => { setEditingTemplate(null); setModalOpen(true) }
  const openEdit = (t: import('../types').ExerciseTemplate) => { setEditingTemplate(t); setModalOpen(true) }
  const closeModal = () => { setModalOpen(false); setEditingTemplate(null) }

  const handleSave = (values: Omit<import('../types').ExerciseTemplate, 'id' | 'created_by' | 'created_at'>) => {
    if (editingTemplate) {
      updateTemplate.mutate(
        { id: editingTemplate.id, ...values },
        { onSuccess: () => { closeModal(); toast.success('Exercise updated') }, onError: () => toast.error('Failed') }
      )
    } else {
      createTemplate.mutate(
        values,
        { onSuccess: () => { closeModal(); toast.success('Exercise added') }, onError: () => toast.error('Failed to add exercise') }
      )
    }
  }

  return (
    <div>
      <h2 className="text-base font-semibold mb-3">Exercise Library (Admin)</h2>

      <div className="space-y-2 mb-4">
        {templates.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">No exercises yet.</p>
        )}
        {templates.map(t => (
          <div key={t.id} className="bg-gray-50 rounded-2xl px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{t.name}</p>
                <p className="text-xs text-gray-400 capitalize">
                  {t.type}
                  {t.description ? ` · ${t.description}` : ''}
                  {t.test_id && ` · % ${tests.find(ts => ts.id === t.test_id)?.name ?? 'test'}`}
                </p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(t)} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"><Pencil size={14} /></button>
                <button onClick={() => deleteTemplate.mutate(t.id, { onError: () => toast.error('Failed to delete') })} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={openAdd}
        className="w-full border-2 border-dashed border-gray-300 rounded-2xl py-3 text-sm text-gray-500 hover:border-gray-400 hover:text-sage-800 transition-colors"
      >
        + Add Exercise
      </button>

      {modalOpen && (
        <ExerciseTemplateModal
          template={editingTemplate}
          tests={tests}
          onSave={handleSave}
          onClose={closeModal}
          isSaving={createTemplate.isPending || updateTemplate.isPending}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`  
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/ProfilePage.tsx
git commit -m "feat: replace inline exercise template edit form with modal"
```

---

## Task 6: Add initialSets / initialReps props to ExerciseForm

**Files:**
- Modify: `src/components/ExerciseForm.tsx` lines 17–44

- [ ] **Step 1: Add props to interface (lines 17–24)**

Replace the `ExerciseFormProps` interface:

```typescript
interface ExerciseFormProps {
  onSubmit: (values: Omit<Exercise, 'id' | 'session_id' | 'user_id' | 'created_at'>) => void
  isSubmitting: boolean
  initialName?: string
  initialType?: 'reps' | 'time'
  initialTestId?: string | null
  initialSets?: number | null
  initialReps?: number | null
  existing?: Exercise
}
```

- [ ] **Step 2: Destructure new props (lines 26–33)**

Replace the function signature:

```typescript
export function ExerciseForm({
  onSubmit,
  isSubmitting,
  initialName = '',
  initialType = 'reps',
  initialTestId = null,
  initialSets,
  initialReps,
  existing,
}: ExerciseFormProps) {
```

- [ ] **Step 3: Use new props as defaultValues (lines 34–44)**

Replace the `useForm` call:

```typescript
const { register, handleSubmit, watch, setValue } = useForm<FormValues>({
  defaultValues: {
    name: existing?.name ?? initialName,
    type: existing?.type ?? initialType,
    sets: existing?.sets ?? initialSets ?? 3,
    reps: existing?.reps ?? initialReps ?? 10,
    duration_seconds: existing?.duration_seconds ?? 30,
    weight_kg: existing?.weight_kg ?? '',
    notes: existing?.notes ?? '',
  },
})
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`  
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/components/ExerciseForm.tsx
git commit -m "feat: add initialSets and initialReps props to ExerciseForm for template auto-fill"
```

---

## Task 7: Update ExerciseSelector — show metadata and pass presets

**Files:**
- Modify: `src/pages/SessionDetailPage.tsx` lines 658–728

- [ ] **Step 1: Add ExternalLink import from lucide-react**

Find the existing lucide-react import at the top of the file and add `ExternalLink` to it. For example, if it currently reads:

```typescript
import { ChevronRight, Pencil, Trash2, X } from 'lucide-react'
```

Add `ExternalLink`:

```typescript
import { ChevronRight, ExternalLink, Pencil, Trash2, X } from 'lucide-react'
```

- [ ] **Step 2: Add preset variables and pass them to ExerciseForm (lines 668–688)**

Replace lines 668–689 (the `if (picked !== null)` block):

```tsx
if (picked !== null) {
  const initialName = picked === 'custom' ? '' : picked.name
  const initialType = picked === 'custom' ? 'reps' : picked.type
  const initialTestId = picked === 'custom' ? null : picked.test_id
  const initialSets = picked === 'custom' ? undefined : picked.preset_sets ?? undefined
  const initialReps = picked === 'custom' ? undefined : picked.preset_reps ?? undefined
  return (
    <div>
      <button
        type="button"
        onClick={() => setPicked(null)}
        className="text-sm text-sage-800 font-medium mb-4 flex items-center gap-1"
      >
        ← Back
      </button>
      <ExerciseForm
        key={picked === 'custom' ? 'custom' : picked.id}
        initialName={initialName}
        initialType={initialType}
        initialTestId={initialTestId}
        initialSets={initialSets}
        initialReps={initialReps}
        onSubmit={onSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  )
}
```

- [ ] **Step 3: Update template card to show device, video link, and preset summary (lines 699–715)**

Replace the `templates.map` block:

```tsx
{templates.map(t => {
  const presetParts = [
    t.preset_sets ? `${t.preset_sets} sets` : null,
    t.preset_reps && t.type === 'reps' ? `${t.preset_reps} reps` : null,
    t.preset_pause_seconds ? `${t.preset_pause_seconds}s pause` : null,
    t.preset_rest_seconds ? `${t.preset_rest_seconds}s rest` : null,
  ].filter(Boolean)

  return (
    <button
      key={t.id}
      type="button"
      onClick={() => setPicked(t)}
      className="w-full text-left bg-gray-50 border rounded-xl px-4 py-3 hover:border-gray-300 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-gray-900">{t.name}</p>
        {t.video_url && (
          <a
            href={t.video_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex-shrink-0 text-gray-400 hover:text-sage-700 transition-colors"
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
        <span className="text-xs text-gray-400 capitalize">{t.type}</span>
        {t.description && <span className="text-xs text-gray-400">· {t.description}</span>}
        {t.device && (
          <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{t.device}</span>
        )}
        {t.test_id && (
          <span className="text-xs bg-sage-50 text-sage-600 px-1.5 py-0.5 rounded-full">% test</span>
        )}
      </div>
      {presetParts.length > 0 && (
        <p className="text-xs text-gray-400 mt-1">{presetParts.join(' · ')}</p>
      )}
    </button>
  )
})}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`  
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/pages/SessionDetailPage.tsx
git commit -m "feat: show device, video link, and preset summary in exercise selector"
```

---

## Manual Verification Checklist

After all tasks are complete:

- [ ] Admin (ProfilePage): clicking "Edit" on an existing template opens the modal pre-filled with all current values
- [ ] Admin: clicking "+ Add Exercise" opens the modal with empty fields
- [ ] Admin: saving a template with video URL and device stores them; template list still shows (no crash)
- [ ] Admin: saving a template with **no** video URL or device stores nulls correctly
- [ ] User (SessionDetailPage): a template with a device shows the device badge on its card
- [ ] User: a template with no device shows no badge
- [ ] User: a template with a video URL shows the external link icon; clicking it opens the URL in a new tab without selecting the template
- [ ] User: a template with preset sets/reps shows the summary line; selecting it auto-fills the form with those values
- [ ] User: a template with no presets shows no summary line; form defaults to 3 sets / 10 reps as before
