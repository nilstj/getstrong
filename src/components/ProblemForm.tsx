import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { Camera, X } from 'lucide-react'
import type { Problem, ProblemTagDefinition } from '../types'
import { V_GRADES, FONT_GRADES_ORDERED } from '../utils/grades'
import { useProblemTagDefinitions } from '../hooks/useProblemTags'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'

const BOARDS = ['Kilterboard', 'Moonboard', 'TB2'] as const

type FormValues = {
  name: string
  grade_value: string
  color: string
  attempts: number
  sent: boolean
  board: string
  board_angle: number | ''
  gym: string
  crag: string
  beta_video_url: string
  notes: string
}

interface ProblemFormProps {
  onSubmit: (values: Omit<Problem, 'id' | 'session_id' | 'user_id' | 'created_at' | 'grade_value_font' | 'grade_value_vscale'> & { tagIds?: string[] }) => void
  isSubmitting: boolean
  initialGradeSystem?: 'font' | 'v_scale'
  existing?: Problem
  existingTagIds?: string[]
}

export function ProblemForm({ onSubmit, isSubmitting, initialGradeSystem = 'font', existing, existingTagIds }: ProblemFormProps) {
  const { user } = useAuth()
  const grades = initialGradeSystem === 'v_scale' ? V_GRADES : FONT_GRADES_ORDERED
  const scaleLabel = initialGradeSystem === 'v_scale' ? 'V-Scale' : 'Font'
  const { data: tagDefinitions = [] } = useProblemTagDefinitions()
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set(existingTagIds ?? []))
  const [isOutdoor, setIsOutdoor] = useState<boolean>(!!(existing?.crag))
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(existing?.image_url ?? null)
  const [isUploading, setIsUploading] = useState(false)
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
      name: existing?.name ?? '',
      grade_value: existing?.grade_value ?? '',
      color: existing?.color ?? '',
      attempts: existing?.attempts ?? 1,
      sent: existing?.sent ?? false,
      board: existing?.board ?? '',
      board_angle: existing?.board_angle ?? '',
      gym: existing?.gym ?? '',
      crag: existing?.crag ?? '',
      beta_video_url: existing?.beta_video_url ?? '',
      notes: existing?.notes ?? '',
    },
  })

  const attempts = watch('attempts')
  const board = watch('board')

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
      name: values.name || null,
      grade_system: initialGradeSystem,
      grade_value: values.grade_value || null,
      color: isOutdoor ? null : (values.color || null),
      attempts: values.attempts,
      sent: values.sent,
      board: isOutdoor ? null : (values.board || null),
      board_angle: (!isOutdoor && values.board && values.board_angle !== '') ? Number(values.board_angle) : null,
      gym: isOutdoor ? null : (values.gym || null),
      crag: isOutdoor ? (values.crag || null) : null,
      image_url,
      beta_video_url: values.beta_video_url || null,
      notes: values.notes || null,
    })
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name (optional)</label>
        <input
          {...register('name')}
          type="text"
          placeholder="e.g. The Crimpy Roof"
          className="w-full border rounded-lg px-3 py-2.5"
        />
      </div>

      {/* Indoor / Outdoor toggle */}
      <div className="flex rounded-xl overflow-hidden border border-gray-200">
        <button
          type="button"
          onClick={() => setIsOutdoor(false)}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            !isOutdoor ? 'bg-sage-700 text-white' : 'bg-white text-gray-500'
          }`}
        >
          🏠 Indoor
        </button>
        <button
          type="button"
          onClick={() => setIsOutdoor(true)}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            isOutdoor ? 'bg-sage-700 text-white' : 'bg-white text-gray-500'
          }`}
        >
          🌲 Outdoor
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Grade ({scaleLabel})</label>
        <select {...register('grade_value')} className="w-full border rounded-lg px-3 py-2.5">
          <option value="">Select grade</option>
          {grades.map(g => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>

      {/* Indoor-only fields */}
      {!isOutdoor && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Training Board (optional)</label>
            <div className="flex flex-wrap gap-2">
              {BOARDS.map(b => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setValue('board', board === b ? '' : b)}
                  className={`text-sm px-3 py-1.5 rounded-full border font-medium transition-colors ${
                    board === b
                      ? 'bg-sage-700 border-sage-700 text-white'
                      : 'bg-white border-gray-300 text-gray-600'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          {board && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Board Angle (°)</label>
              <div className="flex items-center gap-3">
                <input
                  {...register('board_angle', { valueAsNumber: true, min: 30, max: 70 })}
                  type="range"
                  min="30"
                  max="70"
                  step="5"
                  className="flex-1 accent-sage-700"
                />
                <span className="text-sm font-semibold text-gray-700 w-12 text-right">
                  {watch('board_angle') !== '' ? `${watch('board_angle')}°` : '—'}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Color (optional)</label>
            <input
              {...register('color')}
              type="text"
              placeholder="e.g. Red, Blue, Yellow"
              className="w-full border rounded-lg px-3 py-2.5"
            />
          </div>
        </>
      )}

      {/* Outdoor-only fields */}
      {isOutdoor && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Crag (optional)</label>
          <input
            {...register('crag')}
            type="text"
            placeholder="e.g. Fontainebleau, Magic Wood"
            className="w-full border rounded-lg px-3 py-2.5"
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Attempts</label>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setValue('attempts', Math.max(1, attempts - 1))}
            className="w-10 h-10 rounded-full border text-xl flex items-center justify-center"
          >
            −
          </button>
          <span className="text-xl font-semibold w-8 text-center">{attempts}</span>
          <button
            type="button"
            onClick={() => setValue('attempts', attempts + 1)}
            className="w-10 h-10 rounded-full border text-xl flex items-center justify-center"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input {...register('sent')} id="sent" type="checkbox" className="w-5 h-5 accent-sage-700" />
        <label htmlFor="sent" className="text-sm font-medium text-gray-700">Sent (completed)</label>
      </div>

      {!isOutdoor && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Gym (optional)</label>
          <input
            {...register('gym')}
            type="text"
            placeholder="e.g. Boulders Oslo"
            className="w-full border rounded-lg px-3 py-2.5"
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Beta video (optional)</label>
        <input
          {...register('beta_video_url')}
          type="url"
          placeholder="https://instagram.com/... or https://youtube.com/..."
          className="w-full border rounded-lg px-3 py-2.5 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
        <textarea
          {...register('notes')}
          rows={2}
          placeholder="Any notes..."
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {Object.keys(tagsByCategory).length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Tags (optional)</label>
          <div className="space-y-2">
            {Object.entries(tagsByCategory).map(([category, tags]) => (
              <div key={category}>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 capitalize">{category}</p>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map(tag => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={`text-sm px-3 py-1 rounded-full border font-medium transition-colors ${
                        selectedTagIds.has(tag.id)
                          ? 'bg-sage-700 border-sage-700 text-white'
                          : 'bg-white border-gray-300 text-gray-600'
                      }`}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Image picker */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Photo (optional)</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        {previewUrl ? (
          <div className="relative inline-block">
            <img src={previewUrl} alt="Problem preview" className="w-24 h-24 object-cover rounded-lg border" />
            <button
              type="button"
              onClick={clearImage}
              className="absolute -top-2 -right-2 bg-white border rounded-full p-0.5 shadow"
            >
              <X className="w-3.5 h-3.5 text-gray-600" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            <Camera className="w-4 h-4" />
            Add photo
          </button>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting || isUploading}
        className="w-full bg-sage-700 text-white py-3 rounded-xl font-medium disabled:opacity-50"
      >
        {isUploading ? 'Uploading...' : isSubmitting ? 'Saving...' : existing ? 'Save Changes' : 'Add Problem'}
      </button>
    </form>
  )
}
