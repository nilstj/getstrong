import { useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Check, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { GoatIcon, DonkeyIcon } from './AwardIcons'
import { AWARD_TAGS, type AwardTag } from '../types'
import {
  useAwardRoundForGroup, useOpenAwardRound, useCastAwardVote, useToggleAwardTag,
  useSetAwardNote, useAwardMessages, usePostAwardMessage, useCrewAwardHistory,
  useAwardReactions, useToggleAwardReaction,
} from '../hooks/useSessionAwards'
import { useGroupRoster } from '../hooks/useSessionGroup'
import { useAuth } from '../providers/AuthProvider'
import { profilesByIds } from '../lib/profiles'
import { awardTally, tagTally, donkeyStreak } from '../utils/sessionAwards'

const tagMeta = (tag: AwardTag) => AWARD_TAGS.find(t => t.key === tag)

/** The emoji set for digging at a GOAT or donkey verdict. Same vocabulary as
 *  ReactionDigBar's picker, but this surface has its own reactions table and
 *  toggle shape, so it gets its own small chip UI rather than reusing that
 *  component's like/comment/save-shaped props. */
const DIG_EMOJIS = ['🔥', '💪', '😂', '🐒', '🪨']

const SECTION_HEADING = 'text-xs font-bold uppercase tracking-wide text-gray-400 mb-2'

/**
 * The GOAT/donkey session awards, inline on the session page. A round belongs
 * to the session's group, so this has three states: nobody has opened one yet,
 * one is open and taking votes, or it has unlocked into a verdict. A round
 * withholds votes/tags/notes from the client until `unlocked` -- the RPC is the
 * authority on that, not the device clock.
 */
export function SessionAwardsSection({ groupId, crewId }: { groupId: string; crewId: string | null }) {
  const { user } = useAuth()
  const { data: round } = useAwardRoundForGroup(groupId)
  const { data: groupRoster = [] } = useGroupRoster(groupId)
  const openRound = useOpenAwardRound()
  const { data: history = [] } = useCrewAwardHistory(crewId ?? '')
  const castVote = useCastAwardVote()
  const toggleTag = useToggleAwardTag()
  const setNote = useSetAwardNote()
  const [editingAwards, setEditingAwards] = useState(false)

  // Batch-resolve the round's roster -- get_award_round returns it as plain
  // ids -- into names/avatars in one query, the same way useAwardMessages and
  // useGroupRoster already do for a list of ids.
  const rosterIds = round?.roster ?? []
  const { data: profilesById } = useQuery({
    queryKey: ['award_round_roster_profiles', [...rosterIds].sort().join(',')],
    queryFn: () => profilesByIds(rosterIds),
    enabled: rosterIds.length > 0,
  })

  if (round === undefined) return null // still loading

  if (round === null) {
    // Nobody has opened a round for this group yet. open_award_round raises
    // below two climbers, so only offer the control once the session's group
    // roster (already fetched elsewhere on this page) actually has that many.
    // Below that, there is nothing the viewer can do here, so render nothing
    // rather than a heading with no control under it.
    if (groupRoster.length < 2) return null
    return (
      <div>
        <h2 className={SECTION_HEADING}>Session awards</h2>
        <button
          type="button"
          onClick={() => openRound.mutate({ groupId }, {
            onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not open awards'),
          })}
          disabled={openRound.isPending}
          className="min-h-11 w-full bg-sage-700 text-white rounded-xl text-[15px] font-semibold disabled:opacity-50"
        >
          {openRound.isPending ? 'Opening…' : 'Cast your votes'}
        </button>
      </div>
    )
  }

  const roundId = round.round_id
  const unlocked = round.unlocked

  const rosterPeople = round.roster.map(id => ({
    user_id: id,
    username: profilesById?.get(id)?.username ?? null,
    avatar_url: profilesById?.get(id)?.avatar_url ?? null,
  }))

  const nameOf = (id: string) =>
    rosterPeople.find(p => p.user_id === id)?.username ?? 'Someone'

  if (!unlocked) {
    const myGoat = round.mine.votes.find(v => v.kind === 'goat')?.subject_id ?? null
    const myDonkey = round.mine.votes.find(v => v.kind === 'donkey')?.subject_id ?? null
    const myTags = new Set(round.mine.tags.map(t => `${t.subject_id}:${t.tag}`))
    const others = rosterPeople.filter(p => p.user_id !== user?.id)
    const bothPicked = !!myGoat && !!myDonkey
    const showFullPickers = !bothPicked || editingAwards
    const goatPerson = rosterPeople.find(p => p.user_id === myGoat)
    const donkeyPerson = rosterPeople.find(p => p.user_id === myDonkey)

    const vote = (kind: 'goat' | 'donkey', subjectId: string) => {
      castVote.mutate({ roundId, kind, subjectId }, {
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not vote'),
      })
    }

    return (
      <div className="space-y-5">
        <div>
          <h2 className={SECTION_HEADING}>Session awards</h2>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-xs text-gray-500 tabular-nums">
              {round.voted} of {round.participants} voted
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-khaki-600">
              <Clock size={13} strokeWidth={2} /> closes {format(new Date(round.closes_at), 'EEE HH:mm')}
            </span>
          </div>
        </div>

        {!round.am_participant ? (
          <p className="text-sm text-gray-600">
            You weren't logged in for this session, so there's no vote from you here — check back for the
            verdict once it's in, and feel free to rib whoever was.
          </p>
        ) : (
          <>
            {showFullPickers ? (
              <>
                <AwardPicker
                  label="GOAT of the session"
                  hint="Who taught you the most. One vote."
                  icon={<GoatIcon size={17} />}
                  accent="sage"
                  people={others}
                  picked={myGoat}
                  onPick={id => vote('goat', id)}
                />

                <AwardPicker
                  label="Donkey of the session"
                  hint="Worst excuse, worst beta, worst timing. Be fair."
                  icon={<DonkeyIcon size={17} />}
                  accent="khaki"
                  people={rosterPeople}
                  picked={myDonkey}
                  onPick={id => vote('donkey', id)}
                />

                {bothPicked && (
                  <button
                    type="button"
                    onClick={() => setEditingAwards(false)}
                    className="min-h-11 text-sm font-semibold text-sage-700"
                  >
                    Done
                  </button>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2.5 bg-gray-50 rounded-2xl p-3">
                <span className="flex -space-x-2 flex-shrink-0">
                  <span className="w-8 h-8 rounded-full bg-sage-700 border-2 border-white text-white grid place-items-center overflow-hidden">
                    {goatPerson?.avatar_url
                      ? <img src={goatPerson.avatar_url} alt="" className="w-full h-full object-cover" />
                      : <GoatIcon size={16} />}
                  </span>
                  <span className="w-8 h-8 rounded-full bg-khaki-600 border-2 border-white text-white grid place-items-center overflow-hidden">
                    {donkeyPerson?.avatar_url
                      ? <img src={donkeyPerson.avatar_url} alt="" className="w-full h-full object-cover" />
                      : <DonkeyIcon size={16} />}
                  </span>
                </span>
                <p className="flex-1 min-w-0 text-sm font-semibold text-gray-800 truncate">
                  GOAT {goatPerson?.username ?? 'Someone'} · Donkey {donkeyPerson?.username ?? 'Someone'}
                </p>
                <button
                  type="button"
                  onClick={() => setEditingAwards(true)}
                  className="min-h-11 px-2 text-sm font-semibold text-sage-700 flex-shrink-0"
                >
                  Edit
                </button>
              </div>
            )}

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
                Props · tag what they did
              </h3>
              <div className="space-y-3">
                {others.map(p => (
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
                    </div>

                    <div className="flex flex-wrap gap-2 mt-2.5">
                      {AWARD_TAGS.map(t => {
                        const on = myTags.has(`${p.user_id}:${t.key}`)
                        return (
                          <button
                            key={t.key}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleTag.mutate(
                              { roundId, subjectId: p.user_id, tag: t.key },
                              { onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not tag') },
                            )}
                            className={`min-h-11 inline-flex items-center px-3 rounded-full text-[13px] font-semibold border ${
                              on
                                ? 'bg-sage-50 border-sage-300 text-sage-800'
                                : 'bg-white border-gray-200 text-gray-500'
                            }`}
                          >
                            {t.emoji} {t.label}
                          </button>
                        )
                      })}
                    </div>

                    <NoteField
                      initial={round.mine.notes.find(n => n.subject_id === p.user_id)?.body ?? ''}
                      onSave={body => setNote.mutate(
                        { roundId, subjectId: p.user_id, body },
                        { onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not save') },
                      )}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  const goat = awardTally(round.votes ?? [], 'goat')
  const donkey = awardTally(round.votes ?? [], 'donkey')
  const tags = tagTally((round.tags ?? []).map(t => ({ subject_id: t.subject_id, tag: t.tag })))
  const notes = round.notes ?? []
  const nobodyVoted = goat.winners.length === 0 && donkey.winners.length === 0

  return (
    <div className="space-y-5">
      <div>
        <h2 className={SECTION_HEADING}>Session awards</h2>
        {round.voted > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-sage-50 text-sage-700 text-[11px] font-semibold px-2.5 py-1">
            <Check size={12} strokeWidth={2.25} /> Votes in · {round.voted} of {round.participants}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-500 text-[11px] font-semibold px-2.5 py-1">
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
        <h2 className={SECTION_HEADING}>The verdicts</h2>
        <div className="space-y-2">
          {rosterPeople.map(p => (
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
      <h2 className={SECTION_HEADING}>On the session</h2>
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

function AwardPicker({
  label, hint, icon, accent, people, picked, onPick,
}: {
  label: string
  hint: string
  icon: ReactNode
  accent: 'sage' | 'khaki'
  people: { user_id: string; username: string | null; avatar_url: string | null }[]
  picked: string | null
  onPick: (id: string) => void
}) {
  const badge = accent === 'sage' ? 'bg-sage-700' : 'bg-khaki-600'
  const ring = accent === 'sage' ? 'ring-sage-700' : 'ring-khaki-600'
  const avatar = accent === 'sage' ? 'bg-sage-100 text-sage-700' : 'bg-khaki-100 text-khaki-700'
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className={`w-[26px] h-[26px] rounded-full ${badge} text-white grid place-items-center flex-shrink-0`}>
          {icon}
        </span>
        <h3 className="text-sm font-bold">{label}</h3>
      </div>
      <p className="text-xs text-gray-400 ml-[34px] mb-3">{hint}</p>
      <div className="flex flex-wrap gap-x-2.5 gap-y-3">
        {people.map(p => (
          <button
            key={p.user_id}
            type="button"
            onClick={() => onPick(p.user_id)}
            aria-pressed={picked === p.user_id}
            className="w-[64px] flex flex-col items-center gap-1.5"
          >
            <span className={`relative w-[52px] h-[52px] rounded-full ${avatar} grid place-items-center text-lg font-semibold overflow-hidden ${
              picked === p.user_id ? `ring-2 ring-offset-2 ${ring}` : ''
            }`}>
              {p.avatar_url
                ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                : (p.username ?? '?').slice(0, 1).toUpperCase()}
              {picked === p.user_id && (
                <span className={`absolute -right-0.5 -bottom-0.5 w-5 h-5 rounded-full ${badge} border-2 border-white text-white grid place-items-center`}>
                  <Check size={11} strokeWidth={3.5} />
                </span>
              )}
            </span>
            <span className={`text-[11px] font-semibold truncate max-w-full ${
              picked === p.user_id ? 'text-gray-800' : 'text-gray-400'
            }`}>
              {p.username ?? 'Someone'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** A comment on one climber, saved on blur. Signed — the crew sees who wrote it. */
function NoteField({ initial, onSave }: { initial: string; onSave: (body: string) => void }) {
  const [text, setText] = useState(initial)
  return (
    <div className="mt-2.5">
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={() => { if (text.trim() !== initial.trim()) onSave(text.trim()) }}
        rows={2}
        placeholder="Say something…"
        className="w-full text-sm border rounded-lg px-3 py-2.5 resize-none"
      />
      <p className="text-[11px] text-gray-400 mt-1">
        Posted with your name — the crew sees who said it.
      </p>
    </div>
  )
}
