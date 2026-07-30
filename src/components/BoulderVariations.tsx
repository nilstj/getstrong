import { useState } from 'react'
import { Plus, Play } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../providers/AuthProvider'
import { BottomSheet } from './BottomSheet'
import { Chip } from './Chip'
import { useChallengeTags } from '../hooks/useChallengeTags'
import { useProfile } from '../hooks/useProfile'
import { FONT_GRADES_ORDERED, V_GRADES } from '../utils/grades'
import { gradeDelta } from '../utils/gradeDelta'
import {
  useVariations, useCanSetVariation, useCreateVariation, useClearVariation, useUpdateVariationGrade,
  type Variation,
} from '../hooks/useVariations'

/**
 * Variations on a shared boulder: the same wall with altered rules. Rendered
 * under the boulder page's own Variations tab, because a variation is beta
 * with a constraint. Compact by design — that page is a hero screen.
 */
export function BoulderVariations({ gymProblemId, readOnly = false, boulderGrade }: {
  gymProblemId: string
  readOnly?: boolean
  boulderGrade: string | null
}) {
  const { data: variations = [], isError } = useVariations(gymProblemId)
  const { data: canSet = false } = useCanSetVariation(gymProblemId)
  const [newVariationOpen, setNewVariationOpen] = useState(false)
  const [selected, setSelected] = useState<Variation | null>(null)

  // Migration 076 may not be applied yet, in which case the query above throws
  // (gym_problem_id doesn't exist). Disappearing beats showing a "Set a
  // variation" button that always fails — the boulder page is a hero screen and
  // must stay clean if the client ships ahead of the migration.
  if (isError) return null

  if (readOnly && variations.length === 0) return null

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3">
      {!readOnly && canSet && (
        <div className="flex justify-end">
          <button type="button" onClick={() => setNewVariationOpen(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-sage-700">
            <Plus size={13} strokeWidth={2.5} /> Set a variation
          </button>
        </div>
      )}

      {variations.length === 0 ? (
        <p className="mt-1.5 text-xs text-gray-400">
          {canSet
            ? 'None yet — same boulder, different rules. Set one.'
            : 'None yet. Send it first, then you can set one.'}
        </p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {variations.map(v => {
            const delta = gradeDelta(boulderGrade, v.grade)
            return (
              <button key={v.id} type="button" onClick={() => setSelected(v)}
                className="w-full text-left rounded-xl bg-gray-50 px-2.5 py-2 hover:bg-gray-100">
                <div className="flex items-start gap-1.5">
                  <p className="flex-1 text-sm font-medium text-gray-800 leading-snug">{v.title}</p>
                  {v.grade && <Chip label={v.grade} variant="grade" className="flex-shrink-0" />}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[11px] text-gray-400 truncate">
                    {v.creator_name ?? 'Someone'}
                  </span>
                  {delta && <span className="text-[11px] text-gray-400 truncate">{delta}</span>}
                  {v.clears.length > 0 && (
                    <>
                      <div className="flex -space-x-1.5">
                        {v.clears.slice(0, 5).map(c => (
                          <span key={c.user_id} title={c.username ?? ''}
                            className="w-5 h-5 rounded-full bg-sage-100 border-2 border-gray-50 grid place-items-center text-[8px] font-semibold text-sage-700 overflow-hidden">
                            {c.avatar_url
                              ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" />
                              : (c.username ?? '?').slice(0, 1).toUpperCase()}
                          </span>
                        ))}
                      </div>
                      <span className="text-[11px] text-gray-500">{v.clears.length} cleared</span>
                    </>
                  )}
                  {v.video_url && <Play size={11} fill="currentColor" className="text-sage-700" />}
                </div>
              </button>
            )
          })}
        </div>
      )}

      <SetVariationSheet open={newVariationOpen} onClose={() => setNewVariationOpen(false)} gymProblemId={gymProblemId} boulderGrade={boulderGrade} />
      <VariationSheet key={selected?.id ?? 'none'} variation={selected} onClose={() => setSelected(null)} gymProblemId={gymProblemId} readOnly={readOnly} boulderGrade={boulderGrade} />
    </div>
  )
}

/** Detail: the constraint, the demo clip, and everyone's clears. */
function VariationSheet({ variation, onClose, gymProblemId, readOnly, boulderGrade }: {
  variation: Variation | null
  onClose: () => void
  gymProblemId: string
  readOnly: boolean
  boulderGrade: string | null
}) {
  const { user } = useAuth()
  const clear = useClearVariation()
  const [video, setVideo] = useState('')
  const { data: profile } = useProfile()
  const grades = profile?.grade_preference === 'v_scale' ? V_GRADES : FONT_GRADES_ORDERED
  const updateGrade = useUpdateVariationGrade()
  const [gradeDraft, setGradeDraft] = useState(variation?.grade ?? '')

  if (!variation) return null
  const mine = variation.clears.find(c => c.user_id === user?.id)
  const isCreator = !!user?.id && variation.creator_id === user.id
  const delta = gradeDelta(boulderGrade, variation.grade)

  const saveGrade = () => {
    updateGrade.mutate(
      { challengeId: variation.id, gymProblemId, grade: gradeDraft || null },
      {
        onSuccess: () => toast.success('Grade updated'),
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not save the grade'),
      },
    )
  }

  const submit = () => {
    clear.mutate(
      { challengeId: variation.id, gymProblemId, videoUrl: video.trim() || null },
      {
        onSuccess: () => {
          toast.success(video.trim() ? 'Cleared — nice 🧩' : 'Cleared. Only clears with a clip earn points.')
          setVideo('')
          onClose()
        },
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not save'),
      },
    )
  }

  return (
    <BottomSheet open onClose={onClose} title="Variation">
      <div className="space-y-4">
        <div>
          <p className="font-semibold text-gray-900">{variation.title}</p>
          {variation.description && <p className="mt-1 text-sm text-gray-600">{variation.description}</p>}
          {variation.grade && (
            <div className="mt-1.5 flex items-center gap-2">
              <Chip label={variation.grade} variant="grade" />
              {delta && <span className="text-xs text-gray-500">{delta}</span>}
            </div>
          )}
          <p className="mt-1 text-xs text-gray-400">set by {variation.creator_name ?? 'someone'}</p>
          {variation.video_url && (
            <a href={variation.video_url} target="_blank" rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-sage-700">
              <Play size={13} fill="currentColor" /> Watch the demo
            </a>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
            Cleared it ({variation.clears.length})
          </p>
          {variation.clears.length === 0 ? (
            <p className="text-xs text-gray-400">Nobody yet. Be first.</p>
          ) : (
            <div className="space-y-1.5">
              {variation.clears.map(c => (
                <div key={c.user_id} className="flex items-center gap-2 text-sm">
                  <span className="w-6 h-6 rounded-full bg-sage-100 grid place-items-center text-[10px] font-semibold text-sage-700 overflow-hidden flex-shrink-0">
                    {c.avatar_url
                      ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" />
                      : (c.username ?? '?').slice(0, 1).toUpperCase()}
                  </span>
                  <span className="flex-1 truncate text-gray-800">{c.username ?? 'Someone'}</span>
                  {c.video_url && (
                    <a href={c.video_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-xs font-medium text-sage-700">
                      <Play size={11} fill="currentColor" /> clip
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {!readOnly && (
          isCreator ? (
            // The setter can't earn from clearing their own variation — the
            // trigger pays nothing and notifies nobody for that. Don't show them
            // a form that promises otherwise; tell them what actually pays.
            <div>
              <p className="text-xs text-gray-500">
                This is your variation. Points land when someone else clears it with a clip.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <select value={gradeDraft} onChange={e => setGradeDraft(e.target.value)}
                  className="flex-1 border rounded-lg px-2.5 py-2 text-sm">
                  <option value="">No grade</option>
                  {grades.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <button type="button" onClick={saveGrade} disabled={updateGrade.isPending}
                  className="rounded-lg bg-sage-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {updateGrade.isPending ? 'Saving…' : 'Save grade'}
                </button>
              </div>
            </div>
          ) : mine && mine.video_url ? (
            <p className="text-xs text-sage-700 font-medium">You've cleared this one ✓</p>
          ) : (
            <div className="space-y-2 rounded-xl border border-gray-200 p-2.5">
              {mine && (
                <p className="text-xs text-gray-500">
                  You've ticked this. Only clears with a clip earn points.
                </p>
              )}
              <input value={video} onChange={e => setVideo(e.target.value)}
                placeholder="Video of your clear (optional link)"
                className="w-full text-xs text-gray-700 focus:outline-none placeholder:text-gray-400" />
              <button type="button" onClick={submit} disabled={clear.isPending}
                className="w-full rounded-xl bg-sage-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {clear.isPending ? 'Saving…' : mine ? 'Add my clip' : 'I cleared it'}
              </button>
            </div>
          )
        )}
      </div>
    </BottomSheet>
  )
}

/** Set one. Only reachable if you've sent the boulder; RLS enforces the same rule. */
function SetVariationSheet({ open, onClose, gymProblemId, boulderGrade }: {
  open: boolean
  onClose: () => void
  gymProblemId: string
  boulderGrade: string | null
}) {
  const create = useCreateVariation()
  const { data: tags = [] } = useChallengeTags()
  const { data: profile } = useProfile()
  const grades = profile?.grade_preference === 'v_scale' ? V_GRADES : FONT_GRADES_ORDERED
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [video, setVideo] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [grade, setGrade] = useState('')

  const toggle = (name: string) =>
    setPicked(prev => prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name])

  const submit = () => {
    const t = title.trim()
    if (!t) { toast.error('What are the rules?'); return }
    create.mutate(
      {
        gymProblemId,
        title: t,
        description: detail.trim() || null,
        videoUrl: video.trim() || null,
        tags: picked,
        grade: grade || null,
      },
      {
        onSuccess: () => {
          toast.success('Variation set 🧩')
          setTitle(''); setDetail(''); setVideo(''); setPicked([]); setGrade('')
          onClose()
        },
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not set it'),
      },
    )
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Set a variation">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">The rules</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. no heel hook on the arête"
            className="w-full border rounded-lg px-3 py-2.5" />
          <p className="mt-1 text-xs text-gray-400">Same boulder, harder rules. Keep it one line.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Detail (optional)</label>
          <input value={detail} onChange={e => setDetail(e.target.value)}
            placeholder="e.g. the crimp is off, everything else is on"
            className="w-full border rounded-lg px-3 py-2.5" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Grade (optional)</label>
          <select value={grade} onChange={e => setGrade(e.target.value)}
            className="w-full border rounded-lg px-3 py-2.5">
            <option value="">No grade</option>
            {grades.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <p className="mt-1 text-xs text-gray-400">
            {boulderGrade
              ? `Harder or softer than the boulder's ${boulderGrade}? Say so.`
              : 'Grade the variation itself, if you can.'}
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Demo video (optional link)</label>
          <input value={video} onChange={e => setVideo(e.target.value)}
            placeholder="Show how it goes"
            className="w-full border rounded-lg px-3 py-2.5" />
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map(t => (
              <button key={t.id} type="button" onClick={() => toggle(t.name)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  picked.includes(t.name) ? 'bg-sage-700 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                {t.name}
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={submit} disabled={!title.trim() || create.isPending}
          className="w-full bg-sage-700 text-white py-3 rounded-xl font-semibold disabled:opacity-50">
          {create.isPending ? 'Setting…' : 'Set variation'}
        </button>
      </div>
    </BottomSheet>
  )
}
