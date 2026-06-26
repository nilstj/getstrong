import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'
import { BottomNav } from './BottomNav'
import { AppBar } from './AppBar'
import { SideNav } from './SideNav'

export function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return (
    <div className="min-h-screen pt-12 pb-20 lg:pl-56">
      <SideNav />
      <AppBar />
      <Outlet />
      <BottomNav />
    </div>
  )
}
