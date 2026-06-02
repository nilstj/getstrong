import { useAuth } from '../providers/AuthProvider'
import {
  REACTION_EMOJIS,
  useProblemReactions,
  useAddReaction,
  useRemoveReaction,
  useAttemptReactions,
  useAddAttemptReaction,
  useRemoveAttemptReaction,
} from '../hooks/useReactions'

interface ReactionBarProps {
  problemId?: string
  attemptId?: string
  compact?: boolean
}

export function ReactionBar({ problemId, attemptId, compact = false }: ReactionBarProps) {
  const { user } = useAuth()

  const { data: problemReactions = [] } = useProblemReactions(problemId ?? '')
  const { data: attemptReactions = [] } = useAttemptReactions(attemptId ?? '')
  const addProblemReaction = useAddReaction()
  const removeProblemReaction = useRemoveReaction()
  const addAttemptReaction = useAddAttemptReaction()
  const removeAttemptReaction = useRemoveAttemptReaction()

  const reactions = problemId ? problemReactions : attemptReactions

  const counts: Record<string, number> = {}
  const myReacted = new Set<string>()
  for (const r of reactions) {
    counts[r.emoji] = (counts[r.emoji] ?? 0) + 1
    if (r.user_id === user?.id) myReacted.add(r.emoji)
  }

  const toggle = (key: string) => {
    if (!user) return
    if (problemId) {
      if (myReacted.has(key)) {
        removeProblemReaction.mutate({ problem_id: problemId, emoji: key })
      } else {
        addProblemReaction.mutate({ problem_id: problemId, user_id: user.id, emoji: key })
      }
    } else if (attemptId) {
      if (myReacted.has(key)) {
        removeAttemptReaction.mutate({ attempt_id: attemptId, emoji: key })
      } else {
        addAttemptReaction.mutate({ attempt_id: attemptId, user_id: user.id, emoji: key })
      }
    }
  }

  if (compact) {
    const active = REACTION_EMOJIS.filter(r => counts[r.key])
    if (active.length === 0) return null
    return (
      <div className="flex gap-1 mt-1.5 flex-wrap">
        {active.map(r => (
          <button
            key={r.key}
            onClick={() => toggle(r.key)}
            className={`flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full border transition-colors ${
              myReacted.has(r.key)
                ? 'bg-black border-black text-white'
                : 'bg-gray-50 border-gray-200 text-gray-700'
            }`}
          >
            <span>{r.emoji}</span>
            <span className="font-medium">{counts[r.key]}</span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-1.5 mt-2 flex-wrap">
      {REACTION_EMOJIS.map(r => (
        <button
          key={r.key}
          onClick={() => toggle(r.key)}
          title={r.label}
          className={`flex items-center gap-1 text-sm px-2 py-1 rounded-full border transition-colors ${
            myReacted.has(r.key)
              ? 'bg-black border-black text-white'
              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
          }`}
        >
          <span>{r.emoji}</span>
          {counts[r.key] ? <span className="text-xs font-medium">{counts[r.key]}</span> : null}
        </button>
      ))}
    </div>
  )
}
