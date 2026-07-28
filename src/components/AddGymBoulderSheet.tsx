import { useState, useRef } from 'react'
import { Camera, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { BottomSheet } from './BottomSheet'
import { TapeGraphic, HoldGraphic } from './Chip'
import { GymInput } from './GymInput'
import { useAuth } from '../providers/AuthProvider'
import { useProfile } from '../hooks/useProfile'
import { useGymGradings } from '../hooks/useGymGradings'
import { useGymSuggestions } from '../hooks/useGymSuggestions'
import { useCreateGymProblem } from '../hooks/useGymProblems'
import { HOLD_COLORS } from '../utils/holdColors'
import { FONT_GRADES_ORDERED, V_GRADES } from '../utils/grades'
import { supabase } from '../lib/supabase'

// Copied verbatim from ProblemForm so the two forms are visually identical.
const INPUT = 'w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500'
const PILL = 'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors'
const PILL_ON = 'border-sage-700 bg-sage-700 text-white'
const PILL_OFF = 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'

/** Row label in the compact two-column layout the problem form uses. */
function RowLabel({ children }: { children: React.ReactNode }) {
  return <span className="pt-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">{children}</span>
}

/**
 * Publishes a shared boulder straight to a gym — no session, no private problem,
 * no claim. The publisher is recorded as created_by and earns first_logger; they
 * join the sendtrain later by logging a send like anyone else.
 */
export function AddGymBoulderSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const { data: gymSuggestions = [] } = useGymSuggestions()
  const create = useCreateGymProblem()

  const defaultGyms = profile?.default_gyms ?? []
  const [gym, setGym] = useState('')
  const [grade, setGrade] = useState('')
  const [color, setColor] = useState('')
  const [holdColor, setHoldColor] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // The gym drives which grading colours exist, so it has to be chosen first.
  const effectiveGym = gym || defaultGyms[0] || ''
  // Query is disabled while the sheet is closed — it's mounted for the whole
  // /gym-problems page, so it must not fire until someone actually opens it.
  const { data: gymGradings = [] } = useGymGradings(open && effectiveGym ? effectiveGym : null)
  const grades = profile?.grade_preference === 'v_scale' ? V_GRADES : FONT_GRADES_ORDERED

  // Snap a typed gym to its known spelling (case-insensitively) so the boulder
  // lands under the same gym string everyone else's discover feed filters on.
  // No match (a genuinely new gym) just publishes what was typed.
  const resolveGym = (typed: string): string => {
    const trimmed = typed.trim()
    const known = [...defaultGyms, ...gymSuggestions.map(s => s.name)]
    return known.find(k => k.toLowerCase() === trimmed.toLowerCase()) ?? trimmed
  }

  const clearFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const reset = () => {
    setGym(''); setGrade(''); setColor(''); setHoldColor('')
    setFile(null); setPreviewUrl(null)
    clearFileInput()
  }

  const close = () => { reset(); onClose() }

  const pickFile = (f: File | null) => {
    setFile(f)
    setPreviewUrl(f ? URL.createObjectURL(f) : null)
    if (!f) clearFileInput()
  }

  const submit = async () => {
    if (!effectiveGym) return

    let image_url: string | null = null
    if (file && user) {
      setUploading(true)
      try {
        const ext = file.name.split('.').pop() ?? 'jpg'
        const path = `${user.id}/${Date.now()}.${ext}`
        const { error } = await supabase.storage.from('problem-images').upload(path, file, { upsert: true })
        if (error) {
          // No repair path for a failed photo upload — the boulder would
          // publish without its image_url and could never earn first_logger
          // points for a photo. Abort and let the user retry with the sheet
          // (and their other fields) intact rather than silently publishing.
          toast.error('Could not upload the photo — nothing was published. Try again.')
          return
        }
        image_url = supabase.storage.from('problem-images').getPublicUrl(path).data.publicUrl
      } finally {
        setUploading(false)
      }
    }

    create.mutate(
      {
        gym: resolveGym(effectiveGym),
        color: color || null,
        hold_color: holdColor || null,
        wall_angle: null,
        // This app has no problem names; the column is written as null everywhere.
        name: null,
        image_url,
        beta_video_url: null,
        community_grade: grade || null,
      },
      {
        onSuccess: () => { toast.success('Published to the gym'); close() },
        onError: () => toast.error('Could not publish this boulder'),
      },
    )
  }

  const busy = uploading || create.isPending

  return (
    <BottomSheet open={open} onClose={close} title="Add a gym boulder">
      <div className="grid grid-cols-[68px_1fr] items-start gap-x-2.5 gap-y-2.5">
        <RowLabel>Gym</RowLabel>
        <div>
          {defaultGyms.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {defaultGyms.map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => { setGym(g); setColor('') }}
                  aria-pressed={effectiveGym === g}
                  className={`${PILL} ${effectiveGym === g ? PILL_ON : PILL_OFF}`}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
          <GymInput
            value={gym}
            onChange={v => { setGym(v); setColor('') }}
            placeholder="e.g. Boulders Oslo"
          />
        </div>

        <RowLabel>Photo</RowLabel>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => pickFile(e.target.files?.[0] ?? null)}
          />
          {previewUrl ? (
            <div className="relative inline-block">
              <img src={previewUrl} alt="Boulder preview" className="h-16 w-16 rounded-lg border object-cover" />
              <button
                type="button"
                onClick={() => pickFile(null)}
                aria-label="Remove photo"
                className="absolute -right-2 -top-2 rounded-full border bg-white p-0.5 shadow"
              >
                <X className="h-3.5 w-3.5 text-gray-600" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`${PILL} ${PILL_OFF} inline-flex items-center gap-1.5`}
            >
              <Camera className="h-3.5 w-3.5" /> Add photo
            </button>
          )}
          <p className="mt-1 text-[11px] text-gray-400">Earns 10 points with a photo.</p>
        </div>

        <RowLabel>Grade</RowLabel>
        <select value={grade} onChange={e => setGrade(e.target.value)} className={INPUT}>
          <option value="">Select grade</option>
          {grades.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        <RowLabel>Gym grade</RowLabel>
        <div>
          {!effectiveGym ? (
            <p className="pt-1.5 text-xs text-gray-400">Set the gym above to pick its grading colours.</p>
          ) : gymGradings.length === 0 ? (
            <p className="pt-1.5 text-xs text-gray-400">No grading colours set for {effectiveGym} yet.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              {gymGradings.map(g => {
                const selected = color.toLowerCase() === g.color_name.toLowerCase()
                return (
                  <button
                    key={g.color_name}
                    type="button"
                    onClick={() => setColor(selected ? '' : g.color_name)}
                    title={`${g.color_name} · ${g.points} pts`}
                    aria-label={g.color_name}
                    aria-pressed={selected}
                    className={`grid place-items-center rounded-md p-1 transition ${selected ? 'bg-sage-50 ring-2 ring-sage-600' : 'hover:bg-gray-100'}`}
                  >
                    <TapeGraphic color={g.color_name} size={18} />
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <RowLabel>Hold</RowLabel>
        <div className="flex flex-wrap items-center gap-1">
          {HOLD_COLORS.map(c => {
            const selected = holdColor === c.name
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => setHoldColor(selected ? '' : c.name)}
                title={c.name}
                aria-label={c.name}
                aria-pressed={selected}
                className={`grid place-items-center rounded-md p-1 transition ${selected ? 'bg-sage-50 ring-2 ring-sage-600' : 'hover:bg-gray-100'}`}
              >
                <HoldGraphic color={c.name} size={18} />
              </button>
            )
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={!effectiveGym || busy}
        className="mt-5 w-full rounded-2xl bg-sage-700 py-3 text-sm font-medium text-white transition-opacity disabled:opacity-60"
      >
        {busy ? 'Publishing…' : 'Publish to the gym'}
      </button>
    </BottomSheet>
  )
}
