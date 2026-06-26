import { Play, Check } from 'lucide-react'
import type { BoulderBeta } from '../types'

export function BetaCard({
  beta,
  authorName,
  authorAvatarUrl,
  helpedLabel,
  onToggleWorked,
  best = false,
}: {
  beta: BoulderBeta
  authorName: string
  authorAvatarUrl?: string | null
  helpedLabel?: string
  onToggleWorked: () => void
  best?: boolean
}) {
  return (
    <div className={`flex gap-3 rounded-2xl bg-white p-3 border ${
      best ? 'border-sage-500 ring-1 ring-sage-500' : 'border-gray-200'
    }`}>
      {beta.video_url ? (
        <a href={beta.video_url} target="_blank" rel="noopener noreferrer"
          className="relative w-12 h-12 rounded-xl bg-gray-800 flex-shrink-0 grid place-items-center">
          <Play size={18} className="text-white" fill="currentColor" />
        </a>
      ) : (
        <span className="w-12 h-12 rounded-xl bg-cover bg-center bg-sage-100 flex-shrink-0"
          style={authorAvatarUrl ? { backgroundImage: `url(${authorAvatarUrl})` } : undefined} />
      )}

      <div className="min-w-0 flex-1">
        {beta.body && <p className="text-sm font-medium leading-snug text-gray-800">{beta.body}</p>}
        <p className="mt-1 text-xs text-gray-500">
          {authorName}
          {beta.worked_count > 0 && (
            <span className="text-sage-700 font-semibold"> · ✓ worked for {beta.worked_count}</span>
          )}
          {helpedLabel && <span className="text-gray-400"> · {helpedLabel}</span>}
        </p>
      </div>

      <button type="button" onClick={onToggleWorked}
        className={`self-start inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
          beta.worked_by_me
            ? 'bg-sage-700 text-white'
            : 'bg-sage-50 text-sage-800 border border-sage-200'
        }`}>
        <Check size={13} strokeWidth={3} /> {beta.worked_by_me ? 'Worked' : 'Worked?'}
      </button>
    </div>
  )
}
