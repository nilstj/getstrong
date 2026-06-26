import { NavLink } from 'react-router-dom'
import { Home, CalendarDays, Users, User, BarChart2, LifeBuoy, Trophy, Plus } from 'lucide-react'

const ITEMS = [
  { to: '/dashboard', label: 'Home', Icon: Home },
  { to: '/sessions', label: 'Sessions', Icon: CalendarDays },
  { to: '/crews', label: 'Crews', Icon: Users },
  { to: '/challenges', label: 'Challenges', Icon: Trophy },
  { to: '/analysis', label: 'Analysis', Icon: BarChart2 },
  { to: '/help', label: 'Help', Icon: LifeBuoy },
  { to: '/profile', label: 'Profile', Icon: User },
]

export function SideNav() {
  return (
    <aside className="hidden lg:flex fixed top-0 left-0 bottom-0 w-56 flex-col gap-1 border-r border-gray-200 bg-[#f7f5f0] px-3 py-5 z-40">
      <div className="px-3 pb-4 text-lg font-black tracking-tight text-sage-800">GetStrong</div>
      {ITEMS.map(({ to, label, Icon }) => (
        <NavLink key={to} to={to}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive ? 'bg-sage-100 text-sage-800' : 'text-gray-600 hover:bg-gray-100'
            }`
          }>
          <Icon size={20} strokeWidth={1.9} /> {label}
        </NavLink>
      ))}
      <NavLink to="/sessions/new"
        className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-sage-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-sage-800">
        <Plus size={18} strokeWidth={2.5} /> Log session
      </NavLink>
    </aside>
  )
}
