import { useState, useRef, useEffect } from 'react'
import { Check, Plus } from 'lucide-react'
import { useGymSuggestions } from '../hooks/useGymSuggestions'
import { filterGyms } from '../utils/gymRegistry'

/**
 * Picks a gym from the registry. Deliberately NOT a text field for the gym
 * name: typing filters the list, and only tapping a row sets the value. That
 * is the whole point — a typo can no longer fork a gym into two boulder lists
 * and two leaderboards by being written straight through.
 *
 * A genuinely new gym goes through onAddRequest, which GymPicker's parent
 * answers with the add sheet (AddGymSheet). Same props as the GymInput it
 * replaces, plus that callback, so the four call sites barely change.
 */
export function GymPicker({
  value, onChange, placeholder, id, onCommit, onAddRequest, clearOnSelect = false,
}: {
  value: string
  onChange: (label: string) => void
  placeholder?: string
  id?: string
  onCommit?: () => void
  onAddRequest?: (typed: string) => void
  /**
   * For an "add another" control whose `value` never changes (DefaultGymsEditor):
   * empty the field after a pick instead of leaving the chosen gym sitting in
   * it. Without this the effect below never re-fires — `value` stayed `''` —
   * and the last-added gym would look like it was still selected.
   */
  clearOnSelect?: boolean
}) {
  const { data: gyms = [] } = useGymSuggestions()
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // A value set from outside (a default-gym pill, a form reset) has to show.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setQuery(value) }, [value])

  const matches = filterGyms(gyms, query)
  const typed = query.trim()
  const exact = gyms.some(g => g.label.toLowerCase() === typed.toLowerCase())

  const select = (label: string) => {
    if (blurTimer.current) clearTimeout(blurTimer.current)
    onChange(label)
    setQuery(clearOnSelect ? '' : label)
    setOpen(false)
    onCommit?.()
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay so a suggestion mousedown/click registers before we close.
          blurTimer.current = setTimeout(() => {
            setOpen(false)
            // Half-typed text must not sit in the field looking committed —
            // nothing was selected, so show what actually is selected.
            setQuery(value)
            onCommit?.()
          }, 150)
        }}
        className="w-full border rounded-lg px-3 py-2.5"
      />
      {open && (
        <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {matches.map(gym => (
            <li key={gym.id}>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()} /* keep input focus so the click lands */
                onClick={() => select(gym.label)}
                className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm hover:bg-sage-50"
              >
                <span className="flex-1">{gym.label}</span>
                {gym.climber_added && !gym.verified && (
                  <span className="rounded-full bg-khaki-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-khaki-700">
                    new
                  </span>
                )}
                {gym.label === value && <Check className="h-4 w-4 text-sage-700" />}
              </button>
            </li>
          ))}
          {onAddRequest && typed !== '' && !exact && (
            <li className="border-t border-gray-100">
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  if (blurTimer.current) clearTimeout(blurTimer.current)
                  setOpen(false)
                  onAddRequest(typed)
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-medium text-sage-700 hover:bg-sage-50"
              >
                <Plus className="h-4 w-4" />
                Can't find "{typed}"? Add it
              </button>
            </li>
          )}
          {matches.length === 0 && (typed === '' || exact || !onAddRequest) && (
            <li className="px-3 py-2 text-sm text-gray-400">No gyms yet</li>
          )}
        </ul>
      )}
    </div>
  )
}
