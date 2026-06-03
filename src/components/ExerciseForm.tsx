import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Exercise } from '../types'
import { useMyLatestTestResult } from '../hooks/useStrengthTests'
import { useStrengthTests } from '../hooks/useStrengthTests'

type FormValues = {
  name: string
  type: 'reps' | 'time'
  sets: number
  reps: number
  duration_seconds: number
  weight_kg: number | ''
  notes: string
}

interface ExerciseFormProps {
  onSubmit: (values: Omit<Exercise, 'id' | 'session_id' | 'user_id' | 'created_at'>) => void
  isSubmitting: boolean
  initialName?: string
  initialType?: 'reps' | 'time'
  initialTestId?: string | null
  initialSets?: number | null
  initialReps?: number | null
  videoUrl?: string | null
  existing?: Exercise
}

export function ExerciseForm({
  onSubmit,
  isSubmitting,
  initialName = '',
  initialType = 'reps',
  initialTestId = null,
  initialSets,
  initialReps,
  videoUrl,
  existing,
}: ExerciseFormProps) {
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

  const [pct, setPct] = useState(80)
  const exerciseType = watch('type')

  const { data: tests = [] } = useStrengthTests()
  const { data: latestResult } = useMyLatestTestResult(initialTestId)
  const linkedTest = initialTestId ? tests.find(t => t.id === initialTestId) : null

  const suggestedWeight = latestResult && linkedTest
    ? Math.round(latestResult.value * pct) / 100
    : null

  const submit = (values: FormValues) => {
    onSubmit({
      name: values.name,
      type: values.type,
      sets: values.sets || null,
      reps: values.type === 'reps' ? values.reps : null,
      duration_seconds: values.type === 'time' ? values.duration_seconds : null,
      weight_kg: values.weight_kg !== '' ? Number(values.weight_kg) : null,
      notes: values.notes || null,
    })
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      {videoUrl && (
        <a
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-sage-800 font-medium"
        >
          ▶ Watch video
        </a>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Exercise Name</label>
        <input
          {...register('name', { required: true })}
          type="text"
          placeholder="e.g. Hangboard — 20mm edge"
          className="w-full border rounded-lg px-3 py-2.5"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
        <div className="flex rounded-lg overflow-hidden border">
          {(['reps', 'time'] as const).map(t => (
            <label
              key={t}
              className={`flex-1 py-2 text-sm font-medium text-center cursor-pointer transition-colors ${
                exerciseType === t ? 'bg-black text-white' : 'bg-white text-gray-600'
              }`}
            >
              <input {...register('type')} type="radio" value={t} className="sr-only" />
              {t === 'reps' ? 'Reps' : 'Time'}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Sets</label>
        <input
          {...register('sets', { valueAsNumber: true })}
          type="number"
          min="1"
          className="w-full border rounded-lg px-3 py-2.5"
        />
      </div>

      {exerciseType === 'reps' ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reps per Set</label>
          <input
            {...register('reps', { valueAsNumber: true })}
            type="number"
            min="1"
            className="w-full border rounded-lg px-3 py-2.5"
          />
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Duration per Set (seconds)</label>
          <input
            {...register('duration_seconds', { valueAsNumber: true })}
            type="number"
            min="1"
            className="w-full border rounded-lg px-3 py-2.5"
          />
        </div>
      )}

      {linkedTest && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
          <p className="text-xs font-medium text-blue-700">Based on test: {linkedTest.name}</p>
          {latestResult ? (
            <>
              <p className="text-xs text-blue-600">
                Your max: <span className="font-semibold">{latestResult.value} {linkedTest.unit}</span>
              </p>
              <div className="flex items-center gap-3">
                <label className="text-xs text-blue-700 whitespace-nowrap">Load %</label>
                <input
                  type="range"
                  min="10"
                  max="110"
                  step="5"
                  value={pct}
                  onChange={e => {
                    const v = Number(e.target.value)
                    setPct(v)
                    setValue('weight_kg', Math.round(latestResult.value * v) / 100)
                  }}
                  className="flex-1 accent-blue-600"
                />
                <span className="text-sm font-semibold text-blue-700 w-10 text-right">{pct}%</span>
              </div>
              {suggestedWeight !== null && (
                <p className="text-xs text-blue-600">
                  Suggested load: <span className="font-semibold">{suggestedWeight} {linkedTest.unit}</span>
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-blue-500">No test result yet — log a test in this session first.</p>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Weight / Load (optional)</label>
        <div className="flex items-center gap-2">
          <input
            {...register('weight_kg')}
            type="number"
            step="0.5"
            min="0"
            placeholder="0"
            className="flex-1 border rounded-lg px-3 py-2.5"
          />
          <span className="text-sm text-gray-500">kg</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
        <textarea
          {...register('notes')}
          rows={2}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-black text-white py-3 rounded-xl font-medium disabled:opacity-50"
      >
        {isSubmitting ? 'Saving...' : existing ? 'Save Changes' : 'Add Exercise'}
      </button>
    </form>
  )
}
