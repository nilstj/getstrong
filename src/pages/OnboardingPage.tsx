import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useProfile, useUpdateProfile } from '../hooks/useProfile'
import { DefaultGymsEditor } from '../components/DefaultGymsEditor'
import { normalizeGyms } from '../utils/defaultGyms'

export function OnboardingPage() {
  const navigate = useNavigate()
  const { data: profile } = useProfile()
  const updateProfile = useUpdateProfile()
  const [gyms, setGyms] = useState<string[]>([])

  // Already onboarded? Skip straight to the app.
  useEffect(() => {
    if (profile && (profile.default_gyms?.length ?? 0) > 0) {
      navigate('/dashboard', { replace: true })
    }
  }, [profile, navigate])

  const handleContinue = () => {
    const next = normalizeGyms(gyms)
    if (next.length === 0) return
    updateProfile.mutate(
      { default_gyms: next },
      {
        onSuccess: () => navigate('/dashboard', { replace: true }),
        onError: () => toast.error('Could not save your gyms'),
      },
    )
  }

  return (
    <div className="max-w-md mx-auto p-6 pt-12 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Where do you climb?</h1>
        <p className="text-sm text-gray-500">
          Pick your regular gyms or add a new one. The first is your primary — we'll use it to
          pre-fill new sessions. You can change these anytime on your profile.
        </p>
      </div>

      <DefaultGymsEditor value={gyms} onChange={setGyms} showPopular />

      <button
        type="button"
        onClick={handleContinue}
        disabled={normalizeGyms(gyms).length === 0 || updateProfile.isPending}
        className="w-full bg-sage-700 text-white py-3 rounded-xl font-medium disabled:opacity-50"
      >
        {updateProfile.isPending ? 'Saving…' : 'Continue'}
      </button>
    </div>
  )
}
