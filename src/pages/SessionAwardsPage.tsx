import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { GoatIcon, DonkeyIcon } from '../components/AwardIcons'
import { AWARD_TAGS, type AwardTag } from '../types'
import {
  useAwardRound, useAwardParticipants, useAwardMessages,
  usePostAwardMessage, useCrewAwardHistory,
} from '../hooks/useSessionAwards'
import { awardTally, tagTally, donkeyStreak, awardsUnlocked } from '../utils/sessionAwards'

const tagMeta = (tag: AwardTag) => AWARD_TAGS.find(t => t.key === tag)

export function SessionAwardsPage() {
  const { crewId = '', roundId = '' } = useParams<{ crewId: string; roundId: string }>()
  const { data: round, isLoading } = useAwardRound(roundId)
  const { data: participants = [] } = useAwardParticipants(roundId)
  const { data: history = [] } = useCrewAwardHistory(crewId)

  if (isLoading) return <div className="p-5 text-sm text-gray-400">Loading the verdict…</div>
  if (!round) return <div className="p-5 text-sm text-gray-400">This round no longer exists.</div>

  const unlocked = awardsUnlocked({
    participants: round.participants, voted: round.voted,
    closesAt: round.closes_at, now: new Date(),
  })

  const nameOf = (id: string) =>
    participants.find(p => p.user_id === id)?.username ?? 'Someone'

  if (!unlocked) {
    return (
      <div className="p-4 pb-32 lg:max-w-2xl lg:mx-auto">
        <h1 className="text-lg font-bold tracking-tight">Session awards</h1>
        <p className="text-sm text-gray-500 mt-1 tabular-nums">
          {round.voted} of {round.participants} have voted. The verdict unlocks when
          everyone is in, or 24h after the session.
        </p>
      </div>
    )
  }

  const goat = awardTally(round.votes ?? [], 'goat')
  const donkey = awardTally(round.votes ?? [], 'donkey')
  const tags = tagTally((round.tags ?? []).map(t => ({ subject_id: t.subject_id, tag: t.tag })))
  const notes = round.notes ?? []

  return (
    <div className="p-4 pb-32 lg:max-w-2xl lg:mx-auto space-y-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight leading-tight">Session awards</h1>
        <span className="inline-flex items-center gap-1 rounded-full bg-sage-50 text-sage-700 text-[11px] font-semibold px-2.5 py-1 mt-2">
          <Check size={12} strokeWidth={2.25} /> Votes in · {round.voted} of {round.participants}
        </span>
      </div>

      <AwardWinner
        kind="goat"
        label="GOAT of the session"
        winners={goat.winners.map(nameOf)}
        count={goat.topCount}
        total={round.participants}
        note={notes.find(n => goat.winners.includes(n.subject_id))}
        nameOf={nameOf}
      />

      <AwardWinner
        kind="donkey"
        label="Donkey of the session"
        winners={donkey.winners.map(nameOf)}
        count={donkey.topCount}
        total={round.participants}
        note={notes.find(n => donkey.winners.includes(n.subject_id))}
        nameOf={nameOf}
        streak={donkey.winners.length === 1 ? donkeyStreak(history, donkey.winners[0], new Date()) : 0}
      />

      <div>
        <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">The verdicts</h2>
        <div className="space-y-2">
          {participants.map(p => (
            <div key={p.user_id} className="bg-gray-50 rounded-2xl p-3">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-full bg-sage-100 grid place-items-center text-[13px] font-semibold text-sage-700 overflow-hidden flex-shrink-0">
                  {p.avatar_url
                    ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                    : (p.username ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="flex-1 text-sm font-semibold text-gray-800 truncate">
                  {p.username ?? 'Someone'}
                </span>
                {goat.winners.includes(p.user_id) && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-sage-600 bg-sage-50 rounded-full px-2 py-0.5">GOAT</span>
                )}
                {donkey.winners.includes(p.user_id) && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-khaki-700 bg-khaki-100 rounded-full px-2 py-0.5">Donkey</span>
                )}
              </div>

              {(tags[p.user_id] ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {(tags[p.user_id] ?? []).map(t => (
                    <span key={t.tag} className="inline-flex items-center gap-1 rounded-full bg-sage-50 text-sage-700 text-[11px] font-semibold px-2.5 py-1">
                      {tagMeta(t.tag)?.emoji} {tagMeta(t.tag)?.label}
                      <span className="text-gray-400 tabular-nums">{t.count}</span>
                    </span>
                  ))}
                </div>
              )}

              {notes.filter(n => n.subject_id === p.user_id).map(n => (
                <p key={`${n.voter_id}:${n.subject_id}`} className="text-xs text-gray-600 mt-2.5 break-words">
                  {n.body} <span className="text-gray-400">— {nameOf(n.voter_id)}</span>
                </p>
              ))}
            </div>
          ))}
        </div>
      </div>

      <SessionThread roundId={roundId} />
    </div>
  )
}

function AwardWinner({
  kind, label, winners, count, total, note, nameOf, streak = 0,
}: {
  kind: 'goat' | 'donkey'
  label: string
  winners: string[]
  count: number
  total: number
  note?: { voter_id: string; body: string }
  nameOf: (id: string) => string
  streak?: number
}) {
  if (winners.length === 0) return null
  const goat = kind === 'goat'
  return (
    <div className={goat
      ? 'bg-sage-50 border border-sage-100 rounded-2xl p-3.5'
      : 'bg-khaki-100 border border-khaki-200 rounded-2xl p-3.5'}>
      <div className="flex items-center gap-3">
        <span className={`w-11 h-11 rounded-full grid place-items-center text-white flex-shrink-0 ${goat ? 'bg-sage-700' : 'bg-khaki-600'}`}>
          {goat ? <GoatIcon size={26} /> : <DonkeyIcon size={26} />}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-[10px] font-bold uppercase tracking-wider ${goat ? 'text-sage-600' : 'text-khaki-700'}`}>
            {label}
          </p>
          <p className="text-[17px] font-extrabold tracking-tight leading-snug truncate">
            {winners.join(' & ')}
          </p>
          {winners.length > 1 && <p className="text-[11px] text-gray-500">Split verdict</p>}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`text-[15px] font-extrabold tabular-nums ${goat ? 'text-sage-700' : 'text-khaki-700'}`}>
            {count}<span className="text-[11px] font-semibold text-gray-400">/{total}</span>
          </span>
          {streak > 1 && <span className="text-[10px] font-semibold text-khaki-600">{streak} weeks running 🏅</span>}
        </div>
      </div>
      {note && (
        <div className={`mt-3 border-l-2 pl-2.5 ${goat ? 'border-sage-200' : 'border-khaki-300'}`}>
          <p className="text-[13px] leading-snug text-gray-700">{note.body}</p>
          <p className="text-[11px] text-gray-400 mt-1">— {nameOf(note.voter_id)}</p>
        </div>
      )}
    </div>
  )
}

function SessionThread({ roundId }: { roundId: string }) {
  const { data: messages = [] } = useAwardMessages(roundId)
  const post = usePostAwardMessage()
  const [text, setText] = useState('')

  const send = () => {
    const body = text.trim()
    if (!body) return
    post.mutate({ roundId, body }, {
      onSuccess: () => setText(''),
      onError: () => toast.error('Failed to send'),
    })
  }

  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">On the session</h2>
      <div className="bg-gray-50 rounded-2xl p-3 space-y-2.5">
        {messages.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-2">Nobody has said anything yet. 🔥</p>
        ) : messages.map(m => (
          <div key={m.id} className="flex items-start gap-2">
            <span className="w-6 h-6 rounded-full bg-sage-100 grid place-items-center text-[10px] font-semibold text-sage-700 overflow-hidden flex-shrink-0 mt-0.5">
              {m.avatar_url
                ? <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                : (m.username ?? '?').slice(0, 1).toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">{m.username ?? 'Someone'}</p>
              <p className="text-sm text-gray-700 break-words">{m.body}</p>
            </div>
          </div>
        ))}
        <div className="flex gap-1.5 pt-1">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Say something…"
            className="flex-1 text-sm border rounded-lg px-2.5 py-1.5"
          />
          <button
            onClick={send}
            disabled={!text.trim() || post.isPending}
            className="text-sm px-3 py-1.5 bg-sage-700 text-white rounded-lg font-medium disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
