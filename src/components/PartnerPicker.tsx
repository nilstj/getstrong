import { useState } from 'react'
import { Users } from 'lucide-react'
import { useFollowing } from '../hooks/useFollows'
import { useProfile } from '../hooks/useProfile'
import { BottomSheet } from './BottomSheet'

interface PartnerPickerProps {
  currentPartnerIds: string[]
  onSave: (ids: string[]) => void
  isSaving?: boolean
  label?: string
}

export function PartnerPicker({ currentPartnerIds, onSave, isSaving, label = 'Add partners' }: PartnerPickerProps) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set(currentPartnerIds))
  const { data: following = [] } = useFollowing()

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleOpen = () => {
    setSelected(new Set(currentPartnerIds))
    setOpen(true)
  }

  const handleSave = () => {
    onSave(Array.from(selected))
    setOpen(false)
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-sage-700 transition-colors"
      >
        <Users size={14} />
        <span>{label}</span>
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Tag Friends">
        {following.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Follow friends to tag them.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              {following.map(f => (
                <FollowerRow
                  key={f.following_id}
                  userId={f.following_id}
                  selected={selected.has(f.following_id)}
                  onToggle={() => toggle(f.following_id)}
                />
              ))}
            </div>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full bg-sage-700 text-white py-3 rounded-xl font-semibold disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : `Done${selected.size > 0 ? ` (${selected.size})` : ''}`}
            </button>
          </div>
        )}
      </BottomSheet>
    </>
  )
}

function FollowerRow({ userId, selected, onToggle }: { userId: string; selected: boolean; onToggle: () => void }) {
  const { data: profile } = useProfile(userId)
  if (!profile) return null
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-colors ${
        selected ? 'border-sage-600 bg-sage-50' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-gray-500 text-sm font-medium">
          {profile.avatar_url
            ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            : profile.username?.[0]?.toUpperCase() ?? '?'}
        </div>
        <span className="font-medium text-sm">{profile.username}</span>
      </div>
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
        selected ? 'border-sage-600 bg-sage-600' : 'border-gray-300'
      }`}>
        {selected && <span className="text-white text-xs">✓</span>}
      </div>
    </button>
  )
}

interface PartnerAvatarsProps {
  partnerIds: string[]
  size?: 'sm' | 'xs'
}

export function PartnerAvatars({ partnerIds, size = 'sm' }: PartnerAvatarsProps) {
  if (partnerIds.length === 0) return null
  const dim = size === 'xs' ? 'w-5 h-5 text-[9px]' : 'w-6 h-6 text-[10px]'
  return (
    <div className="flex items-center -space-x-1.5">
      {partnerIds.slice(0, 4).map(id => (
        <PartnerAvatar key={id} userId={id} dim={dim} />
      ))}
      {partnerIds.length > 4 && (
        <div className={`${dim} rounded-full bg-gray-200 border border-white flex items-center justify-center font-medium text-gray-500`}>
          +{partnerIds.length - 4}
        </div>
      )}
    </div>
  )
}

function PartnerAvatar({ userId, dim }: { userId: string; dim: string }) {
  const { data: profile } = useProfile(userId)
  return (
    <div className={`${dim} rounded-full bg-sage-100 border border-white overflow-hidden flex items-center justify-center text-sage-700 font-medium`}>
      {profile?.avatar_url
        ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
        : profile?.username?.[0]?.toUpperCase() ?? '?'}
    </div>
  )
}
