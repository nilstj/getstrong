import { useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { BottomSheet } from './BottomSheet'
import { useProfile } from '../hooks/useProfile'
import type { WallAnnouncement, WallJoin } from '../hooks/useWallAnnouncements'
import {
  useJoinAnnouncement, useUnjoinAnnouncement, useMyJoins,
  useAnnouncementJoiners,
} from '../hooks/useWallAnnouncements'
import type { WallComment } from '../hooks/useWallComments'
import { useAnnouncementComments, usePostComment } from '../hooks/useWallComments'

function JoinerRow({ join }: { join: WallJoin }) {
  const { data: profile } = useProfile(join.user_id)
  if (!profile) return null
  return (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-gray-500 font-medium text-xs flex-shrink-0">
        {profile.avatar_url
          ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
          : profile.username?.[0]?.toUpperCase() ?? '?'}
      </div>
      <span className="text-sm text-gray-700">{profile.username}</span>
    </div>
  )
}

function CommentRow({ comment }: { comment: WallComment }) {
  const { data: profile } = useProfile(comment.user_id)
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-gray-700">{profile?.username ?? '…'}</span>
        <span className="text-[10px] text-gray-400">
          {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
        </span>
      </div>
      <p className="text-sm text-gray-600">{comment.body}</p>
    </div>
  )
}

interface Props {
  announcement: WallAnnouncement
  onClose: () => void
}

export function WallAnnouncementSheet({ announcement, onClose }: Props) {
  const { data: authorProfile } = useProfile(announcement.user_id)
  const { data: joiners = [] } = useAnnouncementJoiners(announcement.id)
  const { data: comments = [] } = useAnnouncementComments(announcement.id)
  const { data: myJoins = new Set<string>() } = useMyJoins()
  const joinAnnouncement = useJoinAnnouncement()
  const unjoinAnnouncement = useUnjoinAnnouncement()
  const postComment = usePostComment()
  const [commentText, setCommentText] = useState('')

  const hasJoined = myJoins.has(announcement.id)
  const isPlanned = new Date(announcement.starts_at) > new Date()
  const title = `${authorProfile?.username ?? '…'} · ${announcement.location}`

  const handleSend = () => {
    if (!commentText.trim()) return
    postComment.mutate(
      { announcementId: announcement.id, body: commentText.trim() },
      { onSuccess: () => setCommentText('') }
    )
  }

  return (
    <BottomSheet open onClose={onClose} title={title}>
      <div className="space-y-5">
        {isPlanned && (
          <p className="text-sm text-sage-700 font-medium">
            📅 {format(new Date(announcement.starts_at), 'EEEE d MMM, HH:mm')}
          </p>
        )}

        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Joining</p>
          {joiners.length === 0 ? (
            <p className="text-sm text-gray-400">No one joining yet.</p>
          ) : (
            <div className="space-y-2">
              {joiners.map(j => <JoinerRow key={j.id} join={j} />)}
            </div>
          )}
        </div>

        <button
          onClick={() => {
            if (hasJoined) {
              unjoinAnnouncement.mutate(announcement.id)
            } else {
              joinAnnouncement.mutate(announcement.id)
            }
          }}
          disabled={joinAnnouncement.isPending || unjoinAnnouncement.isPending}
          className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
            hasJoined ? 'bg-sage-100 text-sage-700' : 'bg-sage-700 text-white'
          }`}
        >
          {hasJoined ? "✓ I'll be there" : "I'll be there too 🧗"}
        </button>

        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Comments</p>
          {comments.length === 0 ? (
            <p className="text-sm text-gray-400">No comments yet.</p>
          ) : (
            <div className="space-y-3">
              {comments.map(c => <CommentRow key={c.id} comment={c} />)}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <input
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
            }}
            placeholder="Add a comment…"
            className="flex-1 border rounded-xl px-3 py-2 text-sm"
          />
          <button
            onClick={handleSend}
            disabled={!commentText.trim() || postComment.isPending}
            className="px-4 py-2 bg-sage-700 text-white rounded-xl text-sm font-medium disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
