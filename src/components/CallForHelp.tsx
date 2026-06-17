import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LifeBuoy, Users, Globe } from 'lucide-react'
import toast from 'react-hot-toast'
import { BottomSheet } from './BottomSheet'
import {
  useProblemHelpRequest,
  useCreateHelpRequest,
  useResolveHelpRequest,
} from '../hooks/useHelp'
import type { HelpVisibility, Problem } from '../types'

export function CallForHelp({ problem }: { problem: Pick<Problem, 'id' | 'image_url' | 'beta_video_url'> }) {
  const hasMedia = !!(problem.image_url || problem.beta_video_url)
  const { data: existing } = useProblemHelpRequest(problem.id)
  const [open, setOpen] = useState(false)
  const [visibility, setVisibility] = useState<HelpVisibility>('friends')
  const [message, setMessage] = useState('')

  const create = useCreateHelpRequest()
  const resolve = useResolveHelpRequest()

  // Prerequisite: only problems with an image or video can ask for beta.
  if (!hasMedia) return null

  if (existing) {
    return (
      <div className="flex items-center gap-2 mt-1.5 text-xs">
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
      </div>
    )
  }

  const submit = () => {
    create.mutate(
      { problemId: problem.id, message: message.trim() || null, visibility },
      {
        onSuccess: () => { toast.success('Call for help posted! 🆘'); setOpen(false); setMessage('') },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
      },
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-sage-700 hover:text-sage-900 transition-colors"
      >
        <LifeBuoy size={13} strokeWidth={2} /> Ask for beta
      </button>

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
