import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Camera, Plus, X } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import { ProblemColorIcons } from './Chip'
import {
  useMatchingGymProblems,
  useCreateGymProblem,
  useClaimGymProblem,
} from '../hooks/useGymProblems'
import { useAuth } from '../providers/AuthProvider'
import { uploadProblemImage } from '../lib/problemImages'
import { daysUntil } from '../utils/gymProblems'
import type { Problem } from '../types'

export function BoulderLinkSheet({
  problem,
  open,
  onClose,
  onDone,
}: {
  problem: Problem
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const { data: matches = [], isLoading } = useMatchingGymProblems({
    gym: problem.gym,
    color: problem.color,
  })
  const create = useCreateGymProblem()
  const claim = useClaimGymProblem()
  const { user } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // What a new boulder would be published with: the photo the problem already
  // carries, or one taken here. Joining a match above ignores all of this.
  const photoUrl = previewUrl ?? problem.image_url

  const pickFile = (f: File | null) => {
    setFile(f)
    setPreviewUrl(f ? URL.createObjectURL(f) : null)
    if (!f && fileInputRef.current) fileInputRef.current.value = ''
  }

  const join = (gymProblemId: string) => {
    claim.mutate(
      { problemId: problem.id, gymProblemId },
      {
        onSuccess: () => onDone(),
        onError: () => toast.error('Could not join'),
      },
    )
  }

  // gym is the one field create_gym_problem cannot do without -- gym_problems.gym
  // is NOT NULL (044), so publishing without one fails inside the RPC and the
  // climber gets a generic "Could not create boulder" for a problem they have no
  // way to diagnose. Now that a new problem defaults to Public this sheet opens
  // on every log, including from a climber with no default gym set, so the
  // unpublishable case went from obscure to routine.
  const gym = problem.gym?.trim() ?? ''

  // A new shared boulder also becomes a tile on everyone's home strip, so it
  // needs a photo: a colour and a grade alone can't be found on the wall, and
  // nobody can give beta on a boulder they can't identify. Joining a match
  // above needs neither, deliberately — that boulder already has a tile, and
  // gating a send would tax logging rather than publishing.
  const canCreate = gym.length > 0 && !!photoUrl

  const createNew = async () => {
    // The button is disabled without a photo; this is the backstop.
    let image_url = problem.image_url
    if (file && user) {
      setUploading(true)
      try {
        image_url = await uploadProblemImage(file, user.id)
      } finally {
        setUploading(false)
      }
      if (!image_url) {
        toast.error('Could not upload the photo — nothing was created. Try again.')
        return
      }
    }
    if (!image_url) return

    create.mutate(
      {
        gym,
        color: problem.color,
        hold_color: problem.hold_color,
        wall_angle: null,
        name: null,
        image_url,
        beta_video_url: problem.beta_video_url,
        community_grade: null,
      },
      {
        onSuccess: gp => join(gp.id),
        onError: () => toast.error('Could not create boulder'),
      },
    )
  }

  const busy = create.isPending || claim.isPending || uploading
  const now = new Date()

  return (
    <BottomSheet open={open} onClose={onClose} title="Publish to the gym">
      <p className="text-sm text-gray-500 mb-4">
        {[problem.color, problem.gym].filter(Boolean).join(' at ') || 'Share this boulder'}. Is it one of these?
      </p>

      {isLoading ? (
        <p className="text-sm text-gray-400">Searching…</p>
      ) : (
        <div className="space-y-2">
          {matches.map(gp => {
            const left = daysUntil(gp.expires_at, now)
            return (
              <button
                key={gp.id}
                onClick={() => join(gp.id)}
                disabled={busy}
                className="w-full flex items-center gap-3 p-3 border rounded-xl text-left hover:bg-gray-50 disabled:opacity-50"
              >
                {gp.image_url && (
                  <img src={gp.image_url} alt="" className="w-12 h-12 object-cover rounded-lg" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {gp.name || `${gp.color ?? ''} ${gp.wall_angle ?? ''}`.trim() || 'Shared boulder'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {left >= 0 ? `${left} days left` : 'expired'}
                  </p>
                </div>
                <ProblemColorIcons color={gp.color} holdColor={gp.hold_color} size={16} className="ml-auto flex-shrink-0" />
              </button>
            )
          })}
          {matches.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">
              No matching boulder yet. Be the first to log it.
            </p>
          )}

          <div className="mt-2 space-y-2 rounded-xl border border-dashed border-sage-300 p-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => pickFile(e.target.files?.[0] ?? null)}
            />
            <div className="flex items-center gap-3">
              {photoUrl ? (
                <div className="relative flex-shrink-0">
                  <img src={photoUrl} alt="Boulder photo" className="h-12 w-12 rounded-lg border object-cover" />
                  {/* Only a photo taken here can be dropped again — the problem's
                      own image isn't this sheet's to remove. */}
                  {previewUrl && (
                    <button
                      type="button"
                      onClick={() => pickFile(null)}
                      aria-label="Remove photo"
                      className="absolute -right-2 -top-2 rounded-full border bg-white p-0.5 shadow"
                    >
                      <X className="h-3.5 w-3.5 text-gray-600" />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Add a photo"
                  className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                >
                  <Camera size={16} />
                </button>
              )}
              <p className={`text-xs leading-snug ${photoUrl ? 'text-gray-400' : 'text-sage-700'}`}>
                {photoUrl
                  ? 'This photo goes on the wall for everyone at your gym.'
                  : 'A new boulder needs a photo, so others can find it on the wall.'}
              </p>
            </div>
            <button
              onClick={createNew}
              disabled={!canCreate || busy}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-xl text-sm font-medium text-sage-700 hover:bg-sage-50 disabled:opacity-50"
            >
              <Plus size={15} strokeWidth={2.2} /> No, it&apos;s new — create it
            </button>
            {/* Left disabled rather than hidden: the climber should see that
                publishing is on offer, and what it is waiting on. The photo is
                fixable right here and says so above; a missing gym is not, so
                that one has to name where the fix lives. */}
            {gym.length === 0 && (
              <p className="text-[11px] leading-snug text-gray-500">
                A shared boulder lives at a gym, and this problem has none. Close
                this, add the gym to the problem, and set it Public again.
              </p>
            )}
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
