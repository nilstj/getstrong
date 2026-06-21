import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LifeBuoy, Users, Globe, Trophy, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { BottomSheet } from './BottomSheet'
import {
  useProblemHelpRequest,
  useCreateHelpRequest,
  useResolveHelpRequest,
} from '../hooks/useHelp'
import { useMyBountyBudget } from '../hooks/useBountyBudget'
import { BOUNTY_BUDGET } from '../utils/bounty'
import { useAuth } from '../providers/AuthProvider'
import { HoldHighlightViewer } from './HoldHighlightViewer'
import type { HelpVisibility, Problem } from '../types'

export function CallForHelp({ problem }: { problem: Problem }) {
  const hasMedia = !!(problem.image_url || problem.beta_video_url)
  const { data: existing } = useProblemHelpRequest(problem.id)
  const [open, setOpen] = useState(false)
  const [holdOpen, setHoldOpen] = useState(false)
  const [visibility, setVisibility] = useState<HelpVisibility>('friends')
  const [message, setMessage] = useState('')
  const [bounty, setBounty] = useState(0)
  const { data: budget } = useMyBountyBudget()
  const { user } = useAuth()
  const canBounty = !!problem.gym_problem_id
  const maxBounty = Math.min(50, budget?.remaining ?? BOUNTY_BUDGET)

  const create = useCreateHelpRequest()
  const resolve = useResolveHelpRequest()

  // Prerequisite: only problems with an image or video can ask for beta.
  if (!hasMedia) return null

  if (existing) {
    return (
      <div className="flex items-center gap-2 mt-1.5 text-xs flex-wrap">
        <span className="inline-flex items-center gap-1 text-sage-700 font-medium">
          <LifeBuoy size={13} strokeWidth={2} /> Help requested
        </span>
        <Link to="/help" className="text-gray-400 hover:text-sage-700">· view</Link>
        <button
          onClick={() => resolve.mutate(existing.id, {
            onSuccess: () => toast.success('Marked resolved'),
            onError: () => toast.error('Failed'),
          })}
          className="text-gray-400 hover:text-gray-600"
        >
          · resolve
        </button>
        {problem.image_url && (
          <button onClick={() => setHoldOpen(true)} className="ml-1 inline-flex items-center gap-1 text-xs font-medium text-sage-700 hover:text-sage-900">
            <Sparkles size={13} strokeWidth={2} /> Highlight holds
          </button>
        )}
        {holdOpen && (
          <HoldHighlightViewer problem={problem} isOwner={problem.user_id === user?.id} onClose={() => setHoldOpen(false)} />
        )}
      </div>
    )
  }

  const submit = () => {
    create.mutate(
      {
        problemId: problem.id,
        message: message.trim() || null,
        visibility,
        bounty: canBounty ? bounty : 0,
        gymProblemId: problem.gym_problem_id,
      },
      {
        onSuccess: () => { toast.success(bounty > 0 ? `Bounty of ${bounty} posted! 🏆` : 'Call for help posted! 🆘'); setOpen(false); setMessage(''); setBounty(0) },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
      },
    )
  }

  return (
    <>
      <div className="flex items-center flex-wrap gap-x-1 gap-y-0">
      <button
        onClick={() => setOpen(true)}
        className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-sage-700 hover:text-sage-900 transition-colors"
      >
        <LifeBuoy size={13} strokeWidth={2} /> Ask for beta
      </button>
      {problem.image_url && (
        <button onClick={() => setHoldOpen(true)} className="mt-1.5 ml-3 inline-flex items-center gap-1 text-xs font-medium text-sage-700 hover:text-sage-900">
          <Sparkles size={13} strokeWidth={2} /> Highlight holds
        </button>
      )}
      {holdOpen && (
        <HoldHighlightViewer problem={problem} isOwner={problem.user_id === user?.id} onClose={() => setHoldOpen(false)} />
      )}
      </div>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Ask for beta">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Stuck on this one? Ask your community for beta. They can see your photo/video and respond.
          </p>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Who can see it</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setVisibility('friends')}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  visibility === 'friends' ? 'bg-sage-700 text-white border-sage-700' : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                <Users size={15} strokeWidth={1.75} /> Friends
              </button>
              <button
                onClick={() => setVisibility('global')}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  visibility === 'global' ? 'bg-sage-700 text-white border-sage-700' : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                <Globe size={15} strokeWidth={1.75} /> Everyone
              </button>
            </div>
          </div>

          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="What are you stuck on? (optional)"
            rows={3}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
          />

          {canBounty && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Trophy size={13} className="text-amber-500" /> Bounty (optional)
              </p>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setBounty(b => Math.max(0, b - 5))}
                  className="w-9 h-9 rounded-full border text-xl flex items-center justify-center"
                >−</button>
                <span className="text-lg font-semibold w-10 text-center">{bounty}</span>
                <button
                  type="button"
                  onClick={() => setBounty(b => Math.min(maxBounty, b + 5))}
                  className="w-9 h-9 rounded-full border text-xl flex items-center justify-center"
                >+</button>
                <span className="text-xs text-gray-400">{budget?.remaining ?? BOUNTY_BUDGET} of {BOUNTY_BUDGET} left this month</span>
              </div>
            </div>
          )}

          <button
            onClick={submit}
            disabled={create.isPending}
            className="w-full bg-sage-700 text-white py-3 rounded-2xl font-medium flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <LifeBuoy size={16} strokeWidth={1.75} /> Post call for help
          </button>
        </div>
      </BottomSheet>
    </>
  )
}
