import { useForm } from 'react-hook-form'
import type { Problem } from '../types'
import { V_GRADES, FONT_GRADES_ORDERED } from '../utils/grades'

const BOARDS = ['Kilterboard', 'Moonboard', 'TB2'] as const

type FormValues = {
  name: string
  grade_value: string
  color: string
  attempts: number
  sent: boolean
  board: string
  board_angle: number | ''
  gym: string
  beta_video_url: string
  notes: string
}

interface ProblemFormProps {
  onSubmit: (values: Omit<Problem, 'id' | 'session_id' | 'user_id' | 'created_at'>) => void
  isSubmitting: boolean
  initialGradeSystem?: 'font' | 'v_scale'
}

export function ProblemForm({ onSubmit, isSubmitting, initialGradeSystem = 'font' }: ProblemFormProps) {
  const grades = initialGradeSystem === 'v_scale' ? V_GRADES : FONT_GRADES_ORDERED
  const scaleLabel = initialGradeSystem === 'v_scale' ? 'V-Scale' : 'Font'

  const { register, handleSubmit, watch, setValue } = useForm<FormValues>({
    defaultValues: {
      name: '',
      grade_value: '',
      color: '',
      attempts: 1,
      sent: false,
      board: '',
      board_angle: '',
      gym: '',
      beta_video_url: '',
      notes: '',
    },
  })

  const attempts = watch('attempts')
  const board = watch('board')

  const submit = (values: FormValues) => {
    onSubmit({
      name: values.name || null,
      grade_system: initialGradeSystem,
      grade_value: values.grade_value || null,
      color: values.color || null,
      attempts: values.attempts,
      sent: values.sent,
      board: values.board || null,
      board_angle: values.board && values.board_angle !== '' ? Number(values.board_angle) : null,
      gym: values.gym || null,
      beta_video_url: values.beta_video_url || null,
      notes: values.notes || null,
    })
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name (optional)</label>
        <input
          {...register('name')}
          type="text"
          placeholder="e.g. The Crimpy Roof"
          className="w-full border rounded-lg px-3 py-2.5"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Grade ({scaleLabel})</label>
        <select {...register('grade_value')} className="w-full border rounded-lg px-3 py-2.5">
          <option value="">Select grade</option>
          {grades.map(g => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Training Board (optional)</label>
        <div className="flex flex-wrap gap-2">
          {BOARDS.map(b => (
            <button
              key={b}
              type="button"
              onClick={() => setValue('board', board === b ? '' : b)}
              className={`text-sm px-3 py-1.5 rounded-full border font-medium transition-colors ${
                board === b
                  ? 'bg-black border-black text-white'
                  : 'bg-white border-gray-300 text-gray-600'
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {board && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Board Angle (°)</label>
          <div className="flex items-center gap-3">
            <input
              {...register('board_angle', { valueAsNumber: true, min: 30, max: 70 })}
              type="range"
              min="30"
              max="70"
              step="5"
              className="flex-1 accent-black"
            />
            <span className="text-sm font-semibold text-gray-700 w-12 text-right">
              {watch('board_angle') !== '' ? `${watch('board_angle')}°` : '—'}
            </span>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Color (optional)</label>
        <input
          {...register('color')}
          type="text"
          placeholder="e.g. Red, Blue, Yellow"
          className="w-full border rounded-lg px-3 py-2.5"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Attempts</label>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setValue('attempts', Math.max(1, attempts - 1))}
            className="w-10 h-10 rounded-full border text-xl flex items-center justify-center"
          >
            −
          </button>
          <span className="text-xl font-semibold w-8 text-center">{attempts}</span>
          <button
            type="button"
            onClick={() => setValue('attempts', attempts + 1)}
            className="w-10 h-10 rounded-full border text-xl flex items-center justify-center"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input {...register('sent')} id="sent" type="checkbox" className="w-5 h-5 accent-black" />
        <label htmlFor="sent" className="text-sm font-medium text-gray-700">Sent (completed)</label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Gym (optional)</label>
        <input
          {...register('gym')}
          type="text"
          placeholder="e.g. Boulders Oslo"
          className="w-full border rounded-lg px-3 py-2.5"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Beta video (optional)</label>
        <input
          {...register('beta_video_url')}
          type="url"
          placeholder="https://instagram.com/... or https://youtube.com/..."
          className="w-full border rounded-lg px-3 py-2.5 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
        <textarea
          {...register('notes')}
          rows={2}
          placeholder="Any notes..."
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-black text-white py-3 rounded-xl font-medium disabled:opacity-50"
      >
        {isSubmitting ? 'Saving...' : 'Add Problem'}
      </button>
    </form>
  )
}
