import { CREW_TITLE_META } from '../utils/crewTitles'
import type { CrewTitle } from '../types'

export function CrewTitleBadge({ title }: { title: CrewTitle }) {
  const meta = CREW_TITLE_META[title]
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sage-50 border border-sage-200 px-2 py-0.5 text-[11px] font-semibold text-sage-800">
      <span aria-hidden>{meta.emoji}</span> {meta.label}
    </span>
  )
}
