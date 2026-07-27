import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ArrowUp, ArrowDown, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useProfile } from '../hooks/useProfile'
import { useGymSuggestions } from '../hooks/useGymSuggestions'
import { useGymGradings, useSaveGymGradings } from '../hooks/useGymGradings'
import { HOLD_COLORS } from '../utils/holdColors'
import { TapeGraphic } from '../components/Chip'

interface Row { color_name: string; points: number }

export function GymGradingPage() {
  const navigate = useNavigate()
  const { data: profile, isLoading } = useProfile()
  const { data: gyms = [] } = useGymSuggestions()
  const [gym, setGym] = useState('')
  const { data: existing = [] } = useGymGradings(gym || null)
  const save = useSaveGymGradings()

  // Ordered easiest -> hardest. rank is the array index on save.
  const [rows, setRows] = useState<Row[]>([])
  useEffect(() => {
    setRows(existing.map(g => ({ color_name: g.color_name, points: g.points })))
  }, [existing])

  if (isLoading) return <div className="p-4 text-gray-500">Loading...</div>
  if (!profile?.is_admin && !profile?.is_setter) return <div className="p-4 text-red-500">Not authorized.</div>

  const used = new Set(rows.map(r => r.color_name))
  const available = HOLD_COLORS.filter(c => !used.has(c.name))

  const addColor = (name: string) => setRows(prev => [...prev, { color_name: name, points: 0 }])
  const removeColor = (name: string) => setRows(prev => prev.filter(r => r.color_name !== name))
  const setPoints = (name: string, points: number) =>
    setRows(prev => prev.map(r => (r.color_name === name ? { ...r, points } : r)))
  const move = (idx: number, dir: -1 | 1) => setRows(prev => {
    const next = [...prev]
    const j = idx + dir
    if (j < 0 || j >= next.length) return prev
    ;[next[idx], next[j]] = [next[j], next[idx]]
    return next
  })

  const onSave = () => {
    if (!gym) { toast.error('Pick a gym first'); return }
    save.mutate(
      { gym, rows: rows.map((r, i) => ({ color_name: r.color_name, rank: i, points: r.points })) },
      { onSuccess: () => toast.success('Grading saved'), onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to save') },
    )
  }

  return (
    <div className="p-4 space-y-6 pb-28">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/profile')} className="text-gray-400 hover:text-gray-700 transition-colors">
          <ChevronLeft size={20} strokeWidth={1.75} />
        </button>
        <h1 className="text-xl font-bold">Gym Grading</h1>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Gym</label>
        <input
          list="gym-grading-gyms"
          value={gym}
          onChange={e => setGym(e.target.value)}
          placeholder="e.g. Boulders Oslo"
          className="w-full border rounded-lg px-3 py-2.5"
        />
        <datalist id="gym-grading-gyms">
          {gyms.map(g => <option key={g.name} value={g.name} />)}
        </datalist>
      </div>

      {gym && (
        <>
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Colours (easiest → hardest)</p>
            {rows.length === 0 && <p className="text-sm text-gray-400 mb-2">No colours yet. Add some below.</p>}
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={r.color_name} className="flex items-center gap-3 border rounded-xl px-3 py-2">
                  <TapeGraphic color={r.color_name} size={26} />
                  <span className="text-sm font-medium text-gray-700 flex-1">{r.color_name}</span>
                  <label className="text-xs text-gray-400">pts</label>
                  <input
                    type="number"
                    value={r.points}
                    onChange={e => setPoints(r.color_name, Number(e.target.value) || 0)}
                    className="w-16 border rounded-lg px-2 py-1 text-sm"
                  />
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="text-gray-400 disabled:opacity-30 hover:text-gray-700"><ArrowUp size={16} /></button>
                  <button onClick={() => move(i, 1)} disabled={i === rows.length - 1} className="text-gray-400 disabled:opacity-30 hover:text-gray-700"><ArrowDown size={16} /></button>
                  <button onClick={() => removeColor(r.color_name)} className="text-gray-300 hover:text-red-500"><X size={16} /></button>
                </div>
              ))}
            </div>
          </div>

          {available.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-2">Add colour:</p>
              <div className="flex flex-wrap gap-2">
                {available.map(c => (
                  <button key={c.name} onClick={() => addColor(c.name)} title={c.name} aria-label={c.name}
                    className="grid place-items-center rounded-lg p-1 hover:bg-gray-100 transition">
                    <TapeGraphic color={c.name} size={26} />
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={onSave}
            disabled={save.isPending}
            className="w-full bg-sage-700 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : 'Save Grading'}
          </button>
        </>
      )}
    </div>
  )
}
