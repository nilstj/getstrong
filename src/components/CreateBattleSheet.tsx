import { useState } from 'react'
import toast from 'react-hot-toast'
import { BottomSheet } from './BottomSheet'
import { GymBoulderPicker } from './GymBoulderPicker'
import { useMyCrews, useCreateCrewBattle } from '../hooks/useCrews'
import type { GymProblem } from '../types'

const DURATIONS = [3, 7, 14]

export function CreateBattleSheet({ open, onClose, opponentCrewId, opponentName }: {
  open: boolean
  onClose: () => void
  opponentCrewId: string
  opponentName: string
}) {
  const { data: myCrews = [] } = useMyCrews()
  const create = useCreateCrewBattle()
  const candidates = myCrews.filter(c => c.crew.id !== opponentCrewId)

  const [challengerId, setChallengerId] = useState('')
  const [type, setType] = useState<'boulder' | 'sends'>('sends')
  const [boulder, setBoulder] = useState<GymProblem | null>(null)
  const [duration, setDuration] = useState(7)

  const challenger = candidates.find(c => c.crew.id === challengerId) ?? candidates[0]
  const challengerCrewId = challenger?.crew.id ?? ''
  const homeGym = challenger?.crew.home_gym ?? null
  const canBoulder = !!homeGym

  const chip = (active: boolean) =>
    `flex-1 py-2 text-sm font-medium transition-colors ${active ? 'bg-sage-700 text-white' : 'bg-white text-gray-600'}`

  const submit = () => {
    if (!challengerCrewId) return
    if (type === 'boulder' && !boulder) { toast.error('Pick a boulder first'); return }
    create.mutate(
      { challengerCrew: challengerCrewId, opponentCrew: opponentCrewId, type, gymProblemId: type === 'boulder' ? boulder!.id : null, durationDays: duration },
      {
        onSuccess: () => { toast.success(`Challenge sent to ${opponentName}`); setType('sends'); setBoulder(null); setDuration(7); onClose() },
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not send challenge'),
      },
    )
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={`Challenge ${opponentName}`}>
      {candidates.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">You need a crew of your own before you can start a battle.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your crew</label>
            <select
              value={challengerCrewId}
              onChange={e => { setChallengerId(e.target.value); setBoulder(null); if (type === 'boulder') setType('sends') }}
              className="w-full border rounded-lg px-3 py-2.5"
            >
              {candidates.map(c => <option key={c.crew.id} value={c.crew.id}>{c.crew.emoji ?? '🧗'} {c.crew.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Battle</label>
            <div className="flex rounded-lg overflow-hidden border">
              <button type="button" onClick={() => setType('sends')} className={chip(type === 'sends')}>Most sends</button>
              <button type="button" onClick={() => canBoulder && setType('boulder')} disabled={!canBoulder} className={`${chip(type === 'boulder')} ${!canBoulder ? 'opacity-40' : ''}`}>Boulder all-clear</button>
            </div>
            {!canBoulder && <p className="text-xs text-gray-400 mt-1">Give your crew a home gym to battle on a specific boulder.</p>}
          </div>

          {type === 'boulder' && canBoulder && (
            boulder ? (
              <div className="flex items-center justify-between rounded-xl border px-3 py-2.5">
                <span className="text-sm font-medium text-gray-800 truncate">
                  {boulder.name ?? boulder.color ?? 'Boulder'}{boulder.community_grade ? ` · ${boulder.community_grade}` : ''}
                </span>
                <button type="button" onClick={() => setBoulder(null)} className="text-xs font-medium text-sage-700 flex-shrink-0">Change</button>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Pick a boulder at {homeGym}</label>
                <GymBoulderPicker gym={homeGym!} onPick={setBoulder} />
              </div>
            )
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
            <div className="flex gap-2">
              {DURATIONS.map(d => (
                <button key={d} type="button" onClick={() => setDuration(d)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium ${duration === d ? 'bg-sage-700 text-white border-sage-700' : 'bg-white text-gray-600 border-gray-300'}`}>
                  {d} days
                </button>
              ))}
            </div>
          </div>

          <button onClick={submit} disabled={create.isPending}
            className="w-full bg-sage-700 text-white py-3 rounded-xl font-semibold disabled:opacity-50">
            {create.isPending ? 'Sending…' : '⚔️ Send challenge'}
          </button>
        </div>
      )}
    </BottomSheet>
  )
}
