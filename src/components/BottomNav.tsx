import { NavLink, useNavigate } from 'react-router-dom'

export function BottomNav() {
  const navigate = useNavigate()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t z-30 flex safe-area-inset-bottom">
      <NavLink
        to="/dashboard"
        className={({ isActive }) =>
          `flex-1 flex flex-col items-center py-3 text-xs font-medium ${isActive ? 'text-indigo-600' : 'text-gray-500'}`
        }
      >
        Dashboard
      </NavLink>
      <NavLink
        to="/sessions"
        className={({ isActive }) =>
          `flex-1 flex flex-col items-center py-3 text-xs font-medium ${isActive ? 'text-indigo-600' : 'text-gray-500'}`
        }
      >
        Sessions
      </NavLink>
      <button
        onClick={() => navigate('/sessions/new')}
        className="flex-1 flex flex-col items-center py-3 text-xs font-medium text-indigo-600"
      >
        <span className="text-2xl font-bold leading-none mb-0.5">+</span>
        Log
      </button>
      <NavLink
        to="/challenges"
        className={({ isActive }) =>
          `flex-1 flex flex-col items-center py-3 text-xs font-medium ${isActive ? 'text-indigo-600' : 'text-gray-500'}`
        }
      >
        Challenges
      </NavLink>
      <NavLink
        to="/profile"
        className={({ isActive }) =>
          `flex-1 flex flex-col items-center py-3 text-xs font-medium ${isActive ? 'text-indigo-600' : 'text-gray-500'}`
        }
      >
        Profile
      </NavLink>
    </nav>
  )
}
