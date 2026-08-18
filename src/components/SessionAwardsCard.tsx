import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { GoatIcon, DonkeyIcon } from './AwardIcons'
import { RateSessionSheet } from './RateSessionSheet'
import {
  useAwardCandidates, useOpenAwardRound, useAwardRound, useAwardParticipants,
  type AwardCandidate, type AwardRoundState,
} from '../hooks/useSessionAwards'

/** useAwardCandidates never returns more than this many rows. */
const MAX_CANDIDATES = 5

function candidateDateLabel(dateStr: string): string {
  try { return format(new Date(`${dateStr}T00:00:00`), 'EEE d MMM') }
  catch { return dateStr }
}

/**
 * The awards entry point on the crew page. A crew can climb several times a
 * week, so this renders up to two rows: the newest session that still needs
 * votes (or hasn't started), and — separately — the most recent verdict that
 * has unlocked, so it stays reachable once a newer session takes over the
 * primary slot. Renders nothing when there is nothing to show.
 */
export function SessionAwardsCard({ crewId }: { crewId: string }) {
  const { data: candidates = [] } = useAwardCandidates(crewId)
  const openRound = useOpenAwardRound()
  const [sheetRoundId, setSheetRoundId] = useState<string | null>(null)

  // Fixed number of hook calls regardless of how many candidates came back,
  // so this stays legal regardless of the data.
  const roundQueries = [
    useAwardRound(candidates[0]?.round_id ?? null),
    useAwardRound(candidates[1]?.round_id ?? null),
    useAwardRound(candidates[2]?.round_id ?? null),
    useAwardRound(candidates[3]?.round_id ?? null),
    useAwardRound(candidates[4]?.round_id ?? null),
  ].slice(0, MAX_CANDIDATES)

  const isUnlocked = (i: number) => !!roundQueries[i]?.data?.unlocked

  // Candidates come back newest-first, so the first non-unlocked one is the
  // newest that still needs attention, and the first unlocked one is the most
  // recent verdict available.
  const openIdx = candidates.findIndex((_, i) => !isUnlocked(i))
  const verdictIdx = candidates.findIndex((_, i) => isUnlocked(i))

  const primaryIdx = openIdx >= 0 ? openIdx : 0
  const primaryCandidate: AwardCandidate | undefined = candidates[primaryIdx]
  const primaryRound: AwardRoundState | undefined = roundQueries[primaryIdx]?.data

  // The compact verdict row only appears when it points somewhere other than
  // the primary card — otherwise it *is* the primary card (today's "verdict
  // is in" state), and showing it twice would be redundant.
  const showSecondaryVerdict = verdictIdx >= 0 && verdictIdx !== primaryIdx
  const secondaryCandidate: AwardCandidate | undefined = showSecondaryVerdict ? candidates[verdictIdx] : undefined

  const { data: primaryParticipants = [] } = useAwardParticipants(primaryCandidate?.round_id ?? null)

  if (!primaryCandidate) return null

  const unlocked = primaryRound?.unlocked ?? false
  // Before a round exists there is no round-level signal yet, so fall back to
  // the candidate row's own am_participant — the same underlying check, just
  // computed ahead of open_award_round ever having been called.
  const amParticipant = primaryRound?.am_participant ?? primaryCandidate.am_participant
  const iVoted = !!primaryRound?.mine.votes.some(v => v.kind === 'goat')

  const start = () => {
    if (primaryCandidate.round_id) { setSheetRoundId(primaryCandidate.round_id); return }
    openRound.mutate(
      { crewId, date: primaryCandidate.round_date, gym: primaryCandidate.gym },
      {
        onSuccess: id => setSheetRoundId(id),
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not open awards'),
      },
    )
  }

  return (
    <div className="bg-white border border-sage-100 rounded-2xl p-3.5">
      <div className="flex items-center gap-2.5">
        <div className="flex flex-shrink-0">
          <span className="w-8 h-8 rounded-full bg-sage-700 text-white grid place-items-center">
            <GoatIcon size={19} />
          </span>
          <span className="w-8 h-8 -ml-2 rounded-full bg-khaki-600 border-2 border-white text-white grid place-items-center">
            <DonkeyIcon size={19} />
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight">
            {unlocked ? 'The verdict is in' : iVoted ? 'Verdict in. Waiting on the rest.' : 'Awards are open'}
          </p>
          <p className="text-xs text-gray-500 truncate">
            {candidateDateLabel(primaryCandidate.round_date)} · {primaryCandidate.climbers} of you climbed
          </p>
        </div>
      </div>

      {primaryRound && amParticipant && (
        <>
          {primaryParticipants.length > 0 && (
            <div className="flex -space-x-1.5 mt-3">
              {primaryParticipants.map(p => {
                const voted = primaryRound.voters.includes(p.user_id)
                return (
                  <span
                    key={p.user_id}
                    className={`w-6 h-6 rounded-full border-2 border-white grid place-items-center text-[9px] font-semibold overflow-hidden ${
                      voted ? 'bg-sage-100 text-sage-700' : 'bg-gray-100 text-gray-400 opacity-50'
                    }`}
                  >
                    {p.avatar_url
                      ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                      : (p.username ?? '?').slice(0, 1).toUpperCase()}
                  </span>
                )
              })}
            </div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span className="flex-1 text-xs text-gray-500 tabular-nums">
              {primaryRound.voted} of {primaryRound.participants} voted
            </span>
            {!unlocked && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-khaki-600">
                <Clock size={13} strokeWidth={2} /> closes {format(new Date(primaryRound.closes_at), 'EEE HH:mm')}
              </span>
            )}
          </div>
        </>
      )}

      {!amParticipant && !unlocked && (
        <p className="text-xs text-gray-500 mt-3">
          You weren't at this one, so no vote from you — the crew's got it covered.
        </p>
      )}

      {unlocked ? (
        <Link
          to={`/crews/${crewId}/awards/${primaryCandidate.round_id}`}
          className="mt-3 min-h-11 flex items-center justify-center bg-sage-700 text-white rounded-xl text-[15px] font-semibold"
        >
          See the verdict
        </Link>
      ) : amParticipant ? (
        <button
          type="button"
          onClick={start}
          disabled={openRound.isPending}
          className={`mt-3 w-full min-h-11 flex items-center justify-center rounded-xl text-[15px] font-semibold disabled:opacity-50 ${
            iVoted ? 'bg-sage-50 text-sage-700' : 'bg-sage-700 text-white'
          }`}
        >
          {openRound.isPending ? 'Opening…' : iVoted ? 'Change my verdict' : 'Cast your votes'}
        </button>
      ) : null}

      <p className="text-[11px] text-gray-400 text-center mt-2">
        {unlocked
          ? 'GOAT, donkey, and what each climber was tagged for.'
          : 'GOAT, donkey, and one line on each climber.'}
      </p>

      {showSecondaryVerdict && secondaryCandidate?.round_id && (
        <Link
          to={`/crews/${crewId}/awards/${secondaryCandidate.round_id}`}
          className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 text-gray-500"
        >
          <span className="text-xs font-medium flex-1 min-w-0 truncate">
            The verdict is in · {candidateDateLabel(secondaryCandidate.round_date)}
          </span>
          <ChevronRight size={16} strokeWidth={2} className="flex-shrink-0" />
        </Link>
      )}

      {sheetRoundId && (
        <RateSessionSheet
          open={!!sheetRoundId}
          onClose={() => setSheetRoundId(null)}
          roundId={sheetRoundId}
        />
      )}
    </div>
  )
}
