import { Link, useNavigate } from 'react-router-dom'
import type { BetaRequest } from '../utils/betaRequests'
import type { BoulderNavState } from '../utils/boulderNav'

const SHOWN = 3

/** "the blue 6C", falling back to the summary's own title. */
function boulderLabel(r: BetaRequest): string {
  const colorGrade = [r.boulder.color?.toLowerCase(), r.boulder.community_grade]
    .filter(Boolean)
    .join(' ')
  // Falling back to boulder.title would read "stuck on Shared boulder" or "stuck
  // on overhang", since names were removed and the title is then a wall angle or
  // a generic label. "a boulder" is the same fallback FeedCard uses.
  return colorGrade ? `the ${colorGrade}` : 'a boulder'
}

/**
 * Open "I'm stuck" asks at your gyms — the one place in the app where someone has
 * explicitly requested beta and you can answer. Renders nothing when nobody is
 * asking; tapping a row opens the boulder, whose Beta tab holds the composer.
 */
export function BetaRequestsSection({ requests }: { requests: BetaRequest[] }) {
  const navigate = useNavigate()
  if (requests.length === 0) return null

  const shown = requests.slice(0, SHOWN)
  const extra = requests.length - shown.length

  return (
    <div className="px-4 pt-3 pb-1">
      <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Someone's stuck</h2>
      <div className="space-y-2">
        {shown.map(r => (
          <button
            key={`${r.gymProblemId}:${r.askerId}`}
            type="button"
            // Open on Beta: that is where the ask itself and the composer live, so
            // the reason for the tap is visible on arrival. No boulderIds — a list
            // of asks isn't a browsable boulder sequence, so prev/next stays hidden.
            onClick={() => navigate(`/gym-problems/${r.gymProblemId}`, {
              state: { openTab: 'beta' } satisfies BoulderNavState,
            })}
            className="w-full flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/60 px-3.5 py-2.5 text-left hover:border-amber-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500"
          >
            <span aria-hidden className="text-base leading-none mt-0.5">🆘</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-gray-800">
                <span className="font-semibold">{r.askerName ?? 'Someone'}</span>
                <span className="text-gray-500"> is stuck on </span>
                <span className="font-medium">{boulderLabel(r)}</span>
              </span>
              {r.note && (
                <span className="mt-0.5 block text-xs text-gray-600 line-clamp-2">"{r.note}"</span>
              )}
              <span className="mt-0.5 block text-[11px] text-gray-400">{r.boulder.gym}</span>
            </span>
            <span aria-hidden className="text-gray-400 text-base leading-none mt-0.5">›</span>
          </button>
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
