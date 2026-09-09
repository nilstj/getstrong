import { useState } from 'react'
import { X } from 'lucide-react'
import { GymPicker } from './GymPicker'
import { AddGymSheet } from './AddGymSheet'
import { useGymSuggestions } from '../hooks/useGymSuggestions'
import { addGym, removeGym, moveToFront } from '../utils/defaultGyms'

export function DefaultGymsEditor({
  value, onChange, showPopular = false,
}: {
  value: string[]
  onChange: (gyms: string[]) => void
  showPopular?: boolean
}) {
  const { data: suggestions = [] } = useGymSuggestions()
  const [addingGym, setAddingGym] = useState<string | null>(null)

  const add = (label: string) => {
    const next = addGym(value, label)
    if (next.length !== value.length) onChange(next)
  }

  const popular = suggestions
    .map(s => s.label)
    .filter(label => !value.some(g => g.toLowerCase() === label.toLowerCase()))
    .slice(0, 8)

  return (
    <>
      <div className="space-y-3">
        <GymPicker
          value=""
          onChange={add}
          placeholder="Add a gym…"
          onAddRequest={setAddingGym}
          clearOnSelect
        />

        {showPopular && popular.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {popular.map(label => (
              <button
                key={label}
                type="button"
                onClick={() => onChange(addGym(value, label))}
                className="px-3 py-1.5 rounded-full border border-gray-200 text-sm text-gray-600 hover:bg-sage-50"
              >
                + {label}
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
      <AddGymSheet
        open={addingGym !== null}
        initialName={addingGym ?? ''}
        onClose={() => setAddingGym(null)}
        onAdded={add}
      />
    </>
  )
}
