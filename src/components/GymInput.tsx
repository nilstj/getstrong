import { useState, useRef } from 'react'
import { useGymSuggestions } from '../hooks/useGymSuggestions'
import { filterGymSuggestions } from '../utils/gymSuggestions'

export function GymInput({
  value, onChange, placeholder, id, onCommit,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  id?: string
  onCommit?: () => void
}) {
  const { data: suggestions = [] } = useGymSuggestions()
  const [open, setOpen] = useState(false)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const matches = filterGymSuggestions(suggestions, value)

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay so a suggestion mousedown/click registers before we close.
          blurTimer.current = setTimeout(() => { setOpen(false); onCommit?.() }, 150)
        }}
        className="w-full border rounded-lg px-3 py-2.5"
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {matches.map(name => (
            <li key={name}>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()} /* keep input focus so the click lands */
                onClick={() => {
                  if (blurTimer.current) clearTimeout(blurTimer.current)
                  onChange(name)
                  setOpen(false)
                  onCommit?.()
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-sage-50"
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
