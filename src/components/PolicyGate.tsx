import { Navigate, Outlet } from 'react-router-dom'
import { useProfile } from '../hooks/useProfile'
import { hasAcceptedCurrentPolicy } from '../utils/policy'

export function PolicyGate() {
  const { data: profile, isLoading } = useProfile()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  // Fail closed, like OnboardingGate: an unresolved profile means we cannot
  // show that this climber was ever told what the app does, so ask again.
  // `/accept-policy` sits outside this gate, so there is no redirect loop.
  if (!hasAcceptedCurrentPolicy(profile)) {
    return <Navigate to="/accept-policy" replace />
  }

  return <Outlet />
}
