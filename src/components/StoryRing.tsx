export function StoryRing({
  label,
  imageUrl,
  active = true,
  onClick,
}: {
  label: string
  imageUrl?: string | null
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
        className={`w-14 h-14 rounded-full p-[2.5px] ${
          active
            ? 'bg-gradient-to-tr from-sage-600 via-khaki-400 to-sage-400'
            : 'bg-gray-300'
        }`}
      >
        <span className="block w-full h-full rounded-full border-2 border-white bg-sage-100 bg-cover bg-center"
          style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined} />
      </span>
      <span className="text-[10px] leading-tight text-gray-600 text-center line-clamp-2 max-w-[64px]">{label}</span>
    </button>
  )
}
