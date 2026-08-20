import { Plus, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { HoldGraphic } from './Chip'
import { useSessionProblems } from '../hooks/useProblems'
import { useGroupBoulders, useSetMyBoulderEntry } from '../hooks/useSessionGroup'
import { boulderRows, sessionProjectSummary } from '../utils/sessionGroups'
import type { BoulderStatus } from '../utils/sessionGroups'

const CHIP: Record<BoulderStatus, { label: string; className: string }> = {
  none:    { label: 'Not logged', className: 'bg-gray-100 text-gray-400' },
  project: { label: 'Project',    className: 'bg-khaki-100 text-khaki-700' },
  sent:    { label: 'Sent',       className: 'bg-sage-50 text-sage-800' },
}

/**
 * The group's shared boulder list, joined to the caller's own entries. A boulder
 * with no entry of yours is on the wall but not in your log, and costs you no row.
 */
export function SessionBoulderList({ sessionId, groupId }: { sessionId: string; groupId: string }) {
  const { data: boulders = [] } = useGroupBoulders(groupId)
  const { data: problems = [] } = useSessionProblems(sessionId)
  const setEntry = useSetMyBoulderEntry()

  const rows = boulderRows(
    boulders,
    problems.map(p => ({ id: p.id, group_boulder_id: p.group_boulder_id, attempts: p.attempts, sent: p.sent })),
  )
  const summary = sessionProjectSummary(rows)

  if (boulders.length === 0) return null

  const save = (
    row: (typeof rows)[number],
    next: { attempts: number; sent: boolean },
  ) => {
    setEntry.mutate(
      {
        sessionId, groupId,
        groupBoulderId: row.boulder.id,
        entryId: row.entryId,
        boulder: row.boulder,
        ...next,
      },
      { onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not save') },
    )
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-base font-semibold">Boulders ({boulders.length})</h2>
        <span className="text-xs font-semibold text-gray-400 tabular-nums">{summary.label}</span>
      </div>

      <div className="space-y-2">
        {rows.map(row => {
          const chip = CHIP[row.status]
          return (
            <div
              key={row.boulder.id}
              className={`rounded-2xl p-3 border ${row.status === 'none' ? 'bg-white border-dashed border-gray-300' : 'bg-gray-50 border-gray-100'}`}
            >
              <div className="flex items-start gap-2.5">
                <div className="w-14 h-14 rounded-xl bg-gray-100 grid place-items-center flex-shrink-0">
                  {row.boulder.image_url
                    ? <img src={row.boulder.image_url} alt="" className="w-full h-full object-cover rounded-xl" />
                    : <HoldGraphic color={row.boulder.hold_color} size={36} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {row.boulder.grade_value && (
                      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold tracking-tight bg-sage-700 text-white">
                        {row.boulder.grade_value}
                      </span>
                    )}
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${chip.className}`}>
                      {chip.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">
                    {row.attempts === 0 ? 'no tries logged' : `${row.attempts} ${row.attempts === 1 ? 'try' : 'tries'}`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-2.5">
                <button
                  type="button"
                  onClick={() => save(row, { attempts: row.attempts + 1, sent: row.status === 'sent' })}
                  className="flex-1 min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-white border border-gray-200 text-gray-600 text-sm font-semibold"
                >
                  <Plus size={15} strokeWidth={2.25} />
                  {row.attempts === 0 ? 'Add a try' : `${row.attempts} ${row.attempts === 1 ? 'try' : 'tries'}`}
                </button>
                <button
                  type="button"
                  onClick={() => save(row, {
                    attempts: row.attempts === 0 ? 1 : row.attempts,
                    sent: row.status !== 'sent',
                  })}
                  aria-pressed={row.status === 'sent'}
                  className={`min-h-11 min-w-11 px-3.5 inline-flex items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold ${
                    row.status === 'sent'
                      ? 'bg-sage-50 border-sage-300 text-sage-800'
                      : 'bg-white border-gray-200 text-gray-400'
                  }`}
                >
                  <Check size={16} strokeWidth={2.5} />
                  Sent
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
