interface FABProps {
  onClick: () => void
  label?: string
}

export function FAB({ onClick, label = 'Add' }: FABProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="fixed bottom-20 right-4 z-40 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg flex items-center justify-center text-3xl leading-none"
    >
      +
    </button>
  )
}
