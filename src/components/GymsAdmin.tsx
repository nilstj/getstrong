import { useState } from 'react'
import { BadgeCheck, Pencil, Merge } from 'lucide-react'
import toast from 'react-hot-toast'
import { BottomSheet } from './BottomSheet'
import { useGymSuggestions } from '../hooks/useGymSuggestions'
import { useSetGymVerified, useRenameGym, useMergeGyms, useGymMergeImpact } from '../hooks/useGymAdmin'
import { gymLabel } from '../utils/gymRegistry'
import { errorMessage } from '../utils/errors'
import type { GymOption } from '../types'

const INPUT = 'w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500'

/** Climber-added and unverified first — that is the queue that needs looking at. */
function adminOrder(gyms: GymOption[]): GymOption[] {
  return [...gyms].sort((a, b) => {
    const aNeeds = a.climber_added && !a.verified
    const bNeeds = b.climber_added && !b.verified
    if (aNeeds !== bNeeds) return aNeeds ? -1 : 1
    return b.uses - a.uses || a.label.localeCompare(b.label)
  })
}

function MergeSheet({ from, gyms, onClose }: { from: GymOption; gyms: GymOption[]; onClose: () => void }) {
  const [targetId, setTargetId] = useState('')
  const merge = useMergeGyms()
  const target = gyms.find(g => g.id === targetId) ?? null
  const { data: impact } = useGymMergeImpact(from.label, target?.label ?? null)

  const run = async () => {
    if (!target) return
    try {
      await merge.mutateAsync({ from: from.id, to: target.id })
      toast.success(`Merged into ${target.label}`)
      onClose()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not merge those gyms'))
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Everything logged at <span className="font-semibold">{from.label}</span> moves to the gym you pick.
        This cannot be undone.
      </p>
      <select value={targetId} onChange={e => setTargetId(e.target.value)} className={INPUT}>
        <option value="">Merge into…</option>
        {gyms.filter(g => g.id !== from.id).map(g => (
          <option key={g.id} value={g.id}>{g.label}</option>
        ))}
      </select>
      {impact && (
        <ul className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600 space-y-0.5">
          <li>{impact.problems} logged problems</li>
          <li>{impact.boulders} shared boulders</li>
          <li>{impact.sessions} sessions, {impact.session_groups} shared sessions</li>
          <li>{impact.crews} sendtrains, {impact.crew_plans} plans</li>
          <li>{impact.climbers} climbers' default gyms</li>
          <li>{impact.announcements} wall announcements, {impact.beta_points} beta points rows</li>
          <li className="pt-1 text-gray-400">All of those move across. Only clashes are destroyed:</li>
          {!target ? (
            <li className="font-semibold text-gray-500">Pick a target to see what would be lost.</li>
          ) : impact.gradings_discarded === 0 && impact.award_rounds_discarded === 0 ? (
            <li className="font-semibold text-sage-700">
              Nothing would be lost — no grading colour or award round clashes with {target.label}.
            </li>
          ) : (
            <>
              {impact.gradings_discarded > 0 && (
                <li className="font-semibold text-red-500">
                  {impact.gradings_discarded} of {impact.gradings} grading colours lost — {target.label} already sets those
                </li>
              )}
              {impact.award_rounds_discarded > 0 && (
                <li className="font-semibold text-red-500">
                  {impact.award_rounds_discarded} of {impact.award_rounds} award rounds lost, with their votes — {target.label} already has a round that day
                </li>
              )}
            </>
          )}
        </ul>
      )}
      <button
        type="button"
        onClick={() => void run()}
        disabled={!target || merge.isPending}
        className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
      >
        {merge.isPending ? 'Merging…' : `Merge into ${target?.label ?? '…'}`}
      </button>
    </div>
  )
}

function RenameSheet({ gym, onClose }: { gym: GymOption; onClose: () => void }) {
  const [name, setName] = useState(gym.name)
  const [city, setCity] = useState(gym.city ?? '')
  const rename = useRenameGym()

  const run = async () => {
    try {
      await rename.mutateAsync({ id: gym.id, name: name.trim(), city: city.trim() || null })
      toast.success('Renamed')
      onClose()
    } catch (e) {
      // rename_gym raises rather than silently merging when the new name
      // already exists — surface that reason verbatim.
      toast.error(errorMessage(e, 'Could not rename that gym'))
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="rename-gym-name" className="block text-sm font-medium text-gray-700 mb-1">Gym</label>
        <input id="rename-gym-name" value={name} onChange={e => setName(e.target.value)} className={INPUT} />
      </div>
      <div>
        <label htmlFor="rename-gym-city" className="block text-sm font-medium text-gray-700 mb-1">
          City or area <span className="text-gray-400">(optional)</span>
        </label>
        <input id="rename-gym-city" value={city} onChange={e => setCity(e.target.value)} className={INPUT} />
      </div>
      <p className="text-xs text-gray-400">
        Will be listed as <span className="font-medium text-gray-600">{gymLabel(name, city) || '…'}</span>,
        and the old name is rewritten everywhere it was logged.
      </p>
      <button
        type="button"
        onClick={() => void run()}
        disabled={name.trim() === '' || rename.isPending}
        className="w-full rounded-lg bg-sage-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
      >
        {rename.isPending ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

/**
 * The cleanup lever. New gyms are instant and provisional, so something has to
 * be able to verify a real one, fix a spelling, and fold a duplicate back in.
 */
export function GymsAdmin() {
  const { data: gyms = [] } = useGymSuggestions()
  const setVerified = useSetGymVerified()
  const [renaming, setRenaming] = useState<GymOption | null>(null)
  const [merging, setMerging] = useState<GymOption | null>(null)

  const toggle = async (gym: GymOption) => {
    try {
      await setVerified.mutateAsync({ id: gym.id, verified: !gym.verified })
    } catch (e) {
      toast.error(errorMessage(e, 'Could not change that gym'))
    }
  }

  return (
    <div>
      <h2 className="text-base font-semibold mb-3">Gyms</h2>
      <p className="text-xs text-gray-400 mb-2">
        Climber-added gyms come first. Verifying one floats it to the top of the picker; merging moves
        everything logged at one gym to another and cannot be undone.
      </p>
      <ul className="space-y-2">
        {adminOrder(gyms).map(gym => (
          <li key={gym.id} className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium">{gym.label}</p>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">
                {gym.uses} logged{gym.climber_added ? ' · climber-added' : ''}{gym.verified ? ' · verified' : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void toggle(gym)}
              title={gym.verified ? 'Unverify' : 'Verify'}
              aria-label={gym.verified ? `Unverify ${gym.label}` : `Verify ${gym.label}`}
              className={gym.verified ? 'text-sage-700' : 'text-gray-300 hover:text-gray-500'}
            >
              <BadgeCheck size={18} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => setRenaming(gym)}
              title="Rename"
              aria-label={`Rename ${gym.label}`}
              className="text-gray-400 hover:text-gray-700"
            >
              <Pencil size={16} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => setMerging(gym)}
              title="Merge into another gym"
              aria-label={`Merge ${gym.label}`}
              className="text-gray-400 hover:text-red-600"
            >
              <Merge size={16} strokeWidth={1.75} />
            </button>
          </li>
        ))}
      </ul>

      {/* Sheets are siblings of the heading, never children of it. */}
      <BottomSheet open={renaming !== null} onClose={() => setRenaming(null)} title="Rename gym">
        {renaming && <RenameSheet gym={renaming} onClose={() => setRenaming(null)} />}
      </BottomSheet>
      <BottomSheet open={merging !== null} onClose={() => setMerging(null)} title="Merge gym">
        {merging && <MergeSheet from={merging} gyms={gyms} onClose={() => setMerging(null)} />}
      </BottomSheet>
    </div>
  )
}
