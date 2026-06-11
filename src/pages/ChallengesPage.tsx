import { useState } from 'react'
import { Pencil, Trash2, Globe, Lock } from 'lucide-react'
import {
  useChallenges,
  useCreateChallenge,
  useUpdateChallenge,
  useDeleteChallenge,
  useChallengeAttempts,
  useSendChallenge,
  useReceivedChallenges,
  useChallengeComments,
  useAddChallengeComment,
  useDeleteChallengeComment,
} from '../hooks/useChallenges'
import { useChallengeBetas, useAddBeta, useDeleteBeta, useMarkBetaHelpful } from '../hooks/useBetas'
import {
  useSharedProjects,
  useCreateSharedProject,
  useDeleteSharedProject,
  useProjectAttempts,
  useAddProjectAttempt,
} from '../hooks/useSharedProjects'
import { useFollowing } from '../hooks/useFollows'
import { useProfile } from '../hooks/useProfile'
import { BottomSheet } from '../components/BottomSheet'
import { FAB } from '../components/FAB'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { useAuth } from '../providers/AuthProvider'
import type { Challenge } from '../types'

const CHALLENGE_TAGS = ['Power', 'Show-off', 'Power Endurance', 'Endurance', 'Slab', 'Technical'] as const

function TagPills({ tags }: { tags: string[] }) {
  if (!tags || tags.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {tags.map(tag => (
        <span key={tag} className="text-xs bg-gray-50 text-sage-800 border border-gray-200 rounded-full px-2 py-0.5">
          {tag}
        </span>
      ))}
    </div>
  )
}

export function ChallengesPage() {
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const { data: following = [] } = useFollowing()
  const followingIds = following.map(f => f.following_id)
  const { data: challenges = [], isLoading } = useChallenges(followingIds)
  const { data: received = [] } = useReceivedChallenges()
  const deleteChallenge = useDeleteChallenge()
  const [pageTab, setPageTab] = useState<'challenges' | 'projects'>('challenges')
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<Challenge | null>(null)
  const [editing, setEditing] = useState<Challenge | null>(null)

  const publicChallenges = challenges.filter(c => c.is_public)
  const privateChallenges = challenges.filter(c => !c.is_public)
  const isAdmin = profile?.is_admin ?? false

  if (isLoading) return <div className="p-4 text-gray-500">Loading...</div>

  const renderChallengeCard = (challenge: Challenge) => (
    <div key={challenge.id} className="relative">
      <button
        onClick={() => setSelected(challenge)}
        className="w-full text-left bg-white border rounded-2xl p-4 hover:border-gray-300 transition-colors"
      >
        <p className="font-semibold text-gray-900 pr-12">{challenge.title}</p>
        {challenge.description && (
          <p className="text-sm text-gray-500 mt-1">{challenge.description}</p>
        )}
        <TagPills tags={challenge.tags} />
        <AttemptCount challengeId={challenge.id} />
      </button>
      <div className="absolute top-2.5 right-2.5 flex gap-0.5">
        {challenge.creator_id === user?.id && (
          <button
            onClick={e => { e.stopPropagation(); setEditing(challenge) }}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="Edit challenge" aria-label="Edit challenge"
          >
            <Pencil size={16} strokeWidth={1.75} />
          </button>
        )}
        {(challenge.creator_id === user?.id || (isAdmin && challenge.is_public)) && (
          <button
            onClick={e => {
              e.stopPropagation()
              if (window.confirm('Delete this challenge?')) {
                deleteChallenge.mutate(challenge.id, { onError: () => toast.error('Failed to delete') })
              }
            }}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Delete challenge" aria-label="Delete challenge"
          >
            <Trash2 size={16} strokeWidth={1.75} />
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="p-4 space-y-4 pb-28">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight">Challenges</h1>
      </div>

      {/* Page tabs */}
      <div className="flex rounded-2xl overflow-hidden border border-gray-200">
        {(['challenges', 'projects'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setPageTab(tab)}
            className={`flex-1 py-2 text-sm font-semibold capitalize transition-colors ${
              pageTab === tab ? 'bg-sage-700 text-white' : 'bg-white text-gray-500'
            }`}
          >
            {tab === 'challenges' ? '🏆 Challenges' : '🤝 Projects'}
          </button>
        ))}
      </div>

      {pageTab === 'projects' && <SharedProjectsView currentUserId={user?.id ?? ''} />}

      {pageTab === 'challenges' && received.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-2">Sent to me</h2>
          <div className="space-y-2">
            {received.map(inv => (
              <button
                key={inv.id}
                onClick={() => setSelected(inv.challenges)}
                className="w-full text-left bg-gray-50 border border-gray-200 rounded-2xl p-4"
              >
                <p className="font-semibold text-gray-900">{inv.challenges.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">from {inv.profiles?.username ?? 'someone'}</p>
                {inv.challenges.description && (
                  <p className="text-sm text-gray-500 mt-1">{inv.challenges.description}</p>
                )}
                <TagPills tags={inv.challenges.tags} />
              </button>
            ))}
          </div>
        </div>
      )}

      {pageTab === 'challenges' && (
        <>
          {/* Public challenges section */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Globe size={14} strokeWidth={1.75} className="text-sage-700" />
              <h2 className="text-base font-semibold">Public</h2>
            </div>
            {publicChallenges.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">No public challenges yet. Tap + to create one.</p>
            ) : (
              <div className="space-y-2">{publicChallenges.map(renderChallengeCard)}</div>
            )}
          </div>

          {/* Friends & mine section */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Lock size={14} strokeWidth={1.75} className="text-gray-500" />
              <h2 className="text-base font-semibold text-gray-700">Friends &amp; Mine</h2>
            </div>
            {privateChallenges.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">No private challenges yet.</p>
            ) : (
              <div className="space-y-2">{privateChallenges.map(renderChallengeCard)}</div>
            )}
          </div>
        </>
      )}

      {pageTab === 'challenges' && <FAB onClick={() => setCreateOpen(true)} label="Create challenge" />}

      <BottomSheet open={createOpen} onClose={() => setCreateOpen(false)} title="New Challenge">
        <ChallengeForm onClose={() => setCreateOpen(false)} />
      </BottomSheet>

      <BottomSheet open={!!editing} onClose={() => setEditing(null)} title="Edit Challenge">
        {editing && (
          <ChallengeForm existing={editing} onClose={() => setEditing(null)} />
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
  const [tags, setTags] = useState<string[]>(existing?.tags ?? [])
  const [isPublic, setIsPublic] = useState<boolean>(existing?.is_public ?? true)

  const { register, handleSubmit } = useForm<{ title: string; description: string; video_url: string }>({
    defaultValues: {
      title: existing?.title ?? '',
      description: existing?.description ?? '',
      video_url: existing?.video_url ?? '',
    },
  })

  const toggleTag = (tag: string) => {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  const onSubmit = (values: { title: string; description: string; video_url: string }) => {
    const payload = {
      title: values.title,
      description: values.description || null,
      video_url: values.video_url || null,
      tags,
      is_public: isPublic,
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
        <label className="block text-sm font-medium text-gray-700 mb-2">Visibility</label>
        <div className="flex rounded-xl overflow-hidden border border-gray-200">
          <button
            type="button"
            onClick={() => setIsPublic(true)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
              isPublic ? 'bg-sage-700 text-white' : 'bg-white text-gray-500'
            }`}
          >
            <Globe size={14} strokeWidth={1.75} />
            Public
          </button>
          <button
            type="button"
            onClick={() => setIsPublic(false)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
              !isPublic ? 'bg-gray-700 text-white' : 'bg-white text-gray-500'
            }`}
          >
            <Lock size={14} strokeWidth={1.75} />
            Friends only
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          {isPublic ? 'Visible to all users' : 'Only visible to you and your friends'}
        </p>
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
        <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
        <div className="flex flex-wrap gap-2">
          {CHALLENGE_TAGS.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`text-sm px-3 py-1.5 rounded-full border font-medium transition-colors ${
                tags.includes(tag)
                  ? 'bg-sage-700 border-sage-700 text-white'
                  : 'bg-white border-gray-300 text-gray-600'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
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
        className="w-full bg-sage-700 text-white py-3 rounded-xl font-medium disabled:opacity-50"
      >
        {isPending ? 'Saving...' : existing ? 'Save Changes' : 'Create Challenge'}
      </button>
    </form>
  )
}

function ChallengeDetail({ challenge, currentUserId }: { challenge: Challenge; currentUserId: string }) {
  const { data: attempts = [] } = useChallengeAttempts(challenge.id)
  const { data: comments = [] } = useChallengeComments(challenge.id)
  const addComment = useAddChallengeComment()
  const deleteComment = useDeleteChallengeComment()
  const [sendOpen, setSendOpen] = useState(false)
  const [commentText, setCommentText] = useState('')
  const completed = attempts.filter(a => a.completed).length

  const handleAddComment = () => {
    const content = commentText.trim()
    if (!content) return
    addComment.mutate(
      { challengeId: challenge.id, content },
      {
        onSuccess: () => setCommentText(''),
        onError: () => toast.error('Failed to post comment'),
      },
    )
  }

  return (
    <div className="space-y-4">
      {challenge.description && (
        <p className="text-gray-600 text-sm">{challenge.description}</p>
      )}
      <TagPills tags={challenge.tags} />
      {challenge.video_url && (
        <a
          href={challenge.video_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-sage-800 font-medium"
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
          <div className="rounded-2xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-3 py-2 font-medium text-gray-500">User</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Date</th>
                </tr>
              </thead>
              <tbody>
                {attempts.filter(a => a.completed).map((a, i, arr) => (
                  <CompleterRow key={a.id} userId={a.user_id} createdAt={a.created_at} last={i === arr.length - 1} isFirst={i === 0} />
                ))}
              </tbody>
            </table>
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
                className="text-xs text-sage-800 font-medium inline-block"
              >
                ▶ Proof video
              </a>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-3">
          Comments {comments.length > 0 && <span className="text-gray-400 font-normal">({comments.length})</span>}
        </p>
        {comments.length > 0 && (
          <div className="space-y-3 mb-3">
            {comments.map(c => (
              <CommentItem
                key={c.id}
                comment={c}
                currentUserId={currentUserId}
                onDelete={() => deleteComment.mutate({ id: c.id, challengeId: challenge.id }, { onError: () => toast.error('Failed to delete') })}
              />
            ))}
          </div>
        )}
        {comments.length === 0 && (
          <p className="text-sm text-gray-400 mb-3">No comments yet. Be the first!</p>
        )}
        <div className="flex gap-2">
          <input
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAddComment()}
            placeholder="Add a comment…"
            className="flex-1 border rounded-xl px-3 py-2 text-sm"
          />
          <button
            onClick={handleAddComment}
            disabled={!commentText.trim() || addComment.isPending}
            className="bg-sage-700 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
          >
            Post
          </button>
        </div>
      </div>

      <BetaSection challengeId={challenge.id} currentUserId={currentUserId} />

      <button
        onClick={() => setSendOpen(true)}
        className="w-full border border-sage-700 text-sage-800 py-2.5 rounded-xl font-medium text-sm"
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
        className="w-full bg-sage-700 text-white py-3 rounded-xl font-medium disabled:opacity-50"
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
      className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-colors ${
        selected ? 'border-sage-700 bg-gray-50' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-gray-400 font-medium text-sm">
          {profile.avatar_url
            ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            : profile.username?.[0]?.toUpperCase() ?? '?'}
        </div>
        <p className="font-medium text-sm">{profile.username}</p>
      </div>
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
        selected ? 'border-sage-700 bg-sage-700' : 'border-gray-300'
      }`}>
        {selected && <span className="text-white text-xs">✓</span>}
      </div>
    </button>
  )
}

function CommentItem({
  comment,
  currentUserId,
  onDelete,
}: {
  comment: import('../types').ChallengeComment
  currentUserId: string
  onDelete: () => void
}) {
  const { data: profile } = useProfile(comment.user_id)
  const date = new Date(comment.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return (
    <div className="flex gap-2.5">
      <div className="w-7 h-7 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-gray-400 font-medium text-xs flex-shrink-0 mt-0.5">
        {profile?.avatar_url
          ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
          : profile?.username?.[0]?.toUpperCase() ?? '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-gray-800">{profile?.username ?? '…'}</span>
          <span className="text-xs text-gray-400">{date}</span>
          {comment.user_id === currentUserId && (
            <button
              onClick={onDelete}
              className="ml-auto w-6 h-6 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
              title="Delete comment" aria-label="Delete comment"
            >
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
          )}
        </div>
        <p className="text-sm text-gray-700 break-words">{comment.content}</p>
      </div>
    </div>
  )
}

function CompleterRow({ userId, createdAt, last, isFirst }: { userId: string; createdAt: string; last: boolean; isFirst: boolean }) {
  const { data: profile } = useProfile(userId)
  if (!profile) return null
  const date = new Date(createdAt)
  const label = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  return (
    <tr className={last ? '' : 'border-b'}>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-gray-400 font-medium text-xs flex-shrink-0">
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              : profile.username?.[0]?.toUpperCase() ?? '?'}
          </div>
          <span className="text-gray-800">{profile.username}</span>
          {isFirst && <span title="First blood!">🩸</span>}
        </div>
      </td>
      <td className="px-3 py-2.5 text-gray-500">{label}</td>
    </tr>
  )
}

function BetaSection({ challengeId, currentUserId }: { challengeId: string; currentUserId: string }) {
  const { data: betas = [] } = useChallengeBetas(challengeId)
  const addBeta = useAddBeta()
  const deleteBeta = useDeleteBeta()
  const markHelpful = useMarkBetaHelpful()
  const [crux, setCrux] = useState('')
  const [footwork, setFootwork] = useState('')
  const [sequence, setSequence] = useState('')
  const [open, setOpen] = useState(false)

  const handleAdd = () => {
    if (!crux && !footwork && !sequence) return
    addBeta.mutate(
      { challenge_id: challengeId, crux: crux || null, footwork: footwork || null, sequence: sequence || null },
      {
        onSuccess: () => { setCrux(''); setFootwork(''); setSequence(''); setOpen(false); toast.success('Beta shared!') },
        onError: () => toast.error('Failed to share beta'),
      },
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-bold">
          Beta {betas.length > 0 && <span className="text-gray-400 font-normal">({betas.length})</span>}
        </p>
        <button
          onClick={() => setOpen(o => !o)}
          className="text-xs font-semibold text-sage-800 border border-gray-200 rounded-full px-3 py-1"
        >
          {open ? 'Cancel' : '+ Share beta'}
        </button>
      </div>

      {open && (
        <div className="bg-gray-50 rounded-2xl p-3 space-y-2 mb-3">
          <input value={crux} onChange={e => setCrux(e.target.value)} placeholder="Crux move…" className="w-full text-sm border rounded-xl px-3 py-2" />
          <input value={footwork} onChange={e => setFootwork(e.target.value)} placeholder="Key foothold…" className="w-full text-sm border rounded-xl px-3 py-2" />
          <input value={sequence} onChange={e => setSequence(e.target.value)} placeholder="Sequence tip…" className="w-full text-sm border rounded-xl px-3 py-2" />
          <button
            onClick={handleAdd}
            disabled={(!crux && !footwork && !sequence) || addBeta.isPending}
            className="w-full bg-sage-700 text-white py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {addBeta.isPending ? 'Sharing…' : 'Share Beta'}
          </button>
        </div>
      )}

      {betas.length > 0 && (
        <div className="space-y-2">
          {betas.map(beta => {
            const helpfulCount = beta.beta_helpful?.[0]?.count ?? 0
            return (
              <div key={beta.id} className="bg-gray-50 rounded-2xl p-3">
                <BetaAuthor userId={beta.user_id} createdAt={beta.created_at} />
                <div className="mt-1.5 space-y-1">
                  {beta.crux && <p className="text-sm text-gray-700"><span className="text-xs font-semibold text-gray-400 uppercase mr-1">Crux</span>{beta.crux}</p>}
                  {beta.footwork && <p className="text-sm text-gray-700"><span className="text-xs font-semibold text-gray-400 uppercase mr-1">Foot</span>{beta.footwork}</p>}
                  {beta.sequence && <p className="text-sm text-gray-700"><span className="text-xs font-semibold text-gray-400 uppercase mr-1">Seq</span>{beta.sequence}</p>}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => markHelpful.mutate({ betaId: beta.id, challengeId })}
                    className="text-xs text-gray-500 hover:text-sage-800 transition-colors"
                  >
                    👍 Worked for me {helpfulCount > 0 && `(${helpfulCount})`}
                  </button>
                  {beta.user_id === currentUserId && (
                    <button
                      onClick={() => deleteBeta.mutate({ id: beta.id, challengeId })}
                      className="ml-auto w-6 h-6 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function BetaAuthor({ userId, createdAt }: { userId: string; createdAt: string }) {
  const { data: profile } = useProfile(userId)
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-5 h-5 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-gray-400 text-xs">
        {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> : profile?.username?.[0]?.toUpperCase() ?? '?'}
      </div>
      <span className="text-xs font-medium text-gray-600">{profile?.username}</span>
      <span className="text-xs text-gray-400">{new Date(createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
    </div>
  )
}

function SharedProjectsView({ currentUserId }: { currentUserId: string }) {
  const { data: projects = [] } = useSharedProjects()
  const createProject = useCreateSharedProject()
  const deleteProject = useDeleteSharedProject()
  const [selected, setSelected] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [gym, setGym] = useState('')
  const [gradeFont, setGradeFont] = useState('')

  const selectedProject = projects.find(p => p.id === selected) ?? null

  return (
    <div className="space-y-3">
      {projects.length === 0 && (
        <p className="text-gray-400 text-sm text-center pt-8">No shared projects yet. Start one!</p>
      )}
      {projects.map(project => (
        <button
          key={project.id}
          onClick={() => setSelected(project.id)}
          className="w-full text-left bg-white border border-gray-200 rounded-2xl p-4 transition-colors hover:border-gray-300"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-gray-900">{project.title}</p>
              {project.grade_value_font && <p className="text-sm text-gray-500">{project.grade_value_font}</p>}
              {project.gym && <p className="text-xs text-gray-400">{project.gym}</p>}
            </div>
            <ProjectAttemptBadge projectId={project.id} />
          </div>
          {project.description && <p className="text-sm text-gray-500 mt-1">{project.description}</p>}
        </button>
      ))}

      <button
        onClick={() => setCreateOpen(true)}
        className="w-full border-2 border-dashed border-gray-300 rounded-2xl py-4 text-sm text-gray-500 hover:border-sage-700 hover:text-sage-800 transition-colors font-medium"
      >
        + New Shared Project
      </button>

      {createOpen && (
        <BottomSheet open onClose={() => setCreateOpen(false)} title="New Shared Project">
          <div className="space-y-3">
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Problem name" className="w-full border rounded-xl px-3 py-2.5 text-sm" />
            <input value={gradeFont} onChange={e => setGradeFont(e.target.value)} placeholder="Grade (e.g. 7A or V8)" className="w-full border rounded-xl px-3 py-2.5 text-sm" />
            <input value={gym} onChange={e => setGym(e.target.value)} placeholder="Gym (optional)" className="w-full border rounded-xl px-3 py-2.5 text-sm" />
            <button
              onClick={() => createProject.mutate(
                { title, grade_value_font: gradeFont || null, grade_value_vscale: null, board: null, board_angle: null, gym: gym || null, description: null },
                { onSuccess: () => { setCreateOpen(false); setTitle(''); setGradeFont(''); setGym(''); toast.success('Project created!') }, onError: () => toast.error('Failed') }
              )}
              disabled={!title || createProject.isPending}
              className="w-full bg-sage-700 text-white py-3 rounded-xl font-semibold disabled:opacity-50"
            >
              {createProject.isPending ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </BottomSheet>
      )}

      {selectedProject && (
        <BottomSheet open onClose={() => setSelected(null)} title={selectedProject.title}>
          <SharedProjectDetail project={selectedProject} currentUserId={currentUserId} onDelete={() => { deleteProject.mutate(selectedProject.id); setSelected(null) }} />
        </BottomSheet>
      )}
    </div>
  )
}

function ProjectAttemptBadge({ projectId }: { projectId: string }) {
  const { data: attempts = [] } = useProjectAttempts(projectId)
  const total = attempts.length
  const sent = attempts.filter(a => a.sent).length
  if (total === 0) return <span className="text-xs text-gray-300">No attempts</span>
  return (
    <span className="text-xs font-semibold text-gray-600">
      {sent > 0 ? `${sent}/${total} sent` : `${total} attempt${total !== 1 ? 's' : ''}`}
    </span>
  )
}

function SharedProjectDetail({ project, currentUserId, onDelete }: { project: import('../types').SharedProject; currentUserId: string; onDelete: () => void }) {
  const { data: attempts = [] } = useProjectAttempts(project.id)
  const addAttempt = useAddProjectAttempt()
  const { user } = useAuth()

  const myAttempts = attempts.filter(a => a.user_id === user?.id)
  const sends = attempts.filter(a => a.sent)
  const firstSend = sends[0]

  return (
    <div className="space-y-4">
      {project.grade_value_font && <p className="font-semibold text-lg">{project.grade_value_font}</p>}
      {project.gym && <p className="text-sm text-gray-500">{project.gym}</p>}
      {project.description && <p className="text-sm text-gray-600">{project.description}</p>}

      <div className="flex gap-4">
        <div className="text-center"><p className="text-2xl font-bold">{attempts.length}</p><p className="text-xs text-gray-400">Attempts</p></div>
        <div className="text-center"><p className="text-2xl font-bold">{sends.length}</p><p className="text-xs text-gray-400">Sends</p></div>
        <div className="text-center"><p className="text-2xl font-bold">{myAttempts.length}</p><p className="text-xs text-gray-400">Mine</p></div>
      </div>

      {firstSend && (
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-xs text-gray-400 mb-1">First blood 🩸</p>
          <ProjectCompleter userId={firstSend.user_id} createdAt={firstSend.created_at} />
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => addAttempt.mutate({ projectId: project.id, sent: false }, { onSuccess: () => toast.success('Attempt logged') })}
          disabled={addAttempt.isPending}
          className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm font-medium"
        >
          + Attempt
        </button>
        <button
          onClick={() => addAttempt.mutate({ projectId: project.id, sent: true }, { onSuccess: () => toast.success('Send logged! 🎉') })}
          disabled={addAttempt.isPending}
          className="flex-1 bg-sage-700 text-white rounded-xl py-2.5 text-sm font-semibold"
        >
          Sent! 🎉
        </button>
      </div>

      {project.creator_id === currentUserId && (
        <button onClick={onDelete} className="w-full text-xs text-red-500 py-2">Delete project</button>
      )}
    </div>
  )
}

function ProjectCompleter({ userId, createdAt }: { userId: string; createdAt: string }) {
  const { data: profile } = useProfile(userId)
  return (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-xs text-gray-400">
        {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> : profile?.username?.[0]?.toUpperCase() ?? '?'}
      </div>
      <span className="text-sm font-medium">{profile?.username}</span>
      <span className="text-xs text-gray-400 ml-auto">{new Date(createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
    </div>
  )
}
