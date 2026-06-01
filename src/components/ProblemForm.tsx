import { useForm } from 'react-hook-form'
import type { Problem, GradeSystem } from '../types'
import { V_GRADES, FONT_GRADES_ORDERED } from '../utils/grades'

const BOARDS = ['Kilterboard', 'Moonboard', 'TB2'] as const

type FormValues = {
  grade_system: GradeSystem
  grade_value: string
  color: string
  attempts: number
  sent: boolean
  board: string
  gym: string
  beta_video_url: string
  notes: string
}

interface ProblemFormProps {
  onSubmit: (values: Omit<Problem, 'id' | 'session_id' | 'user_id' | 'created_at'>) => void
  isSubmitting: boolean
}

export function ProblemForm({ onSubmit, isSubmitting }: ProblemFormProps) {
  const { register, handleSubmit, watch, setValue } = useForm<FormValues>({
    defaultValues: {
      grade_system: 'font',
      grade_value: '',
      color: '',
      attempts: 1,
      sent: false,
      board: '',
      gym: '',
      beta_video_url: '',
      notes: '',
    },
  })

  const gradeSystem = watch('grade_system')
  const attempts = watch('attempts')
  const board = watch('board')

  const submit = (values: FormValues) => {
    onSubmit({
      grade_system: values.grade_system,
      grade_value: values.grade_value || null,
      color: values.color || null,
      attempts: values.attempts,
      sent: values.sent,
      board: values.board || null,
      gym: values.gym || null,
      beta_video_url: values.beta_video_url || null,
      notes: values.notes || null,
    })
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Grade System</label>
        <div className="flex rounded-lg overflow-hidden border">
          {(['v_scale', 'font', 'color'] as const).map(system => (
            <button
              key={system}
              type="button"
              onClick={() => { setValue('grade_system', system); setValue('grade_value', '') }}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                gradeSystem === system ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'
              }`}
            >
              {system === 'v_scale' ? 'V-Scale' : system === 'font' ? 'Font' : 'Color'}
            </button>
          ))}
        </div>
      </div>

      {gradeSystem !== 'color' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Grade</label>
          <select {...register('grade_value')} className="w-full border rounded-lg px-3 py-2.5">
            <option value="">Select grade</option>
            {(gradeSystem === 'v_scale' ? V_GRADES : FONT_GRADES_ORDERED).map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
      )}

      {gradeSystem !== 'color' && (
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
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white border-gray-300 text-gray-600'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {gradeSystem === 'color' ? 'Color' : 'Gym Color (optional)'}
        </label>
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
        <input {...register('sent')} id="sent" type="checkbox" className="w-5 h-5 accent-indigo-600" />
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
        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium disabled:opacity-50"
      >
        {isSubmitting ? 'Saving...' : 'Add Problem'}
      </button>
    </form>
  )
}
