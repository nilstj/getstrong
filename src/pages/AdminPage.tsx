import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, ChevronLeft } from 'lucide-react'
import { useProfile } from '../hooks/useProfile'
import { useAppSetting, useUpdateAppSetting } from '../hooks/useAppSettings'
import { useProblemTagDefinitions, useCreateProblemTagDefinition, useDeleteProblemTagDefinition } from '../hooks/useProblemTags'
import { useChallengeTags, useCreateChallengeTag, useDeleteChallengeTag } from '../hooks/useChallengeTags'
import toast from 'react-hot-toast'

const SUGGESTED_CATEGORIES = ['holds', 'style', 'wall type']
const SUGGESTED_TAGS: Record<string, string[]> = {
  holds: ['Jugs', 'Crimps', 'Pinches', 'Slopers', 'Pockets', 'Sidepulls', 'Underclings', 'Gastons'],
  style: ['Techy', 'Dynamic', 'Static', 'Compression', 'Balance', 'Contact', 'Power'],
  'wall type': ['Slab', 'Vertical', 'Overhang', 'Roof', 'Cave'],
}

export function AdminPage() {
  const navigate = useNavigate()
  const { data: profile, isLoading } = useProfile()

  if (isLoading) return <div className="p-4 text-gray-500">Loading...</div>
  if (!profile?.is_admin) return <div className="p-4 text-red-500">Not authorized.</div>

  return (
    <div className="p-4 space-y-8 pb-28">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/profile')} className="text-gray-400 hover:text-gray-700 transition-colors">
          <ChevronLeft size={20} strokeWidth={1.75} />
        </button>
        <h1 className="text-xl font-bold">Admin</h1>
      </div>

      <CoachPromptAdmin />
      <ProblemTagsAdmin />
      <ChallengeTagsAdmin />
    </div>
  )
}

function CoachPromptAdmin() {
  const { data: saved } = useAppSetting('coach_prompt')
  const updateSetting = useUpdateAppSetting()
  const [value, setValue] = useState('')

  useEffect(() => { if (saved) setValue(saved) }, [saved])

  return (
    <div>
      <h2 className="text-base font-semibold mb-3">AI Coach Prompt</h2>
      <p className="text-xs text-gray-400 mb-2">
        The instruction sent to the AI. Use <code className="bg-gray-100 px-1 rounded">&#123;&#123;DATA&#125;&#125;</code> where the athlete's data should appear.
      </p>
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        rows={14}
        className="w-full border rounded-xl px-3 py-2.5 text-sm font-mono leading-relaxed"
      />
      <button
        onClick={() => updateSetting.mutate(
          { key: 'coach_prompt', value },
          { onSuccess: () => toast.success('Prompt saved'), onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to save') }
        )}
        disabled={!value.trim() || updateSetting.isPending}
        className="w-full mt-3 bg-sage-700 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
      >
        {updateSetting.isPending ? 'Saving…' : 'Save Prompt'}
      </button>
    </div>
  )
}

function ProblemTagsAdmin() {
  const { data: tags = [] } = useProblemTagDefinitions()
  const createTag = useCreateProblemTagDefinition()
  const deleteTag = useDeleteProblemTagDefinition()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('holds')

  const tagsByCategory = tags.reduce<Record<string, typeof tags>>((acc, t) => {
    if (!acc[t.category]) acc[t.category] = []
    acc[t.category].push(t)
    return acc
  }, {})

  return (
    <div>
      <h2 className="text-base font-semibold mb-3">Problem Tags</h2>
      <div className="space-y-3 mb-4">
        {Object.entries(tagsByCategory).map(([cat, catTags]) => (
          <div key={cat}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 capitalize">{cat}</p>
            <div className="flex flex-wrap gap-1.5">
              {catTags.map(t => (
                <div key={t.id} className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-full pl-3 pr-1.5 py-1">
                  <span className="text-sm text-gray-700">{t.name}</span>
                  <button
                    onClick={() => deleteTag.mutate(t.id, { onError: () => toast.error('Failed to delete') })}
                    className="w-4 h-4 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500"
                  >
                    <Trash2 size={12} strokeWidth={1.75} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
        {tags.length === 0 && <p className="text-sm text-gray-400">No tags yet. Add some below or use suggestions.</p>}
      </div>

      <div className="border rounded-2xl p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-700">Add Tag</p>
        <div className="flex gap-2">
          <select value={category} onChange={e => setCategory(e.target.value)} className="border rounded-xl px-3 py-2 text-sm flex-shrink-0">
            {SUGGESTED_CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
          </select>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Tag name" className="flex-1 border rounded-xl px-3 py-2 text-sm" />
        </div>
        <button
          onClick={() => createTag.mutate({ name: name.trim(), category }, {
            onSuccess: () => { setName(''); toast.success('Tag added') },
            onError: () => toast.error('Failed (name may already exist)'),
          })}
          disabled={!name.trim() || createTag.isPending}
          className="w-full bg-sage-700 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
        >
          {createTag.isPending ? 'Adding…' : 'Add Tag'}
        </button>
        <div>
          <p className="text-xs text-gray-400 mb-2">Quick add suggestions:</p>
          <div className="space-y-2">
            {Object.entries(SUGGESTED_TAGS).map(([cat, suggestions]) => (
              <div key={cat}>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 capitalize">{cat}</p>
                <div className="flex flex-wrap gap-1">
                  {suggestions.filter(s => !tags.some(t => t.name === s)).map(s => (
                    <button
                      key={s}
                      onClick={() => createTag.mutate({ name: s, category: cat }, { onError: () => toast.error('Already exists') })}
                      className="text-xs border border-dashed border-gray-300 text-gray-500 rounded-full px-2.5 py-0.5 hover:border-sage-700 hover:text-sage-800 transition-colors"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ChallengeTagsAdmin() {
  const { data: tags = [] } = useChallengeTags()
  const createTag = useCreateChallengeTag()
  const deleteTag = useDeleteChallengeTag()
  const [name, setName] = useState('')

  return (
    <div>
      <h2 className="text-base font-semibold mb-3">Challenge Tags</h2>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {tags.length === 0 && <p className="text-sm text-gray-400">No tags yet. Add some below.</p>}
        {tags.map(t => (
          <div key={t.id} className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-full pl-3 pr-1.5 py-1">
            <span className="text-sm text-gray-700">{t.name}</span>
            <button
              onClick={() => deleteTag.mutate(t.id, { onError: () => toast.error('Failed to delete') })}
              className="w-4 h-4 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors"
            >
              <Trash2 size={12} strokeWidth={1.75} />
            </button>
          </div>
        ))}
      </div>
      <div className="border rounded-2xl p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-700">Add Tag</p>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && name.trim()) {
                e.preventDefault()
                createTag.mutate(name.trim(), {
                  onSuccess: () => { setName(''); toast.success('Tag added') },
                  onError: () => toast.error('Failed (name may already exist)'),
                })
              }
            }}
            placeholder="Tag name (e.g. Coordination)"
            className="flex-1 border rounded-xl px-3 py-2 text-sm"
          />
          <button
            onClick={() => createTag.mutate(name.trim(), {
              onSuccess: () => { setName(''); toast.success('Tag added') },
              onError: () => toast.error('Failed (name may already exist)'),
            })}
            disabled={!name.trim() || createTag.isPending}
            className="bg-sage-700 text-white px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {createTag.isPending ? '…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}
