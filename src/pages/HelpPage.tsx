import { useState } from 'react'
import { LifeBuoy, Play, Users, Globe, Check, MessageSquare, ChevronUp, ChevronDown, Trophy } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'
import { useAuth } from '../providers/AuthProvider'
import { VideoBadge } from '../components/VideoBadge'
import { useProfile } from '../hooks/useProfile'
import {
  useHelpRequests,
  useResolvedHelpRequests,
  useHelpResponses,
  useAddHelpResponse,
  useMarkResponseHelpful,
  useResolveHelpRequest,
  useAddReplyToResponse,
} from '../hooks/useHelp'
import type { HelpRequestWithProblem } from '../hooks/useHelp'
import type { HelpResponse } from '../types'

export function HelpPage() {
  const { data: requests = [], isLoading } = useHelpRequests()
  const { data: resolved = [] } = useResolvedHelpRequests()
  const [globalOpen, setGlobalOpen] = useState(true)
  const [friendsOpen, setFriendsOpen] = useState(true)
  const [resolvedOpen, setResolvedOpen] = useState(false)

  const globalRequests = requests.filter(r => r.visibility === 'global')
  const friendsRequests = requests.filter(r => r.visibility === 'friends')

  return (
    <div className="p-4 space-y-4 pb-28">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <LifeBuoy size={20} strokeWidth={1.75} /> Beta Requests
        </h1>
        <p className="text-sm text-gray-500 mt-1">Help climbers crack their projects. Helpful beta earns badges.</p>
      </div>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : (
        <>
          {/* Everyone section */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <button
              onClick={() => setGlobalOpen(o => !o)}
              className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <Globe size={13} strokeWidth={1.75} className="text-sage-700" />
                <span className="text-sm font-semibold text-sage-900">Everyone</span>
                <span className="text-xs text-gray-400 font-normal">({globalRequests.length})</span>
              </div>
              {globalOpen
                ? <ChevronUp size={15} strokeWidth={1.75} className="text-gray-400" />
                : <ChevronDown size={15} strokeWidth={1.75} className="text-gray-400" />}
            </button>
            {globalOpen && (
              <div className="border-t border-gray-100 px-2 py-2 space-y-2">
                {globalRequests.length === 0
                  ? <p className="text-gray-400 text-xs text-center py-3">No public beta requests right now.</p>
                  : globalRequests.map(r => <RequestCard key={r.id} request={r} />)}
              </div>
            )}
          </div>

          {/* Friends section */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <button
              onClick={() => setFriendsOpen(o => !o)}
              className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <Users size={13} strokeWidth={1.75} className="text-gray-500" />
                <span className="text-sm font-semibold text-gray-700">Friends</span>
                <span className="text-xs text-gray-400 font-normal">({friendsRequests.length})</span>
              </div>
              {friendsOpen
                ? <ChevronUp size={15} strokeWidth={1.75} className="text-gray-400" />
                : <ChevronDown size={15} strokeWidth={1.75} className="text-gray-400" />}
            </button>
            {friendsOpen && (
              <div className="border-t border-gray-100 px-2 py-2 space-y-2">
                {friendsRequests.length === 0
                  ? <p className="text-gray-400 text-xs text-center py-3">No beta requests from friends right now.</p>
                  : friendsRequests.map(r => <RequestCard key={r.id} request={r} />)}
              </div>
            )}
          </div>

          {/* Resolved section */}
          {resolved.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <button
                onClick={() => setResolvedOpen(o => !o)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <Check size={13} strokeWidth={1.75} className="text-green-600" />
                  <span className="text-sm font-semibold text-gray-500">Resolved</span>
                  <span className="text-xs text-gray-400 font-normal">({resolved.length})</span>
                </div>
                {resolvedOpen
                  ? <ChevronUp size={15} strokeWidth={1.75} className="text-gray-400" />
                  : <ChevronDown size={15} strokeWidth={1.75} className="text-gray-400" />}
              </button>
              {resolvedOpen && (
                <div className="border-t border-gray-100 px-2 py-2 space-y-2">
                  {resolved.map(r => <RequestCard key={r.id} request={r} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function RequestCard({ request }: { request: HelpRequestWithProblem }) {
  const { user } = useAuth()
  const { data: asker } = useProfile(request.user_id)
  const [expanded, setExpanded] = useState(false)
  const resolve = useResolveHelpRequest()

  const isAsker = user?.id === request.user_id
  const p = request.problems
  const grade = p?.grade_value_font ?? p?.grade_value_vscale ?? p?.color ?? '—'
  const location = p?.sessions?.location
  const responseCount = request.help_responses?.[0]?.count ?? 0

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-3">
      <div className="flex items-start gap-3">
        <div className="relative flex-shrink-0">
          {p?.image_url ? (
            <img src={p.image_url} alt="" className="w-16 h-16 object-cover rounded-xl" />
          ) : p?.beta_video_url ? (
            <a href={p.beta_video_url} target="_blank" rel="noopener noreferrer"
              className="w-16 h-16 rounded-xl bg-gray-800 flex items-center justify-center">
              <Play className="w-6 h-6 text-white fill-white ml-0.5" />
            </a>
          ) : (
            <div className="w-16 h-16 rounded-xl bg-gray-100" />
          )}
          {p?.beta_video_url && p?.image_url && <VideoBadge href={p.beta_video_url} />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900">{p?.name ?? grade}</span>
            {p?.name && <span className="text-sm text-gray-400">{grade}</span>}
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-gray-400 font-medium">
              {request.visibility === 'global' ? <><Globe size={11} /> Everyone</> : <><Users size={11} /> Friends</>}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            <span className="font-medium text-gray-500">{isAsker ? 'You' : asker?.username ?? '…'}</span>
            {p?.board ? ` · ${p.board}` : ''}{location ? ` · ${location}` : ''}
            {' · '}{formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
          </p>
          {request.message && <p className="text-sm text-gray-700 mt-1">{request.message}</p>}

          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-xs font-medium text-sage-700 hover:text-sage-900 flex items-center gap-1"
            >
              <MessageSquare size={13} strokeWidth={2} />
              {responseCount > 0 ? `${responseCount} response${responseCount !== 1 ? 's' : ''}` : 'Add beta'}
            </button>
            {request.bounty > 0 && (
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                request.bounty_awarded ? 'bg-gray-100 text-gray-400' : 'bg-amber-100 text-amber-700'
              }`}>
                <Trophy size={11} strokeWidth={2} /> {request.bounty}{request.bounty_awarded ? ' awarded' : ''}
              </span>
            )}
            {isAsker && !request.resolved && (
              <button
                onClick={() => resolve.mutate(request.id, { onSuccess: () => toast.success('Resolved'), onError: () => toast.error('Failed') })}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
              >
                <Check size={13} strokeWidth={2} /> Resolve
              </button>
            )}
          </div>
        </div>
      </div>

      {expanded && <Responses request={request} isAsker={isAsker} />}
    </div>
  )
}

function Responses({ request, isAsker }: { request: HelpRequestWithProblem; isAsker: boolean }) {
  const { data: responses = [] } = useHelpResponses(request.id)
  const add = useAddHelpResponse()
  const [body, setBody] = useState('')
  const [videoUrl, setVideoUrl] = useState('')

  const submit = () => {
    if (!body.trim()) return
    add.mutate(
      { requestId: request.id, body: body.trim(), videoUrl: videoUrl.trim() || null },
      { onSuccess: () => { setBody(''); setVideoUrl('') }, onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed') },
    )
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
      {responses.length === 0 ? (
        <p className="text-xs text-gray-400 text-center">No beta yet. Be the first to help. 🤲</p>
      ) : (
        responses.map(r => <ResponseRow key={r.id} response={r} requestId={request.id} isAsker={isAsker} />)
      )}

      {!isAsker && (
        <div className="space-y-2">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Share your beta…"
            rows={2}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
          />
          <div className="flex gap-1.5">
            <input
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              placeholder="Beta video link (optional)"
              className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5"
            />
            <button
              onClick={submit}
              disabled={!body.trim() || add.isPending}
              className="text-xs px-3 py-1.5 bg-sage-700 text-white rounded-lg font-medium disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ResponseRow({ response, requestId, isAsker }: { response: HelpResponse; requestId: string; isAsker: boolean }) {
  const { data: helper } = useProfile(response.user_id)
  const mark = useMarkResponseHelpful()
  const addReply = useAddReplyToResponse()
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState('')

  const submitReply = () => {
    if (!replyText.trim()) return
    addReply.mutate(
      { id: response.id, requestId, reply: replyText.trim() },
      {
        onSuccess: () => { setReplyText(''); setReplyOpen(false) },
        onError: () => toast.error('Failed to save reply'),
      },
    )
  }

  return (
    <div className={`rounded-xl p-2.5 ${response.helpful ? 'bg-sage-50 border border-sage-200' : 'bg-gray-50'}`}>
      <div className="flex gap-2">
        <div className="w-5 h-5 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-gray-500 font-medium text-[10px] flex-shrink-0 mt-0.5">
          {helper?.avatar_url
            ? <img src={helper.avatar_url} alt="" className="w-full h-full object-cover" />
            : helper?.username?.[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-gray-700">{helper?.username ?? '…'}</span>
            {response.helpful && <span className="text-[10px] text-sage-700 font-semibold">✓ Helpful</span>}
          </div>
          <p className="text-xs text-gray-600 mt-0.5 break-words">{response.body}</p>
          {response.video_url && (
            <a href={response.video_url} target="_blank" rel="noopener noreferrer"
              className="text-[11px] text-sage-700 font-medium mt-0.5 inline-block">▶ Beta video</a>
          )}

          {/* Existing reply */}
          {response.reply && (
            <div className="mt-1.5 pl-2 border-l-2 border-gray-300">
              <p className="text-[11px] text-gray-500 italic break-words">{response.reply}</p>
            </div>
          )}

          {/* Asker reply controls */}
          {isAsker && !replyOpen && (
            <button
              onClick={() => { setReplyText(response.reply ?? ''); setReplyOpen(true) }}
              className="text-[11px] text-gray-400 hover:text-gray-600 mt-1 inline-block"
            >
              {response.reply ? 'Edit reply' : 'Reply'}
            </button>
          )}
          {isAsker && replyOpen && (
            <div className="mt-1.5 flex gap-1.5">
              <input
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder="Your reply…"
                autoFocus
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1"
                onKeyDown={e => { if (e.key === 'Enter') submitReply(); if (e.key === 'Escape') setReplyOpen(false) }}
              />
              <button
                onClick={submitReply}
                disabled={!replyText.trim() || addReply.isPending}
                className="text-xs px-2.5 py-1 bg-sage-700 text-white rounded-lg font-medium disabled:opacity-50"
              >
                Save
              </button>
              <button onClick={() => setReplyOpen(false)} className="text-xs text-gray-400 hover:text-gray-600 px-1">✕</button>
            </div>
          )}
        </div>
        {isAsker && (
          <button
            onClick={() => mark.mutate(
              { id: response.id, requestId, helpful: !response.helpful },
              { onError: () => toast.error('Failed') },
            )}
            className={`text-[11px] px-2 py-1 rounded-full font-medium flex-shrink-0 h-fit transition-colors ${
              response.helpful ? 'bg-sage-700 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            }`}
          >
            {response.helpful ? 'Helpful ✓' : 'Mark helpful'}
          </button>
        )}
      </div>
    </div>
  )
}
