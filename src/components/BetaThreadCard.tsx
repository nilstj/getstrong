import { useState } from 'react'
import { Play, Send, Trash2, Star } from 'lucide-react'
import { EmojiReactions } from './EmojiReactions'
import { SetterBadge } from './SetterBadge'
import type { BetaThread } from '../hooks/useBoulderBeta'
import type { BetaSection, BetaBodyType } from '../types'

const SECTION_LABEL: Record<BetaSection, string> = { start: 'Start', crux: 'Crux', top: 'Top-out' }
const BODY_LABEL: Record<BetaBodyType, string> = { tall: 'for tall', short: 'for short', neutral: 'any height' }

function Avatar({ url, name }: { url: string | null; name: string | null }) {
  return url
    ? <span className="w-7 h-7 rounded-full bg-cover bg-center flex-shrink-0" style={{ backgroundImage: `url(${url})` }} />
    : <span className="w-7 h-7 rounded-full bg-sage-100 grid place-items-center text-[11px] font-semibold text-sage-700 flex-shrink-0">{(name ?? '?').slice(0, 1).toUpperCase()}</span>
}

export function BetaThreadCard({
  thread,
  best,
  currentUserId,
  onToggleWorked,
  onReactBeta,
  onAddReply,
  onDeleteReply,
  onReactReply,
}: {
  thread: BetaThread
  best: boolean
  currentUserId?: string
  onToggleWorked: () => void
  onReactBeta: (emoji: string, mine: boolean) => void
  onAddReply: (body: string) => void
  onDeleteReply: (commentId: string) => void
  onReactReply: (commentId: string, emoji: string, mine: boolean) => void
}) {
  const [reply, setReply] = useState('')
  const submitReply = () => {
    const body = reply.trim()
    if (!body) return
    onAddReply(body)
    setReply('')
  }

  return (
    <div className={`rounded-2xl bg-white p-3 border ${best ? 'border-sage-500 ring-1 ring-sage-500' : 'border-gray-200'}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Avatar url={thread.authorAvatarUrl} name={thread.authorName} />
        <span className="text-sm font-semibold">{thread.authorName ?? 'Someone'}</span>
        <SetterBadge userId={thread.user_id} />
        {best && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-sage-700 text-white px-2 py-0.5 text-[10px] font-bold">
            <Star size={10} fill="currentColor" /> Top beta
          </span>
        )}
        <span className="flex-1" />
        {thread.section && <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">{SECTION_LABEL[thread.section]}</span>}
        {thread.body_type && <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">{BODY_LABEL[thread.body_type]}</span>}
      </div>

      {thread.video_url && (
        <a href={thread.video_url} target="_blank" rel="noopener noreferrer"
          className="relative flex items-center justify-center gap-2 h-24 rounded-xl bg-gray-800 text-white text-sm font-semibold mb-2">
          <Play size={20} fill="currentColor" /> Watch beta video
        </a>
      )}

      {thread.body && <p className="text-sm leading-snug text-gray-800">{thread.body}</p>}

      <div className="mt-2 flex items-center gap-3">
        <button type="button" onClick={onToggleWorked}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
            thread.worked_by_me ? 'bg-sage-700 text-white' : 'bg-sage-50 text-sage-800 border border-sage-200'
          }`}>
          ✓ {thread.worked_by_me ? 'Worked for you' : 'Worked for me'}
          {thread.worked_count > 0 && <span className="opacity-80">· {thread.worked_count}</span>}
        </button>
        <EmojiReactions reactions={thread.reactions} onToggle={onReactBeta} />
      </div>

      {/* Replies */}
      {thread.replies.length > 0 && (
        <div className="mt-2.5 space-y-2 border-t border-gray-100 pt-2.5">
          {thread.replies.map(r => (
            <div key={r.id} className="flex items-start gap-2">
              <Avatar url={r.authorAvatarUrl} name={r.authorName} />
              <div className="min-w-0 flex-1">
                <p className="text-sm"><span className="font-semibold">{r.authorName ?? 'Someone'}</span> <SetterBadge userId={r.user_id} className="align-text-bottom" /> <span className="text-gray-700">{r.body}</span></p>
                <EmojiReactions reactions={r.reactions} onToggle={(emoji, mine) => onReactReply(r.id, emoji, mine)} />
              </div>
              {r.user_id === currentUserId && (
                <button type="button" aria-label="Delete reply" onClick={() => onDeleteReply(r.id)}
                  className="text-gray-300 hover:text-red-500 mt-0.5"><Trash2 size={13} /></button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <input value={reply} onChange={e => setReply(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submitReply() }}
          placeholder="Reply…"
          className="flex-1 rounded-full bg-gray-100 px-3 py-1.5 text-sm focus:outline-none placeholder:text-gray-400" />
        <button type="button" onClick={submitReply} disabled={!reply.trim()} aria-label="Send reply"
          className="text-sage-700 disabled:opacity-40"><Send size={16} /></button>
      </div>
    </div>
  )
}
