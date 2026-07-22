import { useState } from 'react'
import { X } from 'lucide-react'
import { GymInput } from './GymInput'
import { useGymSuggestions } from '../hooks/useGymSuggestions'
import { addGym, removeGym, moveToFront } from '../utils/defaultGyms'

export function DefaultGymsEditor({
  value, onChange, showPopular = false,
}: {
  value: string[]
  onChange: (gyms: string[]) => void
  showPopular?: boolean
}) {
  const [draft, setDraft] = useState('')
  const { data: suggestions = [] } = useGymSuggestions()

  const commitDraft = () => {
    const next = addGym(value, draft)
    if (next.length !== value.length) onChange(next)
    setDraft('')
  }

  const popular = suggestions
    .map(s => s.name)
    .filter(name => !value.some(g => g.toLowerCase() === name.toLowerCase()))
    .slice(0, 8)

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="flex-1">
          <GymInput
            value={draft}
            onChange={setDraft}
            placeholder="Add a gym…"
          />
        </div>
        <button
          type="button"
          onClick={commitDraft}
          disabled={draft.trim() === ''}
          className="px-4 rounded-lg bg-sage-700 text-white text-sm font-medium disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {showPopular && popular.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {popular.map(name => (
            <button
              key={name}
              type="button"
              onClick={() => onChange(addGym(value, name))}
              className="px-3 py-1.5 rounded-full border border-gray-200 text-sm text-gray-600 hover:bg-sage-50"
            >
              + {name}
            </button>
          ))}
        </div>
      )}

      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((name, i) => (
            <li key={name} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
              <span className="flex-1 text-sm font-medium">{name}</span>
              {i === 0 ? (
                <span className="text-[10px] uppercase tracking-wide font-semibold text-sage-700">Primary</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onChange(moveToFront(value, name))}
                  className="text-xs text-sage-700 font-medium"
                >
                  Make primary
                </button>
              )}
              <button
                type="button"
                onClick={() => onChange(removeGym(value, name))}
                className="text-gray-400 hover:text-gray-600"
                aria-label={`Remove ${name}`}
              >
                <X size={16} strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
