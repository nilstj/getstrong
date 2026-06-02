import { useState, useRef } from 'react'
import { Trash2 } from 'lucide-react'
import { useAuth } from '../providers/AuthProvider'
import { useProfile, useUpdateProfile, useUploadAvatar, useSearchUsers } from '../hooks/useProfile'
import { useFollowing, useFollowUser, useUnfollowUser, useFollowersCount } from '../hooks/useFollows'
import { useExerciseTemplates, useCreateExerciseTemplate, useDeleteExerciseTemplate } from '../hooks/useExerciseTemplates'
import { useStrengthTests, useCreateStrengthTest, useDeleteStrengthTest } from '../hooks/useStrengthTests'
import toast from 'react-hot-toast'
import type { ExerciseType } from '../types'

export function ProfilePage() {
  const { user } = useAuth()
  const { data: profile, isLoading } = useProfile()
  const { data: following = [] } = useFollowing()
  const { data: followersCount = 0 } = useFollowersCount(user?.id ?? '')
  const updateProfile = useUpdateProfile()
  const uploadAvatar = useUploadAvatar()
  const followUser = useFollowUser()
  const unfollowUser = useUnfollowUser()

  const [editingUsername, setEditingUsername] = useState(false)
  const [usernameInput, setUsernameInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: searchResults = [] } = useSearchUsers(searchQuery)

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

  const isFollowing = (userId: string) => following.some(f => f.following_id === userId)

  const handleToggleFollow = (userId: string) => {
    if (isFollowing(userId)) {
      unfollowUser.mutate(userId, {
        onError: () => toast.error('Failed to unfollow'),
      })
    } else {
      followUser.mutate(userId, {
        onError: () => toast.error('Failed to follow'),
      })
    }
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
            className="absolute bottom-0 right-0 w-7 h-7 bg-black rounded-full flex items-center justify-center text-white text-sm"
            aria-label="Change photo"
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
              className="text-sm text-black font-medium"
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
                    ? 'bg-black text-white'
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
                  <button
                    onClick={() => handleToggleFollow(u.id)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                      isFollowing(u.id)
                        ? 'bg-gray-200 text-gray-600'
                        : 'bg-black text-white'
                    }`}
                  >
                    {isFollowing(u.id) ? 'Following' : 'Follow'}
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Following list */}
      {following.length > 0 && searchQuery.length < 2 && (
        <div>
          <h2 className="text-base font-semibold mb-2">Following</h2>
          <FollowingList followingIds={following.map(f => f.following_id)} onUnfollow={userId => unfollowUser.mutate(userId)} />
        </div>
      )}

      {/* Admin sections */}
      {profile?.is_admin && (
        <>
          <StrengthTestsAdmin />
          <ExerciseLibraryAdmin />
        </>
      )}
    </div>
  )
}

function FollowingList({ followingIds, onUnfollow }: { followingIds: string[]; onUnfollow: (id: string) => void }) {
  return (
    <div className="space-y-2">
      {followingIds.map(id => (
        <FollowingItem key={id} userId={id} onUnfollow={onUnfollow} />
      ))}
    </div>
  )
}

function FollowingItem({ userId, onUnfollow }: { userId: string; onUnfollow: (id: string) => void }) {
  const { data: profile } = useProfile(userId)
  if (!profile) return null
  return (
    <div className="flex items-center justify-between bg-gray-50 rounded-2xl p-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-gray-400 font-medium">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            profile.username?.[0]?.toUpperCase() ?? '?'
          )}
        </div>
        <p className="font-medium text-sm">{profile.username}</p>
      </div>
      <button
        onClick={() => onUnfollow(userId)}
        className="text-xs font-medium px-3 py-1.5 rounded-full bg-gray-200 text-gray-600"
      >
        Following
      </button>
    </div>
  )
}

function StrengthTestsAdmin() {
  const { data: tests = [] } = useStrengthTests()
  const createTest = useCreateStrengthTest()
  const deleteTest = useDeleteStrengthTest()
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('kg')
  const [description, setDescription] = useState('')

  const handleAdd = () => {
    if (!name.trim()) return
    createTest.mutate(
      { name: name.trim(), unit: unit.trim() || 'kg', description: description.trim() || null },
      {
        onSuccess: () => { setName(''); setDescription(''); toast.success('Test added') },
        onError: () => toast.error('Failed to add test'),
      },
    )
  }

  return (
    <div>
      <h2 className="text-base font-semibold mb-3">Strength Tests (Admin)</h2>
      <div className="space-y-2 mb-4">
        {tests.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No tests yet.</p>}
        {tests.map(t => (
          <div key={t.id} className="flex items-center justify-between bg-blue-50 rounded-xl px-4 py-3">
            <div>
              <p className="font-medium text-sm">{t.name}</p>
              <p className="text-xs text-gray-400">{t.unit}{t.description ? ` · ${t.description}` : ''}</p>
            </div>
            <button
              onClick={() => deleteTest.mutate(t.id, { onError: () => toast.error('Failed to delete') })}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              aria-label="Delete"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <div className="border rounded-2xl p-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">Add Test</p>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Test name (e.g. Max weight 10mm edge)" className="w-full border rounded-lg px-3 py-2.5 text-sm" />
        <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="Unit (e.g. kg, seconds)" className="w-full border rounded-lg px-3 py-2.5 text-sm" />
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" className="w-full border rounded-lg px-3 py-2.5 text-sm" />
        <button onClick={handleAdd} disabled={!name.trim() || createTest.isPending} className="w-full bg-black text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
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
  const deleteTemplate = useDeleteExerciseTemplate()
  const [name, setName] = useState('')
  const [type, setType] = useState<ExerciseType>('reps')
  const [description, setDescription] = useState('')
  const [testId, setTestId] = useState('')

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
          <div key={t.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
            <div>
              <p className="font-medium text-sm">{t.name}</p>
              <p className="text-xs text-gray-400 capitalize">
                {t.type}
                {t.description ? ` · ${t.description}` : ''}
                {t.test_id && ` · % ${tests.find(ts => ts.id === t.test_id)?.name ?? 'test'}`}
              </p>
            </div>
            <button
              onClick={() => deleteTemplate.mutate(t.id, { onError: () => toast.error('Failed to delete') })}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              aria-label="Delete"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      <div className="border rounded-2xl p-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">Add Exercise</p>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Exercise name" className="w-full border rounded-lg px-3 py-2.5 text-sm" />
        <div className="flex rounded-lg overflow-hidden border">
          {(['reps', 'time'] as const).map(t => (
            <button key={t} type="button" onClick={() => setType(t)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${type === t ? 'bg-black text-white' : 'bg-white text-gray-600'}`}>
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
          className="w-full bg-black text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
          {createTemplate.isPending ? 'Adding...' : 'Add to Library'}
        </button>
      </div>
    </div>
  )
}
