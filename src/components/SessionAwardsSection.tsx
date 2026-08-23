import { useState } from 'react'
import type { ReactNode } from 'react'
import toast from 'react-hot-toast'
import { Check, Clock, ChevronDown, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { GoatIcon } from './AwardIcons'
import { AWARD_TAGS, type AwardTag } from '../types'
import {
  useAwardRoundForGroup, useOpenAwardRound, useCastAwardVote, useToggleAwardTag,
  useSetAwardNote, useAwardMessages, usePostAwardMessage,
  useAwardReactions, useToggleAwardReaction,
} from '../hooks/useSessionAwards'
import { useGroupRoster } from '../hooks/useSessionGroup'
import { useAuth } from '../providers/AuthProvider'
import { awardTally, tagTally, awardsStartCollapsed, awardsSummary } from '../utils/sessionAwards'
import type { AwardsSummary } from '../utils/sessionAwards'
import { errorMessage } from '../utils/errors'

const tagMeta = (tag: AwardTag) => AWARD_TAGS.find(t => t.key === tag)

/** The emoji set for digging at a GOAT verdict. Same vocabulary as
 *  ReactionDigBar's picker, but this surface has its own reactions table and
 *  toggle shape, so it gets its own small chip UI rather than reusing that
 *  component's like/comment/save-shaped props. */
const DIG_EMOJIS = ['🔥', '💪', '😂', '🐒', '🪨']

const SECTION_HEADING = 'text-xs font-bold uppercase tracking-wide text-gray-400 mb-2'

/**
 * The GOAT session awards, inline on the session page. A round belongs
 * to the session's group, so this has three states: nobody has opened one yet,
 * one is open and taking votes, or it has unlocked into a verdict. A round
 * withholds votes/tags/notes from the client until `unlocked` -- the RPC is the
 * authority on that, not the device clock.
 *
 * Expanded, this section ran to roughly a thousand pixels and pushed the
 * session's Problems list two screens down, so it collapses to a one-line bar
 * everywhere except the one state that earns the height: your own vote still
 * missing, with a 24h clock running. See awardsStartCollapsed.
 */
export function SessionAwardsSection({ groupId }: { groupId: string }) {
  const { user } = useAuth()
  const { data: round, isError } = useAwardRoundForGroup(groupId)
  const { data: groupRoster = [] } = useGroupRoster(groupId)
  const openRound = useOpenAwardRound()
  const castVote = useCastAwardVote()
  const [editingAwards, setEditingAwards] = useState(false)
  // null until the viewer explicitly toggles the section; the latched default
  // applies until then, and their own choice wins forever after.
  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(null)
  const [latchedDefaultCollapsed, setLatchedDefaultCollapsed] = useState<boolean | null>(null)
  // One climber's props open at a time. Eight 44px tag chips wrapping to three
  // rows plus a comment box, per climber, was the single biggest thing making
  // this section taller than the page.
  const [openPropsFor, setOpenPropsFor] = useState<string | null>(null)

  if (round === undefined) {
    // Loading and failure look the same to this query; only the second is worth
    // saying out loud, otherwise the whole section silently vanishes.
    if (!isError) return null
    return (
      <div>
        <h2 className="text-base font-semibold">Session awards</h2>
        <p className="text-sm text-gray-500">Couldn't load the awards for this session.</p>
      </div>
    )
  }

  if (round === null) {
    // Nobody has opened a round for this group yet. open_award_round raises
    // below two climbers, so only offer the control once the session's group
    // roster (already fetched elsewhere on this page) actually has that many.
    // Below that, there is nothing the viewer can do here, so render nothing
    // rather than a heading with no control under it.
    if (groupRoster.length < 2) return null
    return (
      <div>
        <h2 className="text-base font-semibold">Session awards</h2>
        <p className="text-[13px] text-gray-500 mt-1 mb-2.5 leading-relaxed">
          A GOAT vote and one line on each climber. Everyone in this session votes, and the
          verdict stays hidden until they all have — or 24h after voting opens.
        </p>
        <button
          type="button"
          onClick={() => openRound.mutate({ groupId }, {
            onError: (e: unknown) => toast.error(errorMessage(e, 'Could not open awards')),
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

  // get_award_round returns the roster as plain ids. useGroupRoster covers the
  // same id set (both are "sessions with this group_id"), and this page's roster
  // section mounts it under the same key on the same render, so the names come
  // off that one query rather than a second profile fetch chained behind this
  // one -- which is what used to guarantee a paint of "Someone" for everybody.
  const rosterPeople = round.roster.map(id => {
    const member = groupRoster.find(m => m.user_id === id)
    return {
      user_id: id,
      username: member?.username ?? null,
      avatar_url: member?.avatar_url ?? null,
    }
  })

  const nameOf = (id: string) =>
    rosterPeople.find(p => p.user_id === id)?.username ?? 'Someone'

  // The collapsed bar shows the verdict, so the tallies are needed before the
  // expanded/collapsed split. `votes` is absent until unlocked and
  // awardTally([]) yields no winners, so this is correct in both states.
  const goat = awardTally(round.votes ?? [])

  // Latched once rather than derived every render: get_award_round refetches
  // after every vote, so a derived default would slam the section shut the
  // instant you cast your second vote -- mid-interaction, with the props you
  // came to give still untouched. Same technique and reason as
  // SessionBoulderList's latch.
  const defaultCollapsed = awardsStartCollapsed({
    unlocked,
    amParticipant: round.am_participant,
    myVotesCast: round.mine.votes.length,
  })
  if (latchedDefaultCollapsed === null) setLatchedDefaultCollapsed(defaultCollapsed)
  const collapsed = userCollapsed ?? latchedDefaultCollapsed ?? defaultCollapsed

  const summary = awardsSummary({
    unlocked,
    amParticipant: round.am_participant,
    myVotesCast: round.mine.votes.length,
    voted: round.voted,
    participants: round.participants,
    goatWinners: goat.winners.map(nameOf),
  })

  const myGoat = round.mine.votes.find(v => v.kind === 'goat')?.subject_id ?? null
  const myTags = new Set(round.mine.tags.map(t => `${t.subject_id}:${t.tag}`))
  const others = rosterPeople.filter(p => p.user_id !== user?.id)
  const showFullPickers = !myGoat || editingAwards
  const goatPerson = rosterPeople.find(p => p.user_id === myGoat)

  const vote = (subjectId: string) => {
    castVote.mutate({ roundId, groupId, subjectId }, {
      onError: (e: unknown) => toast.error(errorMessage(e, 'Could not vote')),
    })
  }

  const tags = tagTally((round.tags ?? []).map(t => ({ subject_id: t.subject_id, tag: t.tag })))
  const notes = round.notes ?? []
  const nobodyVoted = goat.winners.length === 0

  return (
    <div>
      {/* The heading wraps the button rather than the reverse: <h2> takes
          phrasing content, so a <button> inside it is valid while an <h2>
          inside a <button> is not -- and this keeps the section reachable by
          heading navigation in both states. Matches SessionBoulderList. */}
      <h2>
        <button
          type="button"
          onClick={() => setUserCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          className="flex w-full min-h-11 flex-wrap items-center justify-between gap-x-2 gap-y-0.5"
        >
          <span className="flex items-center gap-1.5">
            {collapsed ? <ChevronRight size={16} strokeWidth={2.25} /> : <ChevronDown size={16} strokeWidth={2.25} />}
            <span className="text-base font-semibold">Session awards</span>
          </span>
          <AwardsSummaryChip summary={summary} closesAt={round.closes_at} />
        </button>
      </h2>

      {!collapsed && !unlocked && (
        <div className="space-y-5 mt-1">
          {/* Who is still holding it up. A name, not a bare avatar: there is no
              hover on a phone, so a tooltip would say nothing. The count and
              the deadline live on the collapsed bar above, not repeated here. */}
          <ul className="flex flex-wrap gap-1.5">
            {rosterPeople.map(p => {
              const done = round.voters.includes(p.user_id)
              return (
                <li
                  key={p.user_id}
                  className={`inline-flex items-center gap-1 rounded-full pl-1 pr-2.5 py-1 text-[11px] font-semibold ${
                    done ? 'bg-sage-50 text-sage-700' : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full grid place-items-center overflow-hidden text-[9px] flex-shrink-0 ${
                    done ? 'bg-sage-200 text-sage-800' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {p.avatar_url
                      ? <img src={p.avatar_url} alt="" className={`w-full h-full object-cover ${done ? '' : 'opacity-60'}`} />
                      : (p.username ?? '?').slice(0, 1).toUpperCase()}
                  </span>
                  {p.username ?? 'Someone'}
                  {done && <Check size={10} strokeWidth={3} />}
                  <span className="sr-only">{done ? 'has voted' : 'has not voted yet'}</span>
                </li>
              )
            })}
          </ul>

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
                    people={others}
                    picked={myGoat}
                    onPick={vote}
                  />

                  {myGoat && (
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
                  <span className="w-8 h-8 rounded-full bg-sage-700 text-white grid place-items-center overflow-hidden flex-shrink-0">
                    {goatPerson?.avatar_url
                      ? <img src={goatPerson.avatar_url} alt="" className="w-full h-full object-cover" />
                      : <GoatIcon size={16} />}
                  </span>
                  <p className="flex-1 min-w-0 text-sm font-semibold text-gray-800 truncate">
                    GOAT {goatPerson?.username ?? 'Someone'}
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
                <h3 className={SECTION_HEADING}>Props · tag what they did</h3>
                {/* One climber open at a time. The row states what you have
                    already given them, so the accordion never hides the fact
                    that you did something. */}
                <div className="space-y-2">
                  {others.map(p => {
                    const myPropCount = round.mine.tags.filter(t => t.subject_id === p.user_id).length
                    const myNote = round.mine.notes.find(n => n.subject_id === p.user_id)?.body ?? ''
                    const open = openPropsFor === p.user_id
                    return (
                      <div key={p.user_id} className="bg-gray-50 rounded-2xl">
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => setOpenPropsFor(open ? null : p.user_id)}
                          className="flex w-full min-h-11 items-center gap-2.5 p-3 text-left"
                        >
                          <span className="w-8 h-8 rounded-full bg-sage-100 grid place-items-center text-[13px] font-semibold text-sage-700 overflow-hidden flex-shrink-0">
                            {p.avatar_url
                              ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                              : (p.username ?? '?').slice(0, 1).toUpperCase()}
                          </span>
                          <span className="flex-1 min-w-0 text-sm font-semibold text-gray-800 truncate">
                            {p.username ?? 'Someone'}
                          </span>
                          <span className={`text-[11px] font-semibold flex-shrink-0 ${
                            myPropCount > 0 || myNote ? 'text-sage-700' : 'text-gray-400'
                          }`}>
                            {myPropCount > 0
                              ? `${myPropCount} prop${myPropCount > 1 ? 's' : ''}`
                              : 'Add props'}
                            {myNote && ' · commented'}
                          </span>
                          {open
                            ? <ChevronDown size={16} strokeWidth={2.25} className="text-gray-400 flex-shrink-0" />
                            : <ChevronRight size={16} strokeWidth={2.25} className="text-gray-400 flex-shrink-0" />}
                        </button>

                        {open && (
                          <div className="px-3 pb-3">
                            <PropsPanel
                              roundId={roundId}
                              groupId={groupId}
                              subjectId={p.user_id}
                              myTags={myTags}
                              myNote={myNote}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {!collapsed && unlocked && (
        <div className="space-y-5 mt-1">
          {nobodyVoted && (
            <p className="text-sm text-gray-400">
              Nobody voted this time — the GOAT goes unclaimed. Bold strategy.
            </p>
          )}

          <AwardWinner
            label="GOAT of the session"
            winners={goat.winners.map(nameOf)}
            count={goat.topCount}
            total={round.participants}
            note={goat.winners.length === 1 ? notes.find(n => n.subject_id === goat.winners[0]) : undefined}
            nameOf={nameOf}
            roundId={roundId}
          />

          <div>
            <h3 className={SECTION_HEADING}>The verdicts</h3>
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

                  {/* The verdict settling does not close the props. Voting has a
                      deadline because the result has to settle; recognition does
                      not, and a 🧠 Best beta remembered the next morning is
                      still worth giving. Not on your own card -- a tag on
                      yourself is refused by crew_award_tags_not_self. */}
                  {round.am_participant && p.user_id !== user?.id && (() => {
                    const open = openPropsFor === p.user_id
                    const myPropCount = round.mine.tags.filter(t => t.subject_id === p.user_id).length
                    const myNote = round.mine.notes.find(n => n.subject_id === p.user_id)?.body ?? ''
                    return (
                      <div className="mt-2.5 border-t border-gray-200 pt-1">
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => setOpenPropsFor(open ? null : p.user_id)}
                          className="flex w-full min-h-11 items-center gap-1 text-left"
                        >
                          <span className={`flex-1 text-[11px] font-semibold ${
                            myPropCount > 0 || myNote ? 'text-sage-700' : 'text-gray-400'
                          }`}>
                            {myPropCount > 0
                              ? `You gave ${myPropCount} prop${myPropCount > 1 ? 's' : ''}`
                              : 'Give props'}
                            {myNote && ' · commented'}
                          </span>
                          {open
                            ? <ChevronDown size={15} strokeWidth={2.25} className="text-gray-400" />
                            : <ChevronRight size={15} strokeWidth={2.25} className="text-gray-400" />}
                        </button>
                        {open && (
                          <PropsPanel
                            roundId={roundId}
                            groupId={groupId}
                            subjectId={p.user_id}
                            myTags={myTags}
                            myNote={myNote}
                          />
                        )}
                      </div>
                    )
                  })()}
                </div>
              ))}
            </div>
          </div>

          <SessionThread roundId={roundId} />
        </div>
      )}
    </div>
  )
}

/** What the collapsed bar says on its right-hand side. The verdict is the whole
 *  payoff and fits on one line, so an unlocked round needs no expanding at all. */
function AwardsSummaryChip({ summary, closesAt }: { summary: AwardsSummary; closesAt: string }) {
  if (summary.kind === 'verdict') {
    if (summary.goat.length === 0) {
      return <span className="text-xs font-semibold text-gray-400">No verdict</span>
    }
    return (
      <span className="flex min-w-0 items-center gap-1 text-xs font-semibold text-gray-700">
        <GoatIcon size={13} />
        <span className="truncate">{summary.goat.join(' & ')}</span>
      </span>
    )
  }

  const closes = `closes ${format(new Date(closesAt), 'EEE HH:mm')}`
  if (summary.kind === 'nudge') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-khaki-700">
        <Clock size={12} strokeWidth={2.25} /> Your vote is missing · {closes}
      </span>
    )
  }
  return (
    <span className="text-xs font-semibold text-gray-400 tabular-nums">
      {summary.voted} of {summary.participants} voted · {closes}
    </span>
  )
}

function AwardWinner({
  label, winners, count, total, note, nameOf, roundId,
}: {
  label: string
  winners: string[]
  count: number
  total: number
  note?: { voter_id: string; body: string }
  nameOf: (id: string) => string
  roundId: string
}) {
  if (winners.length === 0) return null
  const split = winners.length > 1
  return (
    <div className="bg-sage-50 border border-sage-100 rounded-2xl p-3.5">
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-full bg-sage-700 grid place-items-center text-white flex-shrink-0">
          <GoatIcon size={26} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-sage-600">{label}</p>
          <p className="text-[17px] font-extrabold tracking-tight leading-snug truncate">
            {winners.join(' & ')}
          </p>
          {split && <p className="text-[11px] text-gray-500">Split verdict</p>}
        </div>
        <span className="text-[15px] font-extrabold tabular-nums text-sage-700 flex-shrink-0">
          {split ? `${count} each` : (
            <>{count}<span className="text-[11px] font-semibold text-gray-400">/{total}</span></>
          )}
        </span>
      </div>
      {note && (
        <div className="mt-3 border-l-2 border-sage-200 pl-2.5">
          <p className="text-[13px] leading-snug text-gray-700">{note.body}</p>
          <p className="text-[11px] text-gray-400 mt-1">— {nameOf(note.voter_id)}</p>
        </div>
      )}
      <AwardDigChips roundId={roundId} />
    </div>
  )
}

/** Dig chips on the GOAT verdict card. Same visual vocabulary and emoji
 *  set as ReactionDigBar (rounded-full pill, sage when it's yours), but its
 *  own component: ReactionDigBar's props are shaped for a like/comment/save
 *  post, not a two-way toggle on a round's verdict. */
function AwardDigChips({ roundId }: { roundId: string }) {
  const { data: reactions = [] } = useAwardReactions(roundId)
  const toggle = useToggleAwardReaction()
  const [pickerOpen, setPickerOpen] = useState(false)

  const dig = (emoji: string) => {
    toggle.mutate({ roundId, emoji }, {
      onError: (e: unknown) => toast.error(errorMessage(e, 'Could not dig')),
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
                <button
                  key={e}
                  type="button"
                  onClick={() => dig(e)}
                  className="min-w-11 min-h-11 grid place-items-center text-lg hover:scale-125 transition-transform"
                >
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
      <h3 className={SECTION_HEADING}>On the session</h3>
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
            className="flex-1 min-h-11 text-sm border rounded-lg px-2.5"
          />
          <button
            onClick={send}
            disabled={!text.trim() || post.isPending}
            className="min-h-11 text-sm px-3 bg-sage-700 text-white rounded-lg font-medium disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

function AwardPicker({
  label, hint, icon, people, picked, onPick,
}: {
  label: string
  hint: string
  icon: ReactNode
  people: { user_id: string; username: string | null; avatar_url: string | null }[]
  picked: string | null
  onPick: (id: string) => void
}) {
  const badge = 'bg-sage-700'
  const ring = 'ring-sage-700'
  const avatar = 'bg-sage-100 text-sage-700'
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

/**
 * The props chips and the comment for one climber. Shared by the voting
 * accordion and the unlocked verdict card, so the two cannot drift into
 * offering different tags or saving differently.
 *
 * It owns its own mutations rather than taking them as props: React Query is
 * happy with an instance per climber, and threading two mutation objects through
 * both call sites bought nothing.
 */
function PropsPanel({
  roundId, groupId, subjectId, myTags, myNote,
}: {
  roundId: string
  groupId: string
  subjectId: string
  /** Keyed `${subject_id}:${tag}` -- the caller already has the whole set. */
  myTags: Set<string>
  myNote: string
}) {
  const toggleTag = useToggleAwardTag()
  const setNote = useSetAwardNote()

  return (
    <>
      {/* One scrolling row, not three wrapped ones: eight 44px chips wrapped
          cost ~150px per climber. The scroll is contained here so the page
          itself never scrolls sideways. */}
      <div className="flex gap-2 overflow-x-auto -mx-3 px-3 pb-0.5">
        {AWARD_TAGS.map(t => {
          const on = myTags.has(`${subjectId}:${t.key}`)
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={on}
              onClick={() => toggleTag.mutate(
                { roundId, groupId, subjectId, tag: t.key },
                { onError: (e: unknown) => toast.error(errorMessage(e, 'Could not tag')) },
              )}
              className={`min-h-11 inline-flex flex-shrink-0 items-center whitespace-nowrap px-3 rounded-full text-[13px] font-semibold border ${
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
        initial={myNote}
        onSave={body => setNote.mutate(
          { roundId, groupId, subjectId, body },
          { onError: (e: unknown) => toast.error(errorMessage(e, 'Could not save')) },
        )}
      />
    </>
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
