import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { useSession, useUpdateSession } from '../hooks/useSessions'

type FormValues = {
  date: string
  location: string
  duration_minutes: string
  notes: string
}

export function EditSessionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: session, isLoading } = useSession(id!)
  const updateSession = useUpdateSession()
  const { register, handleSubmit, reset } = useForm<FormValues>()

  useEffect(() => {
    if (session) {
      reset({
        date: session.date,
        location: session.location,
        duration_minutes: session.duration_minutes?.toString() ?? '',
        notes: session.notes ?? '',
      })
    }
  }, [session, reset])

  if (isLoading) return <div className="p-4 text-gray-500">Loading...</div>
  if (!session) return <div className="p-4 text-red-600">Session not found.</div>

  const onSubmit = (values: FormValues) => {
    updateSession.mutate(
      {
        id: id!,
        date: values.date,
        location: values.location,
        duration_minutes: values.duration_minutes ? parseInt(values.duration_minutes) : null,
        notes: values.notes || null,
      },
      {
        onSuccess: () => navigate(`/sessions/${id}`),
        onError: () => toast.error('Failed to update session'),
      },
    )
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">Edit Session</h1>
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
            className="w-full border rounded-lg px-3 py-2.5"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes, optional)</label>
          <input
            {...register('duration_minutes')}
            type="number"
            min="1"
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
          disabled={updateSession.isPending}
          className="w-full bg-black text-white py-3 rounded-xl font-medium disabled:opacity-50"
        >
          {updateSession.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}
