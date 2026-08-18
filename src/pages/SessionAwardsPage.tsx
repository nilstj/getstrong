import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { GoatIcon, DonkeyIcon } from '../components/AwardIcons'
import { AWARD_TAGS, type AwardTag } from '../types'
import {
  useAwardRound, useAwardParticipants, useAwardMessages,
  usePostAwardMessage, useCrewAwardHistory, useAwardReactions, useToggleAwardReaction,
} from '../hooks/useSessionAwards'
import { awardTally, tagTally, donkeyStreak } from '../utils/sessionAwards'

const tagMeta = (tag: AwardTag) => AWARD_TAGS.find(t => t.key === tag)

/** The emoji set for digging at a GOAT or donkey verdict. Same vocabulary as
 *  ReactionDigBar's picker, but this surface has its own reactions table and
 *  toggle shape, so it gets its own small chip UI rather than reusing that
 *  component's like/comment/save-shaped props. */
const DIG_EMOJIS = ['🔥', '💪', '😂', '🐒', '🪨']

export function SessionAwardsPage() {
  const { crewId = '', roundId = '' } = useParams<{ crewId: string; roundId: string }>()
  const { data: round, isLoading: roundLoading } = useAwardRound(roundId)
  const { data: participants = [], isLoading: participantsLoading } = useAwardParticipants(roundId)
  const { data: history = [] } = useCrewAwardHistory(crewId)

  const backLink = (
    <Link to={`/crews/${crewId}`} aria-label="Back" className="text-gray-400 hover:text-gray-700 inline-block mb-3">
      <ArrowLeft size={20} />
    </Link>
  )

  if (roundLoading || participantsLoading) {
    return (
      <div className="p-4 pb-32 lg:max-w-2xl lg:mx-auto">
        {backLink}
        <div className="text-sm text-gray-400">Loading the verdict…</div>
      </div>
    )
  }
  if (!round) {
    return (
      <div className="p-4 pb-32 lg:max-w-2xl lg:mx-auto">
        {backLink}
        <div className="text-sm text-gray-400">This round no longer exists.</div>
      </div>
    )
  }

  // The RPC is the authority on unlock, not the device clock — a fast phone
  // must not render tags/notes/votes as if they'd arrived when the payload
  // was actually withheld.
  const unlocked = round.unlocked

  const nameOf = (id: string) =>
    participants.find(p => p.user_id === id)?.username ?? 'Someone'

  if (!unlocked) {
    return (
      <div className="p-4 pb-32 lg:max-w-2xl lg:mx-auto">
        {backLink}
        <h1 className="text-lg font-bold tracking-tight">Session awards</h1>
        <p className="text-sm text-gray-500 mt-1 tabular-nums">
          {round.voted} of {round.participants} have voted. The verdict unlocks when
          everyone is in, or 24h after voting opened.
        </p>
      </div>
    )
  }

  const goat = awardTally(round.votes ?? [], 'goat')
  const donkey = awardTally(round.votes ?? [], 'donkey')
  const tags = tagTally((round.tags ?? []).map(t => ({ subject_id: t.subject_id, tag: t.tag })))
  const notes = round.notes ?? []
  const nobodyVoted = goat.winners.length === 0 && donkey.winners.length === 0

  return (
    <div className="p-4 pb-32 lg:max-w-2xl lg:mx-auto space-y-5">
      {backLink}
      <div>
        <h1 className="text-lg font-bold tracking-tight leading-tight">Session awards</h1>
        {round.voted > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-sage-50 text-sage-700 text-[11px] font-semibold px-2.5 py-1 mt-2">
            <Check size={12} strokeWidth={2.25} /> Votes in · {round.voted} of {round.participants}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-500 text-[11px] font-semibold px-2.5 py-1 mt-2">
            Time ran out before anyone voted
          </span>
        )}
      </div>

      {nobodyVoted && (
        <p className="text-sm text-gray-400">
          Nobody voted this time — the awards go unclaimed. Bold strategy.
        </p>
      )}

      <AwardWinner
        kind="goat"
        label="GOAT of the session"
        winners={goat.winners.map(nameOf)}
        count={goat.topCount}
        total={round.participants}
        note={goat.winners.length === 1 ? notes.find(n => n.subject_id === goat.winners[0]) : undefined}
        nameOf={nameOf}
        roundId={roundId}
      />

      <AwardWinner
        kind="donkey"
        label="Donkey of the session"
        winners={donkey.winners.map(nameOf)}
        count={donkey.topCount}
        total={round.participants}
        note={donkey.winners.length === 1 ? notes.find(n => n.subject_id === donkey.winners[0]) : undefined}
        nameOf={nameOf}
        roundId={roundId}
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
  kind, label, winners, count, total, note, nameOf, roundId, streak = 0,
}: {
  kind: 'goat' | 'donkey'
  label: string
  winners: string[]
  count: number
  total: number
  note?: { voter_id: string; body: string }
  nameOf: (id: string) => string
  roundId: string
  streak?: number
}) {
  if (winners.length === 0) return null
  const goat = kind === 'goat'
  const split = winners.length > 1
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
          {split && <p className="text-[11px] text-gray-500">Split verdict</p>}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {split ? (
            <span className={`text-[15px] font-extrabold tabular-nums ${goat ? 'text-sage-700' : 'text-khaki-700'}`}>
              {count} each
            </span>
          ) : (
            <span className={`text-[15px] font-extrabold tabular-nums ${goat ? 'text-sage-700' : 'text-khaki-700'}`}>
              {count}<span className="text-[11px] font-semibold text-gray-400">/{total}</span>
            </span>
          )}
          {streak > 1 && <span className="text-[10px] font-semibold text-khaki-600">{streak} weeks running 🏅</span>}
        </div>
      </div>
      {note && (
        <div className={`mt-3 border-l-2 pl-2.5 ${goat ? 'border-sage-200' : 'border-khaki-300'}`}>
          <p className="text-[13px] leading-snug text-gray-700">{note.body}</p>
          <p className="text-[11px] text-gray-400 mt-1">— {nameOf(note.voter_id)}</p>
        </div>
      )}
      <AwardDigChips roundId={roundId} kind={kind} />
    </div>
  )
}

/** Dig chips on a GOAT/donkey verdict card. Same visual vocabulary and emoji
 *  set as ReactionDigBar (rounded-full pill, sage when it's yours), but its
 *  own component: ReactionDigBar's props are shaped for a like/comment/save
 *  post, not a two-way toggle on a round's verdict. */
function AwardDigChips({ roundId, kind }: { roundId: string; kind: 'goat' | 'donkey' }) {
  const { data } = useAwardReactions(roundId)
  const toggle = useToggleAwardReaction()
  const [pickerOpen, setPickerOpen] = useState(false)
  const reactions = data?.[kind] ?? []

  const dig = (emoji: string) => {
    toggle.mutate({ roundId, kind, emoji }, {
      onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not dig'),
    })
    setPickerOpen(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-3">
      {reactions.map(r => (
        <button
          key={r.emoji}
          type="button"
          aria-pressed={r.mine}
          onClick={() => dig(r.emoji)}
          className={`min-h-11 inline-flex items-center gap-1 rounded-full px-3 text-xs font-semibold ${
            r.mine ? 'bg-sage-200 text-sage-800' : 'bg-white/70 text-gray-600'
          }`}
        >
          <span aria-hidden>{r.emoji}</span> {r.count}
        </button>
      ))}
      <div className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen(o => !o)}
          aria-label="Add a dig"
          className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-full bg-white/70 text-gray-500 text-sm px-3"
        >
          +
        </button>
        {pickerOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
            <div className="absolute z-20 bottom-full mb-1 left-0 flex gap-1 rounded-full bg-white shadow-lg border border-gray-200 px-2 py-1">
              {DIG_EMOJIS.map(e => (
                <button key={e} type="button" onClick={() => dig(e)} className="text-lg hover:scale-125 transition-transform">
                  {e}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
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
            aria-label="Say something about the session"
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
