import { useState, useRef } from 'react'
import { Trash2, Pencil, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import { useProfile, useUpdateProfile, useUploadAvatar, useSearchUsers } from '../hooks/useProfile'
import {
  useFollowing, useFollowersCount, useRemoveFriend,
  useSentFollowRequests, useReceivedFollowRequests,
  useSendFollowRequest, useCancelFollowRequest,
  useAcceptFollowRequest, useDeclineFollowRequest,
} from '../hooks/useFollows'
import { useExerciseTemplates, useCreateExerciseTemplate, useUpdateExerciseTemplate, useDeleteExerciseTemplate } from '../hooks/useExerciseTemplates'
import { useStrengthTests, useCreateStrengthTest, useUpdateStrengthTest, useDeleteStrengthTest } from '../hooks/useStrengthTests'
import { useProblemTagDefinitions, useCreateProblemTagDefinition, useDeleteProblemTagDefinition } from '../hooks/useProblemTags'
import toast from 'react-hot-toast'
import type { ExerciseType } from '../types'

export function ProfilePage() {
  const { user } = useAuth()
  const { data: profile, isLoading } = useProfile()
  const { data: following = [] } = useFollowing()
  const { data: followersCount = 0 } = useFollowersCount(user?.id ?? '')
  const { data: sentRequests = new Set<string>() } = useSentFollowRequests()
  const { data: receivedRequests = [] } = useReceivedFollowRequests()
  const updateProfile = useUpdateProfile()
  const uploadAvatar = useUploadAvatar()
  const removeFriend = useRemoveFriend()
  const sendRequest = useSendFollowRequest()
  const cancelRequest = useCancelFollowRequest()
  const acceptRequest = useAcceptFollowRequest()
  const declineRequest = useDeclineFollowRequest()

  const [editingUsername, setEditingUsername] = useState(false)
  const [usernameInput, setUsernameInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: searchResults = [] } = useSearchUsers(searchQuery)

  const isFollowing = (userId: string) => following.some(f => f.following_id === userId)
  const isPending = (userId: string) => sentRequests.has(userId)

  if (isLoading) return <div className="p-4 text-gray-500">Loading...</div>

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    uploadAvatar.mutate(file, {
      onSuccess: () => toast.success('Avatar updated'),
      onError: () => toast.error('Failed to upload image'),
    })
  }

  const handleSaveUsername = () => {
    if (!usernameInput.trim()) return
    updateProfile.mutate({ username: usernameInput.trim() }, {
      onSuccess: () => { setEditingUsername(false); toast.success('Username updated') },
      onError: () => toast.error('Username already taken'),
    })
  }

  return (
    <div className="p-4 space-y-6 pb-28">
      {/* Avatar + name */}
      <div className="flex flex-col items-center gap-3 pt-4">
        <div className="relative">
          <div
            className="w-24 h-24 rounded-full bg-gray-100 overflow-hidden cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl text-gray-400">
                {profile?.username?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-0 right-0 w-7 h-7 bg-sage-700 rounded-full flex items-center justify-center text-white text-sm"
            title="Change photo" aria-label="Change photo"
          >
            ✎
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>

        {editingUsername ? (
          <div className="flex gap-2 items-center">
            <input
              autoFocus
              value={usernameInput}
              onChange={e => setUsernameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveUsername()}
              placeholder="Username"
              className="border rounded-lg px-3 py-1.5 text-sm"
            />
            <button
              onClick={handleSaveUsername}
              disabled={updateProfile.isPending}
              className="text-sm text-sage-800 font-medium"
            >
              Save
            </button>
            <button
              onClick={() => setEditingUsername(false)}
              className="text-sm text-gray-400"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setUsernameInput(profile?.username ?? ''); setEditingUsername(true) }}
            className="text-center"
          >
            <p className="font-semibold text-lg">{profile?.username ?? 'Set username'}</p>
            <p className="text-xs text-gray-500">tap to edit</p>
          </button>
        )}

        <div className="flex gap-8 text-center">
          <div>
            <p className="font-bold text-lg">{following.length}</p>
            <p className="text-xs text-gray-500">Following</p>
          </div>
          <div>
            <p className="font-bold text-lg">{followersCount}</p>
            <p className="text-xs text-gray-500">Followers</p>
          </div>
        </div>

        <div className="w-full">
          <p className="text-xs text-gray-400 text-center mb-2 uppercase tracking-wider font-medium">Grade Scale</p>
          <div className="flex rounded-xl overflow-hidden border border-gray-200 w-full">
            {(['font', 'v_scale'] as const).map(scale => (
              <button
                key={scale}
                type="button"
                onClick={() => updateProfile.mutate({ grade_preference: scale })}
                disabled={updateProfile.isPending}
                className={`flex-1 py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
                  (profile?.grade_preference ?? 'font') === scale
                    ? 'bg-sage-700 text-white'
                    : 'bg-white text-gray-500'
                }`}
              >
                {scale === 'font' ? 'Font' : 'V-Scale'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Search users */}
      <div>
        <h2 className="text-base font-semibold mb-2">Find Friends</h2>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by username…"
          className="w-full border rounded-lg px-3 py-2.5 text-sm"
        />

        {searchQuery.length >= 2 && (
          <div className="mt-2 space-y-2">
            {searchResults.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No users found</p>
            )}
            {searchResults
              .filter(u => u.id !== user?.id)
              .map(u => (
                <div key={u.id} className="flex items-center justify-between bg-gray-50 rounded-2xl p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-gray-400 font-medium">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        u.username?.[0]?.toUpperCase() ?? '?'
                      )}
                    </div>
                    <p className="font-medium text-sm">{u.username}</p>
                  </div>
                  {isFollowing(u.id) ? (
                    <button
                      onClick={() => removeFriend.mutate(u.id, { onError: () => toast.error('Failed') })}
                      className="text-xs font-medium px-3 py-1.5 rounded-full bg-gray-200 text-gray-600"
                    >
                      Friends
                    </button>
                  ) : isPending(u.id) ? (
                    <button
                      onClick={() => cancelRequest.mutate(u.id, { onError: () => toast.error('Failed') })}
                      className="text-xs font-medium px-3 py-1.5 rounded-full bg-sage-100 text-sage-700 border border-sage-300"
                    >
                      Requested
                    </button>
                  ) : (
                    <button
                      onClick={() => sendRequest.mutate(u.id, { onSuccess: () => toast.success('Request sent'), onError: () => toast.error('Failed') })}
                      className="text-xs font-medium px-3 py-1.5 rounded-full bg-sage-700 text-white"
                    >
                      Add friend
                    </button>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Incoming friend requests */}
      {receivedRequests.length > 0 && searchQuery.length < 2 && (
        <div>
          <h2 className="text-base font-semibold mb-2">
            Friend Requests
            <span className="ml-2 text-xs bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold">{receivedRequests.length}</span>
          </h2>
          <div className="space-y-2">
            {receivedRequests.map(req => (
              <FriendRequestRow
                key={req.id}
                requestId={req.id}
                requesterId={req.requester_id}
                onAccept={() => acceptRequest.mutate({ requestId: req.id, requesterId: req.requester_id }, { onSuccess: () => toast.success('Friend added!'), onError: () => toast.error('Failed') })}
                onDecline={() => declineRequest.mutate(req.id, { onSuccess: () => toast.success('Request declined'), onError: () => toast.error('Failed') })}
                isPending={acceptRequest.isPending || declineRequest.isPending}
              />
            ))}
          </div>
        </div>
      )}

      {/* Following list */}
      {following.length > 0 && searchQuery.length < 2 && (
        <div>
          <h2 className="text-base font-semibold mb-2">Friends</h2>
          <div className="space-y-2">
            {following.map(f => (
              <FollowingItem
                key={f.following_id}
                userId={f.following_id}
                onRemove={() => removeFriend.mutate(f.following_id, { onError: () => toast.error('Failed') })}
              />
            ))}
          </div>
        </div>
      )}

      {/* Log out */}
      <div className="flex justify-center pt-2 pb-4">
        <button
          onClick={() => supabase.auth.signOut()}
          title="Log out"
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          <LogOut size={15} />
          Log out
        </button>
      </div>

      {/* Admin sections */}
      {profile?.is_admin && (
        <>
          <ProblemTagsAdmin />
          <StrengthTestsAdmin />
          <ExerciseLibraryAdmin />
        </>
      )}
    </div>
  )
}

function FriendRequestRow({
  requesterId, onAccept, onDecline, isPending,
}: {
  requestId?: string; requesterId: string
  onAccept: () => void; onDecline: () => void; isPending: boolean
}) {
  const { data: profile } = useProfile(requesterId)
  if (!profile) return null
  return (
    <div className="flex items-center justify-between bg-sage-50 border border-sage-200 rounded-2xl p-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-gray-400 font-medium">
          {profile.avatar_url
            ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            : profile.username?.[0]?.toUpperCase() ?? '?'}
        </div>
        <p className="font-medium text-sm">{profile.username}</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onDecline}
          disabled={isPending}
          className="text-xs font-medium px-3 py-1.5 rounded-full bg-gray-200 text-gray-600 disabled:opacity-50"
        >
          Decline
        </button>
        <button
          onClick={onAccept}
          disabled={isPending}
          className="text-xs font-medium px-3 py-1.5 rounded-full bg-sage-700 text-white disabled:opacity-50"
        >
          Accept
        </button>
      </div>
    </div>
  )
}

function FollowingItem({ userId, onRemove }: { userId: string; onRemove: () => void }) {
  const { data: profile } = useProfile(userId)
  if (!profile) return null
  return (
    <div className="flex items-center justify-between bg-gray-50 rounded-2xl p-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-gray-400 font-medium">
          {profile.avatar_url
            ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            : profile.username?.[0]?.toUpperCase() ?? '?'}
        </div>
        <p className="font-medium text-sm">{profile.username}</p>
      </div>
      <button
        onClick={onRemove}
        className="text-xs font-medium px-3 py-1.5 rounded-full bg-gray-200 text-gray-600"
      >
        Remove
      </button>
    </div>
  )
}

const SUGGESTED_CATEGORIES = ['holds', 'style', 'wall type']
const SUGGESTED_TAGS: Record<string, string[]> = {
  holds: ['Jugs', 'Crimps', 'Pinches', 'Slopers', 'Pockets', 'Sidepulls', 'Underclings', 'Gastons'],
  style: ['Techy', 'Dynamic', 'Static', 'Compression', 'Balance', 'Contact', 'Power'],
  'wall type': ['Slab', 'Vertical', 'Overhang', 'Roof', 'Cave'],
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
      <h2 className="text-base font-semibold mb-3">Problem Tags (Admin)</h2>
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
      <h2 className="text-base font-semibold mb-3">Strength Tests (Admin)</h2>
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
  const [name, setName] = useState('')
  const [type, setType] = useState<ExerciseType>('reps')
  const [description, setDescription] = useState('')
  const [testId, setTestId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState<ExerciseType>('reps')
  const [editDesc, setEditDesc] = useState('')
  const [editTestId, setEditTestId] = useState('')

  const startEdit = (t: import('../types').ExerciseTemplate) => {
    setEditingId(t.id); setEditName(t.name); setEditType(t.type); setEditDesc(t.description ?? ''); setEditTestId(t.test_id ?? '')
  }

  const handleAdd = () => {
    if (!name.trim()) return
    createTemplate.mutate(
      { name: name.trim(), type, description: description.trim() || null, test_id: testId || null },
      {
        onSuccess: () => { setName(''); setDescription(''); setTestId(''); toast.success('Exercise added') },
        onError: () => toast.error('Failed to add exercise'),
      },
    )
  }

  return (
    <div>
      <h2 className="text-base font-semibold mb-3">Exercise Library (Admin)</h2>

      <div className="space-y-2 mb-4">
        {templates.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">No exercises yet.</p>
        )}
        {templates.map(t => (
          <div key={t.id} className="bg-gray-50 rounded-2xl px-4 py-3">
            {editingId === t.id ? (
              <div className="space-y-2">
                <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Exercise name" />
                <div className="flex rounded-xl overflow-hidden border">
                  {(['reps', 'time'] as const).map(v => (
                    <button key={v} type="button" onClick={() => setEditType(v)}
                      className={`flex-1 py-1.5 text-sm font-medium transition-colors ${editType === v ? 'bg-sage-700 text-white' : 'bg-white text-gray-600'}`}>
                      {v === 'reps' ? 'Reps' : 'Time'}
                    </button>
                  ))}
                </div>
                <input value={editDesc} onChange={e => setEditDesc(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm" placeholder="Description (optional)" />
                {tests.length > 0 && (
                  <select value={editTestId} onChange={e => setEditTestId(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm">
                    <option value="">No linked test</option>
                    {tests.map(ts => <option key={ts.id} value={ts.id}>{ts.name} ({ts.unit})</option>)}
                  </select>
                )}
                <div className="flex gap-2">
                  <button onClick={() => setEditingId(null)} className="flex-1 py-1.5 text-sm border border-gray-200 rounded-xl text-gray-600">Cancel</button>
                  <button
                    onClick={() => updateTemplate.mutate(
                      { id: t.id, name: editName.trim(), type: editType, description: editDesc.trim() || null, test_id: editTestId || null },
                      { onSuccess: () => { setEditingId(null); toast.success('Exercise updated') }, onError: () => toast.error('Failed') }
                    )}
                    disabled={!editName.trim() || updateTemplate.isPending}
                    className="flex-1 py-1.5 text-sm bg-sage-700 text-white rounded-xl font-semibold disabled:opacity-50"
                  >
                    {updateTemplate.isPending ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
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
                  <button onClick={() => startEdit(t)} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"><Pencil size={14} /></button>
                  <button onClick={() => deleteTemplate.mutate(t.id, { onError: () => toast.error('Failed to delete') })} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 size={14} /></button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border rounded-2xl p-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">Add Exercise</p>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Exercise name" className="w-full border rounded-lg px-3 py-2.5 text-sm" />
        <div className="flex rounded-lg overflow-hidden border">
          {(['reps', 'time'] as const).map(t => (
            <button key={t} type="button" onClick={() => setType(t)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${type === t ? 'bg-sage-700 text-white' : 'bg-white text-gray-600'}`}>
              {t === 'reps' ? 'Reps' : 'Time'}
            </button>
          ))}
        </div>
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" className="w-full border rounded-lg px-3 py-2.5 text-sm" />
        {tests.length > 0 && (
          <select value={testId} onChange={e => setTestId(e.target.value)} className="w-full border rounded-lg px-3 py-2.5 text-sm">
            <option value="">No linked test</option>
            {tests.map(t => <option key={t.id} value={t.id}>{t.name} ({t.unit})</option>)}
          </select>
        )}
        <button onClick={handleAdd} disabled={!name.trim() || createTemplate.isPending}
          className="w-full bg-sage-700 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
          {createTemplate.isPending ? 'Adding...' : 'Add to Library'}
        </button>
      </div>
    </div>
  )
}
