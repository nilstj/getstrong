import { GymThumb } from './GymThumb'
import { VideoBadge } from './VideoBadge'
import { ProblemColorIcons } from './Chip'

export function StoryRing({
  label,
  imageUrl,
  fallbackGym,
  color,
  holdColor,
  helpWanted = false,
  hasVideo = false,
  seen = false,
  onClick,
}: {
  label: string
  imageUrl?: string | null
  fallbackGym?: string | null
  color?: string | null
  holdColor?: string | null
  helpWanted?: boolean
  hasVideo?: boolean
  /** Already opened by this user — the ring goes grey. Unseen rings are blue. */
  seen?: boolean
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
          seen
            ? 'bg-gray-300'
            : 'bg-gradient-to-tr from-blue-600 via-blue-400 to-sky-400'
        }`}
      >
        {helpWanted && (
          <span className="absolute -top-0.5 -left-0.5 z-10 grid place-items-center w-5 h-5 rounded-full bg-amber-400 border-2 border-white text-[10px] leading-none"
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
        {hasVideo && <VideoBadge variant="corner" className="absolute -top-0.5 -right-0.5 border-2 border-white" />}
        {(color || holdColor) && (
          <ProblemColorIcons color={color} holdColor={holdColor} size={13} className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-1 py-0.5 shadow-sm" />
        )}
      </span>
      <span className="text-[10px] leading-tight text-gray-600 text-center line-clamp-2 max-w-[64px]">{label}</span>
    </button>
  )
}
