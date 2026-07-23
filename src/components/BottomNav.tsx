import { NavLink, useNavigate } from 'react-router-dom'
import { Home, CalendarDays, Plus, Users, User, TrainFront } from 'lucide-react'
import { useReceivedFollowRequests } from '../hooks/useFollows'

export function BottomNav() {
  const navigate = useNavigate()
  const { data: followRequests = [] } = useReceivedFollowRequests()

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${
      isActive ? 'text-sage-800' : 'text-gray-400'
    }`

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30 flex pb-safe lg:hidden">
      <NavLink to="/dashboard" className={linkClass}>
        {({ isActive }) => (
          <>
            <Home size={22} strokeWidth={isActive ? 2.5 : 1.75} />
            <span className={`text-[10px] font-medium ${isActive ? 'font-semibold' : ''}`}>Home</span>
          </>
        )}
      </NavLink>

      <NavLink to="/sessions" className={linkClass}>
        {({ isActive }) => (
          <>
            <CalendarDays size={22} strokeWidth={isActive ? 2.5 : 1.75} />
            <span className={`text-[10px] font-medium ${isActive ? 'font-semibold' : ''}`}>Sessions</span>
          </>
        )}
      </NavLink>

      <button
        onClick={() => navigate('/sessions/new')}
        className="flex-1 flex flex-col items-center justify-center py-2"
      >
        <div className="w-10 h-10 bg-sage-700 rounded-full flex items-center justify-center shadow-md">
          <Plus size={20} strokeWidth={2.5} className="text-white" />
        </div>
      </button>

      <NavLink to="/crews" className={linkClass}>
        {({ isActive }) => (
          <>
            <Users size={22} strokeWidth={isActive ? 2.5 : 1.75} />
            <span className={`text-[10px] font-medium ${isActive ? 'font-semibold' : ''}`}>Crews</span>
          </>
        )}
      </NavLink>

      <NavLink to="/sendtrains" className={linkClass}>
        {({ isActive }) => (
          <>
            <TrainFront size={22} strokeWidth={isActive ? 2.5 : 1.75} />
            <span className={`text-[10px] font-medium ${isActive ? 'font-semibold' : ''}`}>Sendtrains</span>
          </>
        )}
      </NavLink>

      <NavLink to="/profile" className={linkClass}>
        {({ isActive }) => (
          <>
            <div className="relative">
              <User size={22} strokeWidth={isActive ? 2.5 : 1.75} />
              {followRequests.length > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </div>
            <span className={`text-[10px] font-medium ${isActive ? 'font-semibold' : ''}`}>Profile</span>
          </>
        )}
      </NavLink>
    </nav>
  )
}
