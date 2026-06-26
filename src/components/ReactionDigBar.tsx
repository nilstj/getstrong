import { useState } from 'react'
import { Heart, MessageCircle, Bookmark } from 'lucide-react'

const DIG_EMOJIS = ['🔥', '💪', '😂', '🐒', '🪨']

export function ReactionDigBar({
  likeCount,
  liked,
  onLike,
  commentCount,
  commentLabel = 'Beta',
  onComment,
  digReactions,
  onDig,
  onSave,
  saved = false,
}: {
  likeCount: number
  liked: boolean
  onLike: () => void
  commentCount: number
  commentLabel?: string
  onComment: () => void
  digReactions: { emoji: string; count: number; mine: boolean }[]
  onDig: (emoji: string) => void
  onSave?: () => void
  saved?: boolean
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  return (
    <div className="flex items-center gap-4 text-sm font-semibold text-gray-700">
      <button type="button" onClick={onLike} aria-label="Like"
        className={`inline-flex items-center gap-1 ${liked ? 'text-sage-700' : ''}`}>
        <Heart size={18} strokeWidth={2} fill={liked ? 'currentColor' : 'none'} />
        {likeCount > 0 && <span>{likeCount}</span>}
      </button>

      <button type="button" onClick={onComment} className="inline-flex items-center gap-1">
        <MessageCircle size={18} strokeWidth={2} />
        <span>{commentLabel}{commentCount > 0 ? ` ${commentCount}` : ''}</span>
      </button>

      <div className="relative">
        <button type="button" onClick={() => setPickerOpen(o => !o)}
          className="inline-flex items-center gap-1 text-gray-600">
          <span aria-hidden>🐒</span> dig
        </button>
        {pickerOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
            <div className="absolute z-20 bottom-7 left-0 flex gap-1 rounded-full bg-white shadow-lg border border-gray-200 px-2 py-1">
              {DIG_EMOJIS.map(e => (
                <button key={e} type="button"
                  onClick={() => { onDig(e); setPickerOpen(false) }}
                  className="text-lg hover:scale-125 transition-transform">{e}</button>
              ))}
            </div>
          </>
        )}
      </div>

      {digReactions.filter(r => r.count > 0).map(r => (
        <button key={r.emoji} type="button" onClick={() => { onDig(r.emoji); setPickerOpen(false) }}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
            r.mine ? 'bg-sage-100 text-sage-800' : 'bg-gray-100 text-gray-600'
          }`}>
          <span aria-hidden>{r.emoji}</span> {r.count}
        </button>
      ))}

      <span className="flex-1" />
      {onSave && (
        <button type="button" onClick={onSave} aria-label="Save" className={saved ? 'text-sage-700' : 'text-gray-500'}>
          <Bookmark size={18} strokeWidth={2} fill={saved ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>
  )
}
