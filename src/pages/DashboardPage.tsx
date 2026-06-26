import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFriendsFeed } from '../hooks/useFriendsFeed'
import { useDiscoverBoulders } from '../hooks/useDiscoverBoulders'
import { FriendSessionCard } from '../components/FriendSessionCard'
import { StoryRing } from '../components/StoryRing'
import { ImageLightbox } from '../components/ImageLightbox'

export function DashboardPage() {
  const navigate = useNavigate()
  const { data: boulders } = useDiscoverBoulders()
  // Stories = your active crews first, then nearby boulders to discover; each
  // opens its own crew page rather than the generic /crews index.
  const stories = [...(boulders?.yours ?? []), ...(boulders?.discover ?? [])].slice(0, 12)
  const { data: sessions = [], isLoading } = useFriendsFeed()
  const [lightbox, setLightbox] = useState<string | null>(null)

  return (
    <div className="pb-32 lg:max-w-2xl lg:mx-auto">
      {stories.length > 0 && (
        <div className="flex gap-3 overflow-x-auto px-4 py-3 border-b border-gray-100">
          {stories.map(b => (
            <StoryRing key={b.id} label={b.title} imageUrl={b.image_url} onClick={() => navigate(`/gym-problems/${b.id}`)} />
          ))}
        </div>
      )}

      <div className="px-4 py-4 space-y-3">
        {isLoading ? (
          <p className="py-10 text-center text-sm text-gray-400">Loading your friends' sessions…</p>
        ) : sessions.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-500">No friend activity yet.</p>
            <p className="mt-1 text-xs text-gray-400">
              Follow some climbers — their sessions will show up here.
            </p>
          </div>
        ) : (
          sessions.map(s => (
            <FriendSessionCard key={s.sessionId} session={s} onPhoto={setLightbox} />
          ))
        )}
      </div>

      {lightbox && <ImageLightbox url={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}
