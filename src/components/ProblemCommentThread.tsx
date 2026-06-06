import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { useProfile } from '../hooks/useProfile'
import type { ProblemComment } from '../hooks/useProblemComments'
import { useProblemComments, usePostProblemComment } from '../hooks/useProblemComments'

function CommentRow({ comment }: { comment: ProblemComment }) {
  const { data: profile } = useProfile(comment.user_id)
  return (
    <div className="flex gap-2">
      <div className="w-5 h-5 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-gray-500 font-medium text-[10px] flex-shrink-0 mt-0.5">
        {profile?.avatar_url
          ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
          : profile?.username?.[0]?.toUpperCase() ?? '?'}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold text-gray-700">{profile?.username ?? '…'}</span>
        <span className="text-[10px] text-gray-400 ml-1">
          {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
        </span>
        <p className="text-xs text-gray-600 mt-0.5 break-words">{comment.body}</p>
      </div>
    </div>
  )
}

interface Props {
  problemId: string
}

export function ProblemCommentThread({ problemId }: Props) {
  const { data: comments = [] } = useProblemComments(problemId)
  const postComment = usePostProblemComment()
  const [text, setText] = useState('')

  const handleSend = () => {
    if (!text.trim()) return
    postComment.mutate(
      { problemId, body: text.trim() },
      { onSuccess: () => setText('') }
    )
  }

  return (
    <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
      {comments.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-1">No trash talk yet. Start something. 🔥</p>
      ) : (
        <div className="space-y-2">
          {comments.map(c => <CommentRow key={c.id} comment={c} />)}
        </div>
      )}
      <div className="flex gap-1.5">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
          }}
          placeholder="Say something… 🔥"
          className="flex-1 text-xs border rounded-lg px-2.5 py-1.5"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || postComment.isPending}
          className="text-xs px-3 py-1.5 bg-sage-700 text-white rounded-lg font-medium disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  )
}
