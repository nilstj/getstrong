import { useState, useRef, useEffect } from 'react'
import { LogOut, Shield } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import { useProfile, useUpdateProfile, useUploadAvatar, useSearchUsers } from '../hooks/useProfile'
import { useUserBadges } from '../hooks/useBadges'
import { BADGES } from '../types'
import {
  useFollowing, useFollowersCount, useRemoveFriend,
  useSentFollowRequests, useReceivedFollowRequests,
  useSendFollowRequest, useCancelFollowRequest,
  useAcceptFollowRequest, useDeclineFollowRequest,
} from '../hooks/useFollows'
import toast from 'react-hot-toast'
import { GymInput } from '../components/GymInput'

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
  const [defaultGym, setDefaultGym] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setDefaultGym(profile?.default_gym ?? '') }, [profile?.default_gym])

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

        <div className="w-full">
          <p className="text-xs text-gray-400 text-center mb-2 uppercase tracking-wider font-medium">Default Gym</p>
          <GymInput
            value={defaultGym}
            onChange={setDefaultGym}
            placeholder="Your home gym"
            onCommit={() => {
              const trimmed = defaultGym.trim()
              if (trimmed !== (profile?.default_gym ?? '')) {
                updateProfile.mutate({ default_gym: trimmed === '' ? null : trimmed })
              }
            }}
          />
        </div>
      </div>

      <BadgesCard />

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
                onAccept={() => acceptRequest.mutate({ requestId: req.id, requesterId: req.requester_id }, { onSuccess: () => toast.success('Friend added!'), onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed') })}
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
          <LogOut size={16} strokeWidth={1.75} />
          Log out
        </button>
      </div>

      {/* Admin link */}
      {profile?.is_admin && (
        <Link
          to="/admin"
          className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 hover:border-gray-300 transition-colors"
        >
          <Shield size={18} strokeWidth={1.75} className="text-sage-700" />
          <span className="text-sm font-medium text-gray-700">Admin Panel</span>
          <span className="ml-auto text-gray-400 text-base">›</span>
        </Link>
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

function BadgesCard() {
  const { data } = useUserBadges()
  const earned = new Set((data?.badges ?? []).map(b => b.badge))
  const helpfulCount = data?.helpfulCount ?? 0
  const next = BADGES.find(b => !earned.has(b.key))

  return (
    <div>
      <h2 className="text-base font-semibold mb-2">Helper Badges</h2>
      <div className="grid grid-cols-4 gap-2">
        {BADGES.map(b => {
          const has = earned.has(b.key)
          return (
            <div
              key={b.key}
              title={`${b.label} — ${b.blurb}`}
              className={`flex flex-col items-center gap-1 rounded-2xl py-3 px-1 border text-center ${
                has ? 'bg-sage-50 border-sage-200' : 'bg-gray-50 border-gray-100'
              }`}
            >
              <span className={`text-2xl ${has ? '' : 'grayscale opacity-30'}`}>{b.emoji}</span>
              <span className={`text-[10px] font-semibold leading-tight ${has ? 'text-sage-800' : 'text-gray-400'}`}>{b.label}</span>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-gray-400 mt-2 text-center">
        {helpfulCount} helpful beta{helpfulCount !== 1 ? 's' : ''}
        {next ? ` · ${next.threshold - helpfulCount} to ${next.label}` : ' · all badges earned 👑'}
      </p>
    </div>
  )
}

