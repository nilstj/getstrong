import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import { betaRequestKey, visibleBetaRequests, pruneDismissals } from '../utils/betaRequests'
import type { BetaRequest } from '../utils/betaRequests'
import { boulderColorGradeLabel } from '../utils/boulders'
import type { BoulderNavState } from '../utils/boulderNav'

const SHOWN = 3

/**
 * Which asks this viewer has waved off, as { key: dismissedAt }.
 *
 * Per device rather than per account: it needs no table and so no release gate,
 * and "not me, thanks" is a cheap decision to make again on another phone. The
 * precedent is AnalysisPage's coach-throttle key. Every access is wrapped --
 * private mode can throw on read as well as write, in which case a dismissal
 * simply lasts the session.
 */
const DISMISSED_KEY = 'moresends.betaRequests.dismissed.v1'

function readDismissed(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, string>
  } catch {
    return {}
  }
}

/**
 * Open "I'm stuck" asks at your gyms — the one place in the app where someone has
 * explicitly requested beta and you can answer. Renders nothing when nobody is
 * asking; tapping a row opens the boulder, whose Beta tab holds the composer.
 */
export function BetaRequestsSection({ requests }: { requests: BetaRequest[] }) {
  const navigate = useNavigate()
  // Read once on mount rather than on every render: the store only changes
  // through the dismiss handler below, which updates both at the same time.
  const [dismissed, setDismissed] = useState<Record<string, string>>(readDismissed)

  const write = (next: Record<string, string>) => {
    setDismissed(next)
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next))
    } catch {
      // Private mode or a full quota: the dismissal still holds for this
      // session, which is better than blocking it outright.
    }
  }

  const dismiss = (r: BetaRequest) => {
    const key = betaRequestKey(r.gymProblemId, r.askerId)
    write(pruneDismissals({ ...dismissed, [key]: new Date().toISOString() }, new Date()))
    // Undo, because the mirror of "it never disappears" is a mis-tap hiding a
    // real ask for months.
    toast(t => (
      <span className="flex items-center gap-3">
        Hidden
        <button
          type="button"
          onClick={() => {
            // `dismissed` here is the map as it was BEFORE this ask was
            // added -- the closure captured it when dismiss() ran -- so
            // writing it back is exactly the undo. Do not "simplify" this to
            // read current state.
            write(pruneDismissals(dismissed, new Date()))
            toast.dismiss(t.id)
          }}
          className="font-semibold text-sage-700"
        >
          Undo
        </button>
      </span>
    ))
  }

  const open = visibleBetaRequests(requests, new Set(Object.keys(dismissed)))
  if (open.length === 0) return null

  const shown = open.slice(0, SHOWN)
  const extra = open.length - shown.length

  return (
    <div className="px-4 pt-3 pb-1">
      <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Someone's stuck</h2>
      <div className="space-y-2">
        {shown.map(r => (
          /* The dismiss control is a sibling of the navigating button, not a
             child: a <button> inside a <button> is invalid markup and the inner
             one's taps get swallowed. */
          <div
            key={betaRequestKey(r.gymProblemId, r.askerId)}
            className="flex items-start rounded-2xl border border-amber-200 bg-amber-50/60 pr-1 transition-colors hover:border-amber-300"
          >
            <button
              type="button"
              // Open on Beta: that is where the ask itself and the composer live, so
              // the reason for the tap is visible on arrival. No boulderIds — a list
              // of asks isn't a browsable boulder sequence, so prev/next stays hidden.
              onClick={() => navigate(`/gym-problems/${r.gymProblemId}`, {
                state: { openTab: 'beta' } satisfies BoulderNavState,
              })}
              className="flex min-w-0 flex-1 items-start gap-2.5 rounded-2xl px-3.5 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500"
            >
              <span aria-hidden className="text-base leading-none mt-0.5">🆘</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-gray-800">
                  <span className="font-semibold">{r.askerName ?? 'Someone'}</span>
                  <span className="text-gray-500"> is stuck on </span>
                  <span className="font-medium">{boulderColorGradeLabel(r.boulder)}</span>
                </span>
                {r.note && (
                  <span className="mt-0.5 block text-xs text-gray-600 line-clamp-2">"{r.note}"</span>
                )}
                <span className="mt-0.5 block text-[11px] text-gray-400">{r.boulder.gym}</span>
              </span>
              <span aria-hidden className="text-gray-400 text-base leading-none mt-0.5">›</span>
            </button>
            <button
              type="button"
              onClick={() => dismiss(r)}
              aria-label={`Hide this ask — I can't help ${r.askerName ?? 'them'} with this one`}
              className="grid min-h-11 min-w-11 flex-shrink-0 place-items-center rounded-2xl text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500"
            >
              <X size={15} strokeWidth={2.5} />
            </button>
          </div>
        ))}
      </div>
      {extra > 0 && (
        <p className="mt-1.5 text-right">
          <Link to="/gym-problems" className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
            +{extra} more →
          </Link>
        </p>
      )}
    </div>
  )
}
