import { useForm } from 'react-hook-form'
import type { Exercise } from '../types'

type FormValues = {
  name: string
  type: 'reps' | 'time'
  sets: number
  reps: number
  duration_seconds: number
  notes: string
}

interface ExerciseFormProps {
  onSubmit: (values: Omit<Exercise, 'id' | 'session_id' | 'user_id' | 'created_at'>) => void
  isSubmitting: boolean
}

export function ExerciseForm({ onSubmit, isSubmitting }: ExerciseFormProps) {
  const { register, handleSubmit, watch } = useForm<FormValues>({
    defaultValues: {
      name: '',
      type: 'reps',
      sets: 3,
      reps: 10,
      duration_seconds: 30,
      notes: '',
    },
  })

  const exerciseType = watch('type')

  const submit = (values: FormValues) => {
    onSubmit({
      name: values.name,
      type: values.type,
      sets: values.sets || null,
      reps: values.type === 'reps' ? values.reps : null,
      duration_seconds: values.type === 'time' ? values.duration_seconds : null,
      notes: values.notes || null,
    })
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
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
                exerciseType === t ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'
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
        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium disabled:opacity-50"
      >
        {isSubmitting ? 'Saving...' : 'Add Exercise'}
      </button>
    </form>
  )
}
