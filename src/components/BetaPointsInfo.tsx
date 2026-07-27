import { useState } from 'react'
import { Info } from 'lucide-react'
import { BottomSheet } from './BottomSheet'

/** The award scheme from migration 074, in the order a climber earns them. */
const RULES: { points: number; rule: string; note: string }[] = [
  { points: 10, rule: 'Logging a shared boulder with a photo', note: 'no photo, no points' },
  { points: 5, rule: 'Posting a beta', note: 'your first beta on each boulder' },
  { points: 5, rule: 'Someone marks your beta “worked for me”', note: 'once per beta' },
  { points: 1, rule: 'Commenting on, or marking, someone else’s beta', note: 'once per beta' },
]

export function BetaPointsInfo() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="How beta points work"
        title="How beta points work"
        className="text-gray-400 hover:text-gray-600 transition-colors"
      >
        <Info size={14} strokeWidth={2} />
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="How beta points work">
        <div className="space-y-3">
          {RULES.map(r => (
            <div key={r.rule} className="flex gap-3">
              <span className="w-8 text-right text-lg font-bold text-sage-700 leading-tight">
                {r.points}
              </span>
              <div className="flex-1">
                <p className="text-sm text-gray-700">{r.rule}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{r.note}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-5 leading-relaxed">
          Points are counted per gym, per month. Once earned they are never taken away —
          if someone unmarks your beta, you keep the points.
        </p>
      </BottomSheet>
    </>
  )
}
