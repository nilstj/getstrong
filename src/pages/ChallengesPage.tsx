import { useState, useMemo } from 'react'
import { Pencil, Trash2, Globe, Lock, ChevronDown, ChevronUp, Search, X } from 'lucide-react'
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
import { useFollowing } from '../hooks/useFollows'
import { useChallengeTags } from '../hooks/useChallengeTags'
import { useProfile } from '../hooks/useProfile'
import { BottomSheet } from '../components/BottomSheet'
import { FAB } from '../components/FAB'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { useAuth } from '../providers/AuthProvider'
import type { Challenge } from '../types'

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
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<Challenge | null>(null)
  const [editing, setEditing] = useState<Challenge | null>(null)
  const [publicOpen, setPublicOpen] = useState(true)
  const [privateOpen, setPrivateOpen] = useState(true)
  const [query, setQuery] = useState('')

  const isAdmin = profile?.is_admin ?? false

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    return challenges.filter(c =>
      c.title.toLowerCase().includes(q) ||
      (c.description ?? '').toLowerCase().includes(q) ||
      (c.tags ?? []).some(t => t.toLowerCase().includes(q))
    )
  }, [challenges, query])

  const publicChallenges = challenges.filter(c => c.is_public)
  const privateChallenges = challenges.filter(c => !c.is_public)

  if (isLoading) return <div className="p-4 text-gray-500">Loading...</div>

  const renderChallengeCard = (challenge: Challenge, showBadge = false) => (
    <div key={challenge.id} className="relative flex items-stretch">
      <button
        onClick={() => setSelected(challenge)}
        className="flex-1 text-left bg-white border rounded-2xl px-3 py-2.5 hover:border-gray-300 transition-colors min-w-0"
      >
        <div className="flex items-start gap-2 pr-16">
          <p className="font-semibold text-sm text-gray-900 leading-snug">{challenge.title}</p>
        </div>
        {challenge.description && (
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{challenge.description}</p>
        )}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {showBadge && (
            challenge.is_public
              ? <span className="flex items-center gap-0.5 text-[10px] text-sage-700 font-medium"><Globe size={10} strokeWidth={2} />Public</span>
              : <span className="flex items-center gap-0.5 text-[10px] text-gray-400 font-medium"><Lock size={10} strokeWidth={2} />Friends</span>
          )}
          {challenge.tags?.map(tag => (
            <span key={tag} className="text-[11px] bg-gray-50 text-sage-800 border border-gray-200 rounded-full px-1.5 py-px">{tag}</span>
          ))}
          <AttemptCountInline challengeId={challenge.id} />
        </div>
      </button>
      <div className="absolute top-1.5 right-1.5 flex gap-0.5">
        {challenge.creator_id === user?.id && (
          <button
            onClick={e => { e.stopPropagation(); setEditing(challenge) }}
            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Edit challenge" aria-label="Edit challenge"
          >
            <Pencil size={14} strokeWidth={1.75} />
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
            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Delete challenge" aria-label="Delete challenge"
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="p-4 pb-28 space-y-3">
      <h1 className="text-2xl font-black tracking-tight">Challenges</h1>

      {/* Search */}
      <div className="relative">
        <Search size={15} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search challenges…"
          className="w-full bg-white border border-gray-200 rounded-xl pl-8 pr-8 py-2.5 text-sm focus:outline-none focus:border-sage-500"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={14} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Search results */}
      {filtered !== null && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {filtered.length === 0 ? 'No results' : `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`}
            </span>
          </div>
          {filtered.length > 0 && (
            <div className="px-2 py-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {filtered.map(c => renderChallengeCard(c, true))}
            </div>
          )}
        </div>
      )}

      {filtered === null && received.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sent to me</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {received.map(inv => (
              <button
                key={inv.id}
                onClick={() => setSelected(inv.challenges)}
                className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors"
              >
                <p className="font-semibold text-sm text-gray-900">{inv.challenges.title}</p>
                <p className="text-xs text-gray-400">from {inv.profiles?.username ?? 'someone'}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {filtered === null && <>
          {/* Public challenges section */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <button
              onClick={() => setPublicOpen(o => !o)}
              className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <Globe size={13} strokeWidth={1.75} className="text-sage-700" />
                <span className="text-sm font-semibold text-sage-900">Public</span>
                <span className="text-xs text-gray-400 font-normal">({publicChallenges.length})</span>
              </div>
              {publicOpen
                ? <ChevronUp size={15} strokeWidth={1.75} className="text-gray-400" />
                : <ChevronDown size={15} strokeWidth={1.75} className="text-gray-400" />}
            </button>
            {publicOpen && (
              <div className="border-t border-gray-100 px-2 py-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {publicChallenges.length === 0
                  ? <p className="text-gray-400 text-xs text-center py-3">No public challenges yet. Tap + to create one.</p>
                  : publicChallenges.map(c => renderChallengeCard(c))}
              </div>
            )}
          </div>

          {/* Friends & mine section */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <button
              onClick={() => setPrivateOpen(o => !o)}
              className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <Lock size={13} strokeWidth={1.75} className="text-gray-500" />
                <span className="text-sm font-semibold text-gray-700">Friends &amp; Mine</span>
                <span className="text-xs text-gray-400 font-normal">({privateChallenges.length})</span>
              </div>
              {privateOpen
                ? <ChevronUp size={15} strokeWidth={1.75} className="text-gray-400" />
                : <ChevronDown size={15} strokeWidth={1.75} className="text-gray-400" />}
            </button>
            {privateOpen && (
              <div className="border-t border-gray-100 px-2 py-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {privateChallenges.length === 0
                  ? <p className="text-gray-400 text-xs text-center py-3">No private challenges yet.</p>
                  : privateChallenges.map(c => renderChallengeCard(c))}
              </div>
            )}
          </div>
      </>}

      <FAB onClick={() => setCreateOpen(true)} label="Create challenge" />

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

function AttemptCountInline({ challengeId }: { challengeId: string }) {
  const { data: attempts = [] } = useChallengeAttempts(challengeId)
  if (attempts.length === 0) return null
  const completed = attempts.filter(a => a.completed).length
  return (
    <span className="text-[11px] text-gray-400">
      {attempts.length} attempt{attempts.length !== 1 ? 's' : ''}{completed > 0 ? ` · ${completed} ✓` : ''}
    </span>
  )
}

function ChallengeForm({ existing, onClose }: { existing?: Challenge; onClose: () => void }) {
  const createChallenge = useCreateChallenge()
  const updateChallenge = useUpdateChallenge()
  const { data: availableTags = [] } = useChallengeTags()
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
          {availableTags.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleTag(t.name)}
              className={`text-sm px-3 py-1.5 rounded-full border font-medium transition-colors ${
                tags.includes(t.name)
                  ? 'bg-sage-700 border-sage-700 text-white'
                  : 'bg-white border-gray-300 text-gray-600'
              }`}
            >
              {t.name}
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

