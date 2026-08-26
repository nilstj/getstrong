import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAcceptPolicy } from '../hooks/usePolicyAcceptance'

export function AcceptPolicyPage() {
  const [accepted, setAccepted] = useState(false)
  const acceptPolicy = useAcceptPolicy()
  const navigate = useNavigate()

  const submit = () => {
    acceptPolicy.mutate(undefined, {
      onSuccess: () => {
        toast.success('Thanks — that’s recorded.')
        navigate('/dashboard', { replace: true })
      },
      onError: (e: unknown) =>
        toast.error(e instanceof Error ? e.message : 'Could not save that'),
    })
  }

  return (
    <div className="max-w-md mx-auto p-5 pt-10">
      <h1 className="text-2xl font-black tracking-tight mb-3">Before you carry on</h1>

      <p className="text-sm text-gray-700 leading-relaxed mb-3">
        MoreSends now has a privacy notice — what it stores, who else sees it, and what
        leaves the app when you use the AI coach. Worth two minutes, because some of it
        will surprise you.
      </p>
      <p className="text-sm text-gray-700 leading-relaxed mb-5">
        There are house rules too. Mostly: ask before you post someone else's face.
      </p>

      <div className="flex gap-4 text-sm mb-6">
        <Link to="/privacy" className="text-sage-700 font-medium">Privacy notice</Link>
        <Link to="/house-rules" className="text-sage-700 font-medium">House rules</Link>
      </div>

      <label className="flex items-start gap-3 mb-6 cursor-pointer">
        <input
          type="checkbox"
          checked={accepted}
          onChange={e => setAccepted(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-sage-700"
        />
        <span className="text-sm text-gray-700 leading-relaxed">
          I'm 13 or older, and I've read the privacy notice and house rules
        </span>
      </label>

      <button
        onClick={submit}
        disabled={!accepted || acceptPolicy.isPending}
        className="w-full bg-sage-700 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-40"
      >
        {acceptPolicy.isPending ? 'Saving…' : 'Got it — back to climbing'}
      </button>
    </div>
  )
}
