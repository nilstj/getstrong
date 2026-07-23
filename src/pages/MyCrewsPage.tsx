import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Users, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  useMyCrews, usePendingCrewInvites, useCreateCrew,
  useAcceptCrewInvite, useDeclineCrewInvite,
} from '../hooks/useCrews'
import { BottomSheet } from '../components/BottomSheet'

export function MyCrewsPage() {
  const navigate = useNavigate()
  const { data: crews = [], isLoading } = useMyCrews()
  const { data: invites = [] } = usePendingCrewInvites()
  const createCrew = useCreateCrew()
  const acceptInvite = useAcceptCrewInvite()
  const declineInvite = useDeclineCrewInvite()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('')
  const [homeGym, setHomeGym] = useState('')

  const create = () => {
    createCrew.mutate(
      { name: name.trim(), emoji: emoji.trim() || null, homeGym: homeGym.trim() || null },
      {
        onSuccess: (id) => {
          setSheetOpen(false); setName(''); setEmoji(''); setHomeGym('')
          toast.success('Crew created')
          navigate(`/crews/${id}`)
        },
        onError: () => toast.error('Could not create the crew'),
      },
    )
  }

  return (
    <div className="p-4 pb-32 lg:max-w-2xl lg:mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Crews</h1>
        <button
          onClick={() => setSheetOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-sage-700 text-white px-3.5 py-2 text-sm font-semibold"
        >
          <Plus size={16} strokeWidth={2.5} /> Create
        </button>
      </div>

      {invites.length > 0 && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Invites</h2>
          <div className="space-y-2">
            {invites.map(inv => (
              <div key={inv.crew.id} className="flex items-center gap-3 bg-sage-50 border border-sage-200 rounded-2xl p-3">
                <div className="w-11 h-11 rounded-xl bg-white grid place-items-center text-xl flex-shrink-0">{inv.crew.emoji ?? '🧗'}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{inv.crew.name}</p>
                  <p className="text-xs text-gray-500 truncate">{inv.crew.home_gym ?? 'Invited to join'}</p>
                </div>
                <button
                  onClick={() => declineInvite.mutate(inv.crew.id, { onError: () => toast.error('Failed') })}
                  className="text-xs font-medium px-3 py-1.5 rounded-full bg-gray-200 text-gray-600"
                >
                  Decline
                </button>
                <button
                  onClick={() => acceptInvite.mutate(inv.crew.id, {
                    onSuccess: () => { toast.success(`Joined ${inv.crew.name}`); navigate(`/crews/${inv.crew.id}`) },
                    onError: () => toast.error('Failed'),
                  })}
                  className="text-xs font-medium px-3 py-1.5 rounded-full bg-sage-700 text-white"
                >
                  Join
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400 text-center py-10">Loading your crews…</p>
      ) : crews.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-sage-50 grid place-items-center mx-auto mb-3"><Users size={26} className="text-sage-600" /></div>
          <p className="text-sm text-gray-600 font-medium">No crews yet</p>
          <p className="mt-1 text-xs text-gray-400 max-w-xs mx-auto">Start a crew with the friends you train with — track standings and take on other crews.</p>
          <button onClick={() => setSheetOpen(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-sage-700 text-white px-4 py-2.5 text-sm font-semibold">
            <Plus size={16} strokeWidth={2.5} /> Create a crew
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {crews.map(({ crew, role, memberCount }) => (
            <Link
              key={crew.id}
              to={`/crews/${crew.id}`}
              className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-3 hover:border-sage-300 transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-sage-50 grid place-items-center text-2xl flex-shrink-0">{crew.emoji ?? '🧗'}</div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{crew.name}</p>
                <p className="text-xs text-gray-500 truncate">
                  {memberCount} {memberCount === 1 ? 'member' : 'members'}{crew.home_gym ? ` · ${crew.home_gym}` : ''}
                </p>
              </div>
              {role === 'owner' && <span className="text-[10px] font-semibold uppercase tracking-wide text-sage-600 bg-sage-50 rounded-full px-2 py-0.5">Owner</span>}
            </Link>
          ))}
        </div>
      )}

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Create a crew">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Crew name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. The Sloper Snobs"
              className="w-full border rounded-lg px-3 py-2.5" />
          </div>
          <div className="flex gap-3">
            <div className="w-24">
              <label className="block text-sm font-medium text-gray-700 mb-1">Emoji</label>
              <input value={emoji} onChange={e => setEmoji(e.target.value.slice(0, 2))} placeholder="🐐"
                className="w-full border rounded-lg px-3 py-2.5 text-center text-lg" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Home gym (optional)</label>
              <input value={homeGym} onChange={e => setHomeGym(e.target.value)} placeholder="e.g. Boulders Oslo"
                className="w-full border rounded-lg px-3 py-2.5" />
            </div>
          </div>
          <button
            onClick={create}
            disabled={!name.trim() || createCrew.isPending}
            className="w-full bg-sage-700 text-white py-3 rounded-xl font-semibold disabled:opacity-50"
          >
            {createCrew.isPending ? 'Creating…' : 'Create crew'}
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
