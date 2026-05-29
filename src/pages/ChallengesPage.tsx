import { useState } from 'react'
import {
  useChallenges,
  useCreateChallenge,
  useUpdateChallenge,
  useChallengeAttempts,
  useSendChallenge,
  useReceivedChallenges,
} from '../hooks/useChallenges'
import { useFollowing } from '../hooks/useFollows'
import { useProfile } from '../hooks/useProfile'
import { BottomSheet } from '../components/BottomSheet'
import { FAB } from '../components/FAB'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { useAuth } from '../providers/AuthProvider'
import type { Challenge } from '../types'

export function ChallengesPage() {
  const { user } = useAuth()
  const { data: challenges = [], isLoading } = useChallenges()
  const { data: received = [] } = useReceivedChallenges()
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<Challenge | null>(null)
  const [editing, setEditing] = useState<Challenge | null>(null)

  if (isLoading) return <div className="p-4 text-gray-500">Loading...</div>

  return (
    <div className="p-4 space-y-4 pb-24">
      <h1 className="text-2xl font-bold">Challenges</h1>

      {received.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-2">Sent to me</h2>
          <div className="space-y-2">
            {received.map(inv => (
              <button
                key={inv.id}
                onClick={() => setSelected(inv.challenges)}
                className="w-full text-left bg-indigo-50 border border-indigo-200 rounded-xl p-4"
              >
                <p className="font-semibold text-gray-900">{inv.challenges.title}</p>
                <p className="text-xs text-indigo-500 mt-0.5">from {inv.profiles?.username ?? 'someone'}</p>
                {inv.challenges.description && (
                  <p className="text-sm text-gray-500 mt-1">{inv.challenges.description}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        {received.length > 0 && <h2 className="text-base font-semibold mb-2">All Challenges</h2>}
        {challenges.length === 0 && (
          <p className="text-gray-400 text-sm text-center pt-12">
            No challenges yet. Tap + to create the first one.
          </p>
        )}
        <div className="space-y-2">
          {challenges.map(challenge => (
            <div key={challenge.id} className="relative">
              <button
                onClick={() => setSelected(challenge)}
                className="w-full text-left bg-white border rounded-xl p-4 hover:border-indigo-300 transition-colors"
              >
                <p className="font-semibold text-gray-900 pr-12">{challenge.title}</p>
                {challenge.description && (
                  <p className="text-sm text-gray-500 mt-1">{challenge.description}</p>
                )}
                <AttemptCount challengeId={challenge.id} />
              </button>
              {challenge.creator_id === user?.id && (
                <button
                  onClick={e => { e.stopPropagation(); setEditing(challenge) }}
                  className="absolute top-3 right-3 text-xs text-indigo-500 font-medium px-2 py-1 rounded-lg hover:bg-indigo-50"
                >
                  Edit
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <FAB onClick={() => setCreateOpen(true)} label="Create challenge" />

      <BottomSheet open={createOpen} onClose={() => setCreateOpen(false)} title="New Challenge">
        <ChallengeForm onClose={() => setCreateOpen(false)} />
      </BottomSheet>

      <BottomSheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit Challenge"
      >
        {editing && (
          <ChallengeForm
            existing={editing}
            onClose={() => setEditing(null)}
          />
        )}
      </BottomSheet>

      {selected && (
        <BottomSheet open={!!selected} onClose={() => setSelected(null)} title={selected.title}>
          <ChallengeDetail challenge={selected} currentUserId={user?.id ?? ''} />
        </BottomSheet>
      )}
    </div>
  )
}

function AttemptCount({ challengeId }: { challengeId: string }) {
  const { data: attempts = [] } = useChallengeAttempts(challengeId)
  if (attempts.length === 0) return null
  const completed = attempts.filter(a => a.completed).length
  return (
    <p className="text-xs text-gray-400 mt-2">
      {attempts.length} attempt{attempts.length !== 1 ? 's' : ''} · {completed} completed
    </p>
  )
}

function ChallengeForm({ existing, onClose }: { existing?: Challenge; onClose: () => void }) {
  const createChallenge = useCreateChallenge()
  const updateChallenge = useUpdateChallenge()
  const { register, handleSubmit } = useForm<{ title: string; description: string; video_url: string }>({
    defaultValues: {
      title: existing?.title ?? '',
      description: existing?.description ?? '',
      video_url: existing?.video_url ?? '',
    },
  })

  const onSubmit = (values: { title: string; description: string; video_url: string }) => {
    const payload = {
      title: values.title,
      description: values.description || null,
      video_url: values.video_url || null,
    }
    if (existing) {
      updateChallenge.mutate(
        { id: existing.id, ...payload },
        {
          onSuccess: () => { toast.success('Challenge updated'); onClose() },
          onError: () => toast.error('Failed to update challenge'),
        },
      )
    } else {
      createChallenge.mutate(payload, {
        onSuccess: () => { toast.success('Challenge created'); onClose() },
        onError: () => toast.error('Failed to create challenge'),
      })
    }
  }

  const isPending = createChallenge.isPending || updateChallenge.isPending

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
        <input
          {...register('title', { required: true })}
          type="text"
          placeholder="e.g. 10 sec front lever"
          className="w-full border rounded-lg px-3 py-2.5"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
        <textarea
          {...register('description')}
          rows={3}
          placeholder="Rules, context, tips..."
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Demo video link (optional)</label>
        <input
          {...register('video_url')}
          type="url"
          placeholder="https://instagram.com/... or https://youtube.com/..."
          className="w-full border rounded-lg px-3 py-2.5 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium disabled:opacity-50"
      >
        {isPending ? 'Saving...' : existing ? 'Save Changes' : 'Create Challenge'}
      </button>
    </form>
  )
}

function ChallengeDetail({ challenge, currentUserId }: { challenge: Challenge; currentUserId: string }) {
  const { data: attempts = [] } = useChallengeAttempts(challenge.id)
  const [sendOpen, setSendOpen] = useState(false)
  const completed = attempts.filter(a => a.completed).length

  return (
    <div className="space-y-4">
      {challenge.description && (
        <p className="text-gray-600 text-sm">{challenge.description}</p>
      )}
      {challenge.video_url && (
        <a
          href={challenge.video_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-indigo-600 font-medium"
        >
          ▶ Watch demo video
        </a>
      )}
      <div className="flex gap-6">
        <div className="text-center">
          <p className="text-2xl font-bold">{attempts.length}</p>
          <p className="text-xs text-gray-500">Attempts</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold">{completed}</p>
          <p className="text-xs text-gray-500">Completed</p>
        </div>
        {attempts.length > 0 && (
          <div className="text-center">
            <p className="text-2xl font-bold">{Math.round((completed / attempts.length) * 100)}%</p>
            <p className="text-xs text-gray-500">Success rate</p>
          </div>
        )}
      </div>
      {completed > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Completed by</p>
          <div className="flex flex-wrap gap-2">
            {attempts.filter(a => a.completed).map(a => (
              <CompleterItem key={a.id} userId={a.user_id} />
            ))}
          </div>
        </div>
      )}
      {attempts.filter(a => a.video_url).length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Proof videos</p>
          <div className="space-y-1">
            {attempts.filter(a => a.video_url).map(a => (
              <a
                key={a.id}
                href={a.video_url!}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm text-indigo-600 truncate"
              >
                ▶ {a.video_url}
              </a>
            ))}
          </div>
        </div>
      )}
      <button
        onClick={() => setSendOpen(true)}
        className="w-full border border-indigo-600 text-indigo-600 py-2.5 rounded-xl font-medium text-sm"
      >
        Send to friends
      </button>
      <p className="text-sm text-gray-400">Add this challenge to a session via the + button on the session detail page.</p>

      <BottomSheet open={sendOpen} onClose={() => setSendOpen(false)} title="Send to Friends">
        <SendChallengeForm
          challengeId={challenge.id}
          currentUserId={currentUserId}
          onClose={() => setSendOpen(false)}
        />
      </BottomSheet>
    </div>
  )
}

function SendChallengeForm({
  challengeId,
  currentUserId,
  onClose,
}: {
  challengeId: string
  currentUserId: string
  onClose: () => void
}) {
  const { data: following = [] } = useFollowing()
  const sendChallenge = useSendChallenge()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSend = () => {
    if (selected.size === 0) return
    sendChallenge.mutate(
      { challengeId, recipientIds: Array.from(selected) },
      {
        onSuccess: () => { toast.success('Challenge sent!'); onClose() },
        onError: () => toast.error('Failed to send'),
      },
    )
  }

  if (following.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">You're not following anyone yet. Add friends in the Profile tab.</p>
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {following
          .filter(f => f.following_id !== currentUserId)
          .map(f => (
            <FollowingItem
              key={f.following_id}
              userId={f.following_id}
              selected={selected.has(f.following_id)}
              onToggle={() => toggle(f.following_id)}
            />
          ))}
      </div>
      <button
        onClick={handleSend}
        disabled={selected.size === 0 || sendChallenge.isPending}
        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium disabled:opacity-50"
      >
        {sendChallenge.isPending ? 'Sending...' : `Send to ${selected.size || ''} friend${selected.size !== 1 ? 's' : ''}`}
      </button>
    </div>
  )
}

function FollowingItem({
  userId,
  selected,
  onToggle,
}: {
  userId: string
  selected: boolean
  onToggle: () => void
}) {
  const { data: profile } = useProfile(userId)
  if (!profile) return null
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center justify-between p-3 rounded-xl border transition-colors ${
        selected ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-indigo-100 overflow-hidden flex items-center justify-center text-indigo-400 font-medium text-sm">
          {profile.avatar_url
            ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            : profile.username?.[0]?.toUpperCase() ?? '?'}
        </div>
        <p className="font-medium text-sm">{profile.username}</p>
      </div>
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
        selected ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300'
      }`}>
        {selected && <span className="text-white text-xs">✓</span>}
      </div>
    </button>
  )
}

function CompleterItem({ userId }: { userId: string }) {
  const { data: profile } = useProfile(userId)
  if (!profile) return null
  return (
    <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-full px-3 py-1">
      <div className="w-5 h-5 rounded-full bg-indigo-100 overflow-hidden flex items-center justify-center text-indigo-400 font-medium text-xs flex-shrink-0">
        {profile.avatar_url
          ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
          : profile.username?.[0]?.toUpperCase() ?? '?'}
      </div>
      <span className="text-sm text-gray-700">{profile.username}</span>
    </div>
  )
}
