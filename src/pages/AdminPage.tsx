import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, Pencil, ChevronLeft } from 'lucide-react'
import { useProfile } from '../hooks/useProfile'
import { useAppSetting, useUpdateAppSetting } from '../hooks/useAppSettings'
import { useExerciseTemplates, useCreateExerciseTemplate, useUpdateExerciseTemplate, useDeleteExerciseTemplate } from '../hooks/useExerciseTemplates'
import { useStrengthTests, useCreateStrengthTest, useUpdateStrengthTest, useDeleteStrengthTest } from '../hooks/useStrengthTests'
import { useProblemTagDefinitions, useCreateProblemTagDefinition, useDeleteProblemTagDefinition } from '../hooks/useProblemTags'
import { ExerciseTemplateModal } from '../components/ExerciseTemplateModal'
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
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-xl font-bold">Admin</h1>
      </div>

      <CoachPromptAdmin />
      <ProblemTagsAdmin />
      <StrengthTestsAdmin />
      <ExerciseLibraryAdmin />
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
                    <Trash2 size={11} />
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

function StrengthTestsAdmin() {
  const { data: tests = [] } = useStrengthTests()
  const createTest = useCreateStrengthTest()
  const updateTest = useUpdateStrengthTest()
  const deleteTest = useDeleteStrengthTest()
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('kg')
  const [description, setDescription] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editUnit, setEditUnit] = useState('')
  const [editDesc, setEditDesc] = useState('')

  const startEdit = (t: import('../types').StrengthTest) => {
    setEditingId(t.id); setEditName(t.name); setEditUnit(t.unit); setEditDesc(t.description ?? '')
  }

  return (
    <div>
      <h2 className="text-base font-semibold mb-3">Strength Tests</h2>
      <div className="space-y-2 mb-4">
        {tests.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No tests yet.</p>}
        {tests.map(t => (
          <div key={t.id} className="bg-sage-50 rounded-2xl px-4 py-3">
            {editingId === t.id ? (
              <div className="space-y-2">
                <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Test name" />
                <input value={editUnit} onChange={e => setEditUnit(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Unit" />
                <input value={editDesc} onChange={e => setEditDesc(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Description (optional)" />
                <div className="flex gap-2">
                  <button onClick={() => setEditingId(null)} className="flex-1 py-1.5 text-sm border border-gray-200 rounded-xl text-gray-600">Cancel</button>
                  <button
                    onClick={() => updateTest.mutate(
                      { id: t.id, name: editName.trim(), unit: editUnit.trim() || 'kg', description: editDesc.trim() || null },
                      { onSuccess: () => { setEditingId(null); toast.success('Test updated') }, onError: () => toast.error('Failed') }
                    )}
                    disabled={!editName.trim() || updateTest.isPending}
                    className="flex-1 py-1.5 text-sm bg-sage-700 text-white rounded-xl font-semibold disabled:opacity-50"
                  >
                    {updateTest.isPending ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{t.name}</p>
                  <p className="text-xs text-gray-400">{t.unit}{t.description ? ` · ${t.description}` : ''}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEdit(t)} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-blue-100 transition-colors"><Pencil size={14} /></button>
                  <button onClick={() => deleteTest.mutate(t.id, { onError: () => toast.error('Failed to delete') })} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 size={14} /></button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="border rounded-2xl p-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">Add Test</p>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Test name (e.g. Max weight 10mm edge)" className="w-full border rounded-lg px-3 py-2.5 text-sm" />
        <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="Unit (e.g. kg, seconds)" className="w-full border rounded-lg px-3 py-2.5 text-sm" />
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" className="w-full border rounded-lg px-3 py-2.5 text-sm" />
        <button
          onClick={() => createTest.mutate({ name: name.trim(), unit: unit.trim() || 'kg', description: description.trim() || null }, {
            onSuccess: () => { setName(''); setDescription(''); toast.success('Test added') },
            onError: () => toast.error('Failed to add test'),
          })}
          disabled={!name.trim() || createTest.isPending}
          className="w-full bg-sage-700 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
        >
          {createTest.isPending ? 'Adding...' : 'Add Test'}
        </button>
      </div>
    </div>
  )
}

function ExerciseLibraryAdmin() {
  const { data: templates = [] } = useExerciseTemplates()
  const { data: tests = [] } = useStrengthTests()
  const createTemplate = useCreateExerciseTemplate()
  const updateTemplate = useUpdateExerciseTemplate()
  const deleteTemplate = useDeleteExerciseTemplate()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<import('../types').ExerciseTemplate | null>(null)

  const openAdd = () => { setEditingTemplate(null); setModalOpen(true) }
  const openEdit = (t: import('../types').ExerciseTemplate) => { setEditingTemplate(t); setModalOpen(true) }
  const closeModal = () => { setModalOpen(false); setEditingTemplate(null) }

  const handleSave = (values: Omit<import('../types').ExerciseTemplate, 'id' | 'created_by' | 'created_at'>) => {
    if (editingTemplate) {
      updateTemplate.mutate(
        { id: editingTemplate.id, ...values },
        { onSuccess: () => { closeModal(); toast.success('Exercise updated') }, onError: () => toast.error('Failed') }
      )
    } else {
      createTemplate.mutate(
        values,
        { onSuccess: () => { closeModal(); toast.success('Exercise added') }, onError: () => toast.error('Failed to add exercise') }
      )
    }
  }

  return (
    <div>
      <h2 className="text-base font-semibold mb-3">Exercise Library</h2>
      <div className="space-y-2 mb-4">
        {templates.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">No exercises yet.</p>
        )}
        {templates.map(t => (
          <div key={t.id} className="bg-gray-50 rounded-2xl px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{t.name}</p>
                <p className="text-xs text-gray-400 capitalize">
                  {t.type}
                  {t.description ? ` · ${t.description}` : ''}
                  {t.test_id && ` · % ${tests.find(ts => ts.id === t.test_id)?.name ?? 'test'}`}
                </p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(t)} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"><Pencil size={14} /></button>
                <button onClick={() => deleteTemplate.mutate(t.id, { onError: () => toast.error('Failed to delete') })} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={openAdd}
        className="w-full border-2 border-dashed border-gray-300 rounded-2xl py-3 text-sm text-gray-500 hover:border-gray-400 hover:text-sage-800 transition-colors"
      >
        + Add Exercise
      </button>
      {modalOpen && (
        <ExerciseTemplateModal
          template={editingTemplate}
          tests={tests}
          onSave={handleSave}
          onClose={closeModal}
          isSaving={createTemplate.isPending || updateTemplate.isPending}
        />
      )}
    </div>
  )
}
