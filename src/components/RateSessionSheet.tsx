import { useState } from 'react'
import type { ReactNode } from 'react'
import toast from 'react-hot-toast'
import { Check } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import { GoatIcon, DonkeyIcon } from './AwardIcons'
import { AWARD_TAGS } from '../types'
import {
  useAwardRound, useAwardParticipants, useCastAwardVote,
  useToggleAwardTag, useSetAwardNote,
} from '../hooks/useSessionAwards'
import { useAuth } from '../providers/AuthProvider'

export function RateSessionSheet({
  open, onClose, roundId,
}: { open: boolean; onClose: () => void; roundId: string }) {
  const { user } = useAuth()
  const { data: round } = useAwardRound(open ? roundId : null)
  const { data: participants = [] } = useAwardParticipants(open ? roundId : null)
  const castVote = useCastAwardVote()
  const toggleTag = useToggleAwardTag()
  const setNote = useSetAwardNote()
  const [editingAwards, setEditingAwards] = useState(false)

  // Wait for the round before rendering the form at all — mounting it early
  // (before `round.mine.notes` has arrived) is what let a note field open
  // empty and then blank out a saved comment on blur.
  if (!round) {
    return (
      <BottomSheet open={open} onClose={onClose} title="Rate the session">
        <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
      </BottomSheet>
    )
  }

  if (!round.am_participant) {
    return (
      <BottomSheet open={open} onClose={onClose} title="Rate the session">
        <p className="text-sm text-gray-600">
          You weren't logged in for this session, so there's no vote from you here — check back for the
          verdict once it's in, and feel free to rib whoever was.
        </p>
      </BottomSheet>
    )
  }

  const myGoat = round.mine.votes.find(v => v.kind === 'goat')?.subject_id ?? null
  const myDonkey = round.mine.votes.find(v => v.kind === 'donkey')?.subject_id ?? null
  const myTags = new Set(round.mine.tags.map(t => `${t.subject_id}:${t.tag}`))
  const others = participants.filter(p => p.user_id !== user?.id)
  const bothPicked = !!myGoat && !!myDonkey
  const showFullPickers = !bothPicked || editingAwards
  const goatPerson = participants.find(p => p.user_id === myGoat)
  const donkeyPerson = participants.find(p => p.user_id === myDonkey)

  const vote = (kind: 'goat' | 'donkey', subjectId: string) => {
    castVote.mutate({ roundId, kind, subjectId }, {
      onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not vote'),
    })
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Rate the session">
      <div className="space-y-5 pb-24">
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
              people={participants}
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
      </div>

      <div className="sticky bottom-0 -mx-5 -mb-10 bg-white border-t border-gray-100 px-5 pt-3 pb-5">
        <button
          type="button"
          onClick={() => { toast.success('Verdict posted'); onClose() }}
          disabled={!myGoat}
          className="w-full min-h-11 bg-sage-700 text-white py-3 rounded-xl font-semibold disabled:opacity-50"
        >
          Post my verdict
        </button>
        <p className="text-[11px] text-gray-400 text-center mt-2">
          Hidden until everyone has voted or 24h after voting opened.
        </p>
      </div>
    </BottomSheet>
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
