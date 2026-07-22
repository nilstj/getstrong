import { Navigate, Outlet } from 'react-router-dom'
import { useProfile } from '../hooks/useProfile'

export function OnboardingGate() {
  const { data: profile, isLoading } = useProfile()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  // Fail closed: if the profile hasn't resolved to data with gyms (error,
  // missing row, or genuinely empty), route to onboarding rather than admit
  // an un-onboarded user into the app. `/onboarding` is outside this gate, so
  // no redirect loop.
  if (!profile || (profile.default_gyms?.length ?? 0) === 0) {
    return <Navigate to="/onboarding" replace />
  }

  return <Outlet />
}
