import { useState } from 'react'
import { SmilePlus } from 'lucide-react'
import type { ReactionAgg } from '../hooks/useBoulderBeta'

const PALETTE = ['🔥', '💪', '👍', '😂', '🙌', '🧗']

export function EmojiReactions({
  reactions,
  onToggle,
}: {
  reactions: ReactionAgg[]
  onToggle: (emoji: string, mine: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {reactions.map(r => (
        <button key={r.emoji} type="button" onClick={() => onToggle(r.emoji, r.mine)}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
            r.mine ? 'bg-sage-100 text-sage-800 ring-1 ring-sage-300' : 'bg-gray-100 text-gray-600'
          }`}>
          <span aria-hidden>{r.emoji}</span> {r.count}
        </button>
      ))}
      <div className="relative">
        <button type="button" onClick={() => setOpen(o => !o)} aria-label="Add reaction"
          className="inline-flex items-center rounded-full p-1 text-gray-400 hover:text-sage-700">
          <SmilePlus size={15} />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute z-20 bottom-7 left-0 flex gap-1 rounded-full bg-white shadow-lg border border-gray-200 px-2 py-1">
              {PALETTE.map(e => (
                <button key={e} type="button"
                  onClick={() => { onToggle(e, reactions.find(r => r.emoji === e)?.mine ?? false); setOpen(false) }}
                  className="text-lg hover:scale-125 transition-transform">{e}</button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
