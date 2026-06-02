import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { useCreateSession } from '../hooks/useSessions'

type FormValues = {
  date: string
  location: string
  duration_minutes: string
  notes: string
}

export function NewSessionPage() {
  const navigate = useNavigate()
  const createSession = useCreateSession()
  const { register, handleSubmit } = useForm<FormValues>({
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      location: '',
      duration_minutes: '',
      notes: '',
    },
  })

  const onSubmit = (values: FormValues) => {
    createSession.mutate(
      {
        date: values.date,
        location: values.location,
        duration_minutes: values.duration_minutes ? parseInt(values.duration_minutes) : null,
        notes: values.notes || null,
      },
      {
        onSuccess: (session) => navigate(`/sessions/${session.id}`),
        onError: () => toast.error('Failed to create session'),
      },
    )
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">New Session</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            {...register('date', { required: true })}
            type="date"
            className="w-full border rounded-lg px-3 py-2.5"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
          <input
            {...register('location', { required: true })}
            type="text"
            placeholder="Gym name, Kilter Board, crag..."
            className="w-full border rounded-lg px-3 py-2.5"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes, optional)</label>
          <input
            {...register('duration_minutes')}
            type="number"
            min="1"
            placeholder="90"
            className="w-full border rounded-lg px-3 py-2.5"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea
            {...register('notes')}
            rows={3}
            className="w-full border rounded-lg px-3 py-2.5"
          />
        </div>
        <button
          type="submit"
          disabled={createSession.isPending}
          className="w-full bg-black text-white py-3 rounded-xl font-medium disabled:opacity-50"
        >
          {createSession.isPending ? 'Creating...' : 'Start Session'}
        </button>
      </form>
    </div>
  )
}
