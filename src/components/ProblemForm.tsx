import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { Camera, Check, ChevronDown, ChevronRight, X } from 'lucide-react'
import type { Problem, ProblemTagDefinition } from '../types'
import { V_GRADES, FONT_GRADES_ORDERED } from '../utils/grades'
import { HOLD_COLORS } from '../utils/holdColors'
import { HoldGraphic, TapeGraphic } from './Chip'
import { useProblemTagDefinitions } from '../hooks/useProblemTags'
import { useGymGradings } from '../hooks/useGymGradings'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'

type FormValues = {
  grade_value: string
  color: string
  hold_color: string
  attempts: number
  sent: boolean
  gym: string
  beta_video_url: string
  notes: string
}

interface ProblemFormProps {
  onSubmit: (values: Omit<Problem, 'id' | 'session_id' | 'user_id' | 'created_at' | 'grade_value_font' | 'grade_value_vscale' | 'gym_problem_id'> & { tagIds?: string[]; makePublic?: boolean }) => void
  isSubmitting: boolean
  initialGradeSystem?: 'font' | 'v_scale'
  existing?: Problem
  existingTagIds?: string[]
  /** Pre-fills the Gym field for a new indoor problem (e.g. from the session location). */
  defaultGym?: string
}

/** The form's row label — the home page's section-label style, shrunk to fit a column. */
function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="pt-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">{children}</span>
  )
}

const INPUT = 'w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500'
/** A small pill toggle — the shape used for chips and filters elsewhere in the app. */
const PILL = 'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors'
const PILL_ON = 'border-sage-700 bg-sage-700 text-white'
const PILL_OFF = 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'

export function ProblemForm({ onSubmit, isSubmitting, initialGradeSystem = 'font', existing, existingTagIds, defaultGym }: ProblemFormProps) {
  const { user } = useAuth()
  const grades = initialGradeSystem === 'v_scale' ? V_GRADES : FONT_GRADES_ORDERED
  const { data: tagDefinitions = [] } = useProblemTagDefinitions()
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set(existingTagIds ?? []))
  const [visibilityPublic, setVisibilityPublic] = useState<boolean>(!!existing?.gym_problem_id)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(existing?.image_url ?? null)
  const [isUploading, setIsUploading] = useState(false)
  // Tags start collapsed — they're for analysis, not for logging the go. Already
  // tagged problems open expanded so an edit doesn't hide its own data.
  const [tagsOpen, setTagsOpen] = useState((existingTagIds ?? []).length > 0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const clearImage = () => {
    setSelectedFile(null)
    setPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const toggleTag = (id: string) => {
    setSelectedTagIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Group tags by category
  const tagsByCategory = tagDefinitions.reduce<Record<string, ProblemTagDefinition[]>>((acc, tag) => {
    if (!acc[tag.category]) acc[tag.category] = []
    acc[tag.category].push(tag)
    return acc
  }, {})

  const { register, handleSubmit, watch, setValue } = useForm<FormValues>({
    defaultValues: {
      grade_value: existing?.grade_value ?? '',
      color: existing?.color ?? '',
      hold_color: existing?.hold_color ?? '',
      attempts: existing?.attempts ?? 1,
      sent: existing?.sent ?? false,
      gym: existing?.gym ?? defaultGym ?? '',
      beta_video_url: existing?.beta_video_url ?? '',
      notes: existing?.notes ?? '',
    },
  })

  const attempts = watch('attempts')
  const sent = watch('sent')
  const holdColor = watch('hold_color')
  const color = watch('color')
  const gym = watch('gym')
  const { data: gymGradings = [] } = useGymGradings(gym)

  const submit = async (values: FormValues) => {
    let image_url = previewUrl && !selectedFile ? (existing?.image_url ?? null) : null

    if (selectedFile && user) {
      setIsUploading(true)
      try {
        const ext = selectedFile.name.split('.').pop() ?? 'jpg'
        const path = `${user.id}/${Date.now()}.${ext}`
        const { error } = await supabase.storage
          .from('problem-images')
          .upload(path, selectedFile, { upsert: true })
        if (!error) {
          image_url = supabase.storage.from('problem-images').getPublicUrl(path).data.publicUrl
        }
      } finally {
        setIsUploading(false)
      }
    }

    onSubmit({
      tagIds: Array.from(selectedTagIds),
      // Problems are identified by grade and colour now; the name and training
      // board fields are gone, so these columns are never written.
      name: null,
      board: null,
      board_angle: null,
      grade_system: initialGradeSystem,
      grade_value: values.grade_value || null,
      color: values.color || null,
      hold_color: values.hold_color || null,
      attempts: values.attempts,
      sent: values.sent,
      gym: values.gym || null,
      crag: null,
      image_url,
      beta_video_url: values.beta_video_url || null,
      notes: values.notes || null,
      makePublic: visibilityPublic,
    })
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-2.5">
      <div className="grid grid-cols-[68px_1fr] items-start gap-x-2.5 gap-y-2.5">
        <RowLabel>Gym</RowLabel>
        <input {...register('gym')} type="text" placeholder="e.g. Boulders Oslo" className={INPUT} />

        <RowLabel>Photo</RowLabel>
        <div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          {previewUrl ? (
            <div className="relative inline-block">
              <img src={previewUrl} alt="Problem preview" className="h-16 w-16 rounded-lg border object-cover" />
              <button
                type="button"
                onClick={clearImage}
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
        </div>

        <RowLabel>Grade</RowLabel>
        <select {...register('grade_value')} className={INPUT}>
          <option value="">Select grade</option>
          {grades.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        <RowLabel>Gym grade</RowLabel>
        <div>
          <input type="hidden" {...register('color')} />
          {!gym ? (
            <p className="pt-1.5 text-xs text-gray-400">Set the gym above to pick its grading colours.</p>
          ) : gymGradings.length === 0 ? (
            <p className="pt-1.5 text-xs text-gray-400">No grading colours set for {gym} yet.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              {gymGradings.map(g => {
                const selected = color?.toLowerCase() === g.color_name.toLowerCase()
                return (
                  <button
                    key={g.color_name}
                    type="button"
                    onClick={() => setValue('color', selected ? '' : g.color_name)}
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
          <input type="hidden" {...register('hold_color')} />
          {HOLD_COLORS.map(c => {
            const selected = holdColor?.toLowerCase() === c.name.toLowerCase()
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => setValue('hold_color', selected ? '' : c.name)}
                title={c.name}
                aria-label={c.name}
                aria-pressed={selected}
                className={`grid place-items-center rounded-md p-0.5 transition ${selected ? 'bg-sage-50 ring-2 ring-sage-600' : 'hover:bg-gray-100'}`}
              >
                <HoldGraphic color={c.name} size={22} />
              </button>
            )
          })}
        </div>

        <RowLabel>Tries</RowLabel>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setValue('attempts', Math.max(1, attempts - 1))}
            aria-label="One fewer attempt"
            className="grid h-7 w-7 place-items-center rounded-full border border-gray-200 text-base leading-none text-gray-600 hover:bg-gray-50"
          >
            −
          </button>
          <span className="w-5 text-center text-sm font-semibold">{attempts}</span>
          <button
            type="button"
            onClick={() => setValue('attempts', attempts + 1)}
            aria-label="One more attempt"
            className="grid h-7 w-7 place-items-center rounded-full border border-gray-200 text-base leading-none text-gray-600 hover:bg-gray-50"
          >
            +
          </button>
          {/* A real checkbox, kept off-screen: registering `sent` as a hidden
              text input would submit the string "false" instead of a boolean. */}
          <input {...register('sent')} type="checkbox" className="sr-only" tabIndex={-1} />
          <button
            type="button"
            onClick={() => setValue('sent', !sent)}
            aria-pressed={sent}
            className={`${PILL} ml-2 inline-flex items-center gap-1 ${sent ? PILL_ON : PILL_OFF}`}
          >
            <Check size={12} strokeWidth={3} /> Sent
          </button>
        </div>

        <RowLabel>Visible</RowLabel>
        <div>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setVisibilityPublic(false)} aria-pressed={!visibilityPublic}
              className={`${PILL} ${!visibilityPublic ? PILL_ON : PILL_OFF}`}>🔒 Private</button>
            <button type="button" onClick={() => setVisibilityPublic(true)} aria-pressed={visibilityPublic}
              className={`${PILL} ${visibilityPublic ? PILL_ON : PILL_OFF}`}>🌐 Public</button>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-gray-400">
            Public problems show up on the Gym problems page, where others can log them and compare beta.
          </p>
          {/* Only worth saying while it's still actionable: the photo has to be
              attached here, and create_gym_problem awards nothing without one.
              "New" because joining an existing boulder pays no first_logger. */}
          {visibilityPublic && !previewUrl && (
            <p className="mt-1 text-[11px] leading-snug text-sage-700">
              Add a photo above — a new boulder published with one earns 10 points.
            </p>
          )}
        </div>

        <RowLabel>Video</RowLabel>
        <input {...register('beta_video_url')} type="url" placeholder="instagram.com/… or youtube.com/…" className={INPUT} />

        <RowLabel>Notes</RowLabel>
        <textarea {...register('notes')} rows={2} placeholder="Any notes…" className={`${INPUT} resize-none`} />
      </div>

      {Object.keys(tagsByCategory).length > 0 && (
        <div className="border-t border-gray-100 pt-2.5">
          <button
            type="button"
            onClick={() => setTagsOpen(v => !v)}
            aria-expanded={tagsOpen}
            className="flex w-full items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-400 hover:text-gray-600"
          >
            {tagsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Tags
            {selectedTagIds.size > 0 && <span className="text-sage-700">({selectedTagIds.size})</span>}
          </button>
          {tagsOpen ? (
            <div className="mt-2 space-y-2">
              {Object.entries(tagsByCategory).map(([category, tags]) => (
                <div key={category}>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 capitalize">{category}</p>
                  <div className="flex flex-wrap gap-1">
                    {tags.map(tag => (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.id)}
                        aria-pressed={selectedTagIds.has(tag.id)}
                        className={`${PILL} ${selectedTagIds.has(tag.id) ? PILL_ON : PILL_OFF}`}
                      >
                        {tag.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[11px] leading-snug text-gray-400">
              Fill out tags to pinpoint strength and weaknesses
            </p>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting || isUploading}
        className="w-full rounded-xl bg-sage-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isUploading ? 'Uploading…' : isSubmitting ? 'Saving…' : existing ? 'Save changes' : 'Add problem'}
      </button>
    </form>
  )
}
