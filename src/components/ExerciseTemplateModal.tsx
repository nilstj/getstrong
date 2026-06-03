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
