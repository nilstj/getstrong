import { Plus } from 'lucide-react'

interface FABProps {
  onClick: () => void
  label?: string
}

export function FAB({ onClick, label = 'Add' }: FABProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="fixed bottom-24 right-4 z-40 w-12 h-12 bg-sage-700 text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform"
    >
      <Plus size={22} strokeWidth={2.5} />
    </button>
  )
}
