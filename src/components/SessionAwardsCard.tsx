import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { GoatIcon, DonkeyIcon } from './AwardIcons'
import { RateSessionSheet } from './RateSessionSheet'
import { useAwardCandidates, useOpenAwardRound, useAwardRound } from '../hooks/useSessionAwards'
import { awardsUnlocked } from '../utils/sessionAwards'

/**
 * The awards entry point on the crew page. Shows the most recent session two or
 * more of the crew were at: an open round to vote in, or a link to the verdict
 * once it has unlocked. Renders nothing when there is no such session.
 */
export function SessionAwardsCard({ crewId }: { crewId: string }) {
  const { data: candidates = [] } = useAwardCandidates(crewId)
  const openRound = useOpenAwardRound()
  const [sheetRoundId, setSheetRoundId] = useState<string | null>(null)

  const candidate = candidates[0]
  const { data: round } = useAwardRound(candidate?.round_id ?? null)

  if (!candidate) return null

  const dateLabel = (() => {
    try { return format(new Date(`${candidate.round_date}T00:00:00`), 'EEE d MMM') }
    catch { return candidate.round_date }
  })()

  const unlocked = round
    ? awardsUnlocked({
        participants: round.participants, voted: round.voted,
        closesAt: round.closes_at, now: new Date(),
      })
    : false
  const iVoted = !!round?.mine.votes.some(v => v.kind === 'goat')

  const start = () => {
    if (candidate.round_id) { setSheetRoundId(candidate.round_id); return }
    openRound.mutate(
      { crewId, date: candidate.round_date, gym: candidate.gym },
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
            {dateLabel} · {candidate.climbers} of you climbed
          </p>
        </div>
      </div>

      {round && (
        <div className="flex items-center gap-2 mt-3">
          <span className="flex-1 text-xs text-gray-500 tabular-nums">
            {round.voted} of {round.participants} voted
          </span>
          {!unlocked && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-khaki-600">
              <Clock size={13} strokeWidth={2} /> closes {format(new Date(round.closes_at), 'EEE HH:mm')}
            </span>
          )}
        </div>
      )}

      {unlocked && candidate.round_id ? (
        <Link
          to={`/crews/${crewId}/awards/${candidate.round_id}`}
          className="mt-3 min-h-11 flex items-center justify-center bg-sage-700 text-white rounded-xl text-[15px] font-semibold"
        >
          See the verdict
        </Link>
      ) : (
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
      )}

      <p className="text-[11px] text-gray-400 text-center mt-2">
        {unlocked
          ? 'GOAT, donkey, and what each climber was tagged for.'
          : 'GOAT, donkey, and one line on each climber.'}
      </p>

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
