import { useState } from 'react'
import toast from 'react-hot-toast'
import { BottomSheet } from './BottomSheet'
import { useCreateGym, useGymSuggestions } from '../hooks/useGymSuggestions'
import { nearDuplicateGyms, isPlausibleGymName, gymLabel } from '../utils/gymRegistry'
import { errorMessage } from '../utils/errors'
import type { GymMatch } from '../utils/gymRegistry'

const INPUT = 'w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500'

function reasonLabel(reason: GymMatch['reason']): string {
  if (reason === 'exact') return 'Same gym'
  if (reason === 'branch') return 'Another branch'
  return 'Very similar'
}

/**
 * Adding a gym, as a deliberate act. A climber standing in an unlisted gym is
 * never blocked — but the near-duplicate check goes in front of the create, so
 * "Klatreverkeet" gets one chance to become "Klatreverket" before it becomes a
 * second boulder list and a second leaderboard.
 */
export function AddGymSheet({
  open, initialName, onClose, onAdded,
}: {
  open: boolean
  initialName: string
  onClose: () => void
  onAdded: (label: string) => void
}) {
  const { data: gyms = [] } = useGymSuggestions()
  const create = useCreateGym()
  const [name, setName] = useState(initialName)
  const [city, setCity] = useState('')
  const [candidates, setCandidates] = useState<GymMatch[] | null>(null)
  const [lastOpen, setLastOpen] = useState(open)
  const [lastInitial, setLastInitial] = useState(initialName)

  // Opening the sheet starts a fresh gym, so the fields reset to what the
  // climber typed into the picker. Adjusted during render rather than from an
  // effect: an effect corrects the fields a paint late, flashing the previous
  // gym's name, and deferring it to a microtask does the same thing while also
  // hiding why react-hooks/set-state-in-effect was complaining.
  if (open !== lastOpen || initialName !== lastInitial) {
    setLastOpen(open)
    setLastInitial(initialName)
    if (open) {
      setName(initialName)
      setCity('')
      setCandidates(null)
    }
  }

  const trimmedCity = city.trim() === '' ? null : city.trim()

  const add = async () => {
    try {
      const gym = await create.mutateAsync({ name: name.trim(), city: trimmedCity })
      onAdded(gym.label)
      toast.success(`Added ${gym.label}`)
      onClose()
    } catch (e) {
      // A Supabase { data, error } throw is not an Error instance, so
      // e instanceof Error is false and e.message is the only way to the
      // server's actual reason.
      toast.error(errorMessage(e, 'Could not add that gym'))
    }
  }

  const check = () => {
    if (!isPlausibleGymName(name)) {
      toast.error('That does not look like a gym name')
      return
    }
    const hits = nearDuplicateGyms(name.trim(), trimmedCity, gyms)
    if (hits.length > 0) { setCandidates(hits); return }
    void add()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Add a gym">
      {candidates === null ? (
        <div className="space-y-4">
          <div>
            <label htmlFor="add-gym-name" className="block text-sm font-medium text-gray-700 mb-1">Gym</label>
            <input
              id="add-gym-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Klatreverket"
              className={INPUT}
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="add-gym-city" className="block text-sm font-medium text-gray-700 mb-1">
              City or area <span className="text-gray-400">(optional)</span>
            </label>
            <input
              id="add-gym-city"
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="e.g. Torshov"
              className={INPUT}
            />
            <p className="mt-1 text-xs text-gray-400">
              Chains have branches — this is what keeps them apart.
            </p>
          </div>
          <p className="text-xs text-gray-400">
            Will be listed as <span className="font-medium text-gray-600">{gymLabel(name, trimmedCity) || '…'}</span>
          </p>
          <button
            type="button"
            onClick={check}
            disabled={name.trim() === '' || create.isPending}
            className="w-full rounded-lg bg-sage-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {create.isPending ? 'Adding…' : 'Add gym'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Is it one of these? Picking an existing gym keeps everyone's beta in one place.
          </p>
          <ul className="space-y-2">
            {candidates.map(({ gym, reason }) => (
              <li key={gym.id}>
                <button
                  type="button"
                  onClick={() => { onAdded(gym.label); onClose() }}
                  className="w-full flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-left hover:bg-sage-50"
                >
                  <span className="flex-1 text-sm font-medium">{gym.label}</span>
                  <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-400">
                    {reasonLabel(reason)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void add()}
            disabled={create.isPending}
            className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 disabled:opacity-40"
          >
            {create.isPending ? 'Adding…' : `No — add ${gymLabel(name, trimmedCity)}`}
          </button>
        </div>
      )}
    </BottomSheet>
  )
}
