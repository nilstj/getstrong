interface FABProps {
  onClick: () => void
  label?: string
}

export function FAB({ onClick, label = 'Add' }: FABProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="fixed bottom-24 right-4 z-40 w-12 h-12 bg-black text-white rounded-full shadow-lg flex items-center justify-center text-2xl leading-none active:scale-95 transition-transform"
    >
      +
    </button>
  )
}
