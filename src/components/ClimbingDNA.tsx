import { useMemo } from 'react'
import type { TagStat } from '../hooks/useProblemTags'
import type { ProblemTagDefinition } from '../types'

// Deterministic pseudo-rotation per tag name so the layout is stable
function tagRotation(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff
  const deg = ((hash % 11) - 5) // –5 … +5
  return `rotate(${deg}deg)`
}

const CATEGORY_PALETTE: Record<string, { bg: string; text: string; ring: string; dim: string }> = {
  holds:      { bg: 'bg-violet-100', text: 'text-violet-800', ring: 'ring-violet-300', dim: 'text-violet-300' },
  style:      { bg: 'bg-amber-100',  text: 'text-amber-800',  ring: 'ring-amber-300',  dim: 'text-amber-300'  },
  'wall type':{ bg: 'bg-emerald-100',text: 'text-emerald-800',ring: 'ring-emerald-300',dim: 'text-emerald-300'},
  general:    { bg: 'bg-gray-100',   text: 'text-gray-600',   ring: 'ring-gray-300',   dim: 'text-gray-300'   },
}

function palette(category: string) {
  return CATEGORY_PALETTE[category] ?? CATEGORY_PALETTE.general
}

function sizeClass(count: number, max: number): string {
  const ratio = max > 0 ? count / max : 0
  if (ratio >= 0.8) return 'text-3xl font-black'
  if (ratio >= 0.55) return 'text-2xl font-extrabold'
  if (ratio >= 0.35) return 'text-xl font-bold'
  if (ratio >= 0.18) return 'text-base font-semibold'
  return 'text-sm font-medium'
}

interface CloudWordProps {
  tag: TagStat
  max: number
  highlight?: boolean
}

function CloudWord({ tag, max, highlight }: CloudWordProps) {
  const p = palette(tag.category)
  const sz = sizeClass(tag.count, max)
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full transition-all select-none ${sz} ${p.bg} ${p.text} ${
        highlight ? `ring-2 ${p.ring}` : ''
      }`}
      style={{ transform: tagRotation(tag.name), margin: '4px 3px' }}
      title={`${tag.name}: ${tag.count} problem${tag.count !== 1 ? 's' : ''}`}
    >
      {tag.name}
    </span>
  )
}

interface ClimbingDNAProps {
  tagStats: TagStat[]
  allTags: ProblemTagDefinition[]
}

export function ClimbingDNA({ tagStats, allTags }: ClimbingDNAProps) {
  const totalTagged = useMemo(() => tagStats.reduce((s, t) => s + t.count, 0), [tagStats])
  const max = tagStats[0]?.count ?? 1

  // Tags the user has NEVER climbed (present in definitions, zero count)
  const doneIds = new Set(tagStats.map(t => t.id))
  const notDone = allTags.filter(t => !doneIds.has(t.id))

  // Least-done (bottom 30% by count, min 1 done)
  const weakDone = tagStats.filter(t => {
    const ratio = t.count / max
    return ratio < 0.25 && t.count > 0
  })

  const weakSpots = [...notDone.map(t => ({ ...t, count: 0 })), ...weakDone]
    .slice(0, 8)

  if (tagStats.length === 0 && allTags.length === 0) return null

  const top = tagStats[0]

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div>
          <h2 className="text-base font-black tracking-tight">Climbing DNA 🧬</h2>
          {totalTagged > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">{totalTagged} tag{totalTagged !== 1 ? 's' : ''}</p>
          )}
        </div>
        {top && (
          <div className="text-right">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Top move</p>
            <p className={`text-sm font-bold ${palette(top.category).text}`}>{top.name} 🔥</p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-3 px-4 pb-2">
        {Object.entries(CATEGORY_PALETTE).filter(([k]) => k !== 'general').map(([cat, p]) => (
          <div key={cat} className="flex items-center gap-1">
            <span className={`w-2.5 h-2.5 rounded-full ${p.bg} ring-1 ${p.ring}`} />
            <span className="text-[10px] text-gray-400 capitalize">{cat}</span>
          </div>
        ))}
      </div>

      {/* Word cloud */}
      {tagStats.length > 0 ? (
        <div className="px-3 pb-3 flex flex-wrap items-center justify-center" style={{ minHeight: 100 }}>
          {tagStats.map(tag => (
            <CloudWord key={tag.id} tag={tag} max={max} highlight={tag.id === top?.id} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400 text-center py-6 px-4">
          Tag your problems to see your climbing style here.
        </p>
      )}

      {/* Weak spots */}
      {weakSpots.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
            💪 Level up — train more of these
          </p>
          <div className="flex flex-wrap gap-1.5">
            {weakSpots.map(tag => {
              const p = palette(tag.category)
              return (
                <span
                  key={tag.id}
                  className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border-2 border-dashed ${p.ring.replace('ring-', 'border-')} ${p.dim} font-semibold`}
                >
                  {tag.name}
                  {tag.count > 0 && (
                    <span className="opacity-60">×{tag.count}</span>
                  )}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
