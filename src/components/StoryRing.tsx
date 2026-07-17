import { GymThumb } from './GymThumb'
import { VideoBadge } from './VideoBadge'

export function StoryRing({
  label,
  imageUrl,
  fallbackGym,
  helpWanted = false,
  hasVideo = false,
  active = true,
  onClick,
}: {
  label: string
  imageUrl?: string | null
  fallbackGym?: string | null
  helpWanted?: boolean
  hasVideo?: boolean
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 w-16 flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 rounded-xl"
    >
      <span
        className={`relative w-14 h-14 rounded-full p-[2.5px] ${
          active
            ? 'bg-gradient-to-tr from-sage-600 via-khaki-400 to-sage-400'
            : 'bg-gray-300'
        }`}
      >
        {helpWanted && (
          <span className="absolute -top-0.5 -right-0.5 z-10 grid place-items-center w-5 h-5 rounded-full bg-amber-400 border-2 border-white text-[10px] leading-none"
            title="Help wanted">🆘</span>
        )}
        {imageUrl ? (
          <span className="block w-full h-full rounded-full border-2 border-white bg-cover bg-center"
            style={{ backgroundImage: `url(${imageUrl})` }} />
        ) : fallbackGym ? (
          <span className="block w-full h-full rounded-full border-2 border-white overflow-hidden">
            <GymThumb gym={fallbackGym} compact className="w-full h-full" />
          </span>
        ) : (
          <span className="block w-full h-full rounded-full border-2 border-white bg-sage-100" />
        )}
        {hasVideo && <VideoBadge className="absolute bottom-0 right-0 border-2 border-white" />}
      </span>
      <span className="text-[10px] leading-tight text-gray-600 text-center line-clamp-2 max-w-[64px]">{label}</span>
    </button>
  )
}
