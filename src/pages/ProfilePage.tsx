import { useState, useRef } from 'react'
import { useAuth } from '../providers/AuthProvider'
import { useProfile, useUpdateProfile, useUploadAvatar, useSearchUsers } from '../hooks/useProfile'
import { useFollowing, useFollowUser, useUnfollowUser, useFollowersCount } from '../hooks/useFollows'
import toast from 'react-hot-toast'

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
    <div className="p-4 space-y-6 pb-24">
      {/* Avatar + name */}
      <div className="flex flex-col items-center gap-3 pt-4">
        <div className="relative">
          <div
            className="w-24 h-24 rounded-full bg-indigo-100 overflow-hidden cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl text-indigo-400">
                {profile?.username?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-0 right-0 w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center text-white text-sm"
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
              className="text-sm text-indigo-600 font-medium"
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
            <p className="text-xs text-indigo-500">tap to edit</p>
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
                <div key={u.id} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 overflow-hidden flex items-center justify-center text-indigo-400 font-medium">
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
                        : 'bg-indigo-600 text-white'
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
    <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-indigo-100 overflow-hidden flex items-center justify-center text-indigo-400 font-medium">
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
