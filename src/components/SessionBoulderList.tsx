import { useState } from 'react'
import { Plus, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { HoldGraphic, ProblemColorIcons } from './Chip'
import { BottomSheet } from './BottomSheet'
import { GymBoulderPicker } from './GymBoulderPicker'
import { boulderToPrefill } from '../utils/boulderPrefill'
import { useSessionProblems } from '../hooks/useProblems'
import { useAddGroupBoulder, useGroupBoulders, useSetMyBoulderEntry, useSessionGroupRow } from '../hooks/useSessionGroup'
import { boulderRows, sessionProjectSummary } from '../utils/sessionGroups'
import type { BoulderStatus } from '../utils/sessionGroups'
import type { GymProblem } from '../types'

const CHIP: Record<BoulderStatus, { label: string; className: string }> = {
  none:    { label: 'Not logged', className: 'bg-gray-100 text-gray-400' },
  project: { label: 'Project',    className: 'bg-khaki-100 text-khaki-700' },
  sent:    { label: 'Sent',       className: 'bg-sage-50 text-sage-800' },
}

/**
 * The group's shared boulder list, joined to the caller's own entries. A boulder
 * with no entry of yours is on the wall but not in your log, and costs you no row.
 */
export function SessionBoulderList({
  sessionId, groupId,
}: { sessionId: string; groupId: string }) {
  const { data: group } = useSessionGroupRow(groupId)
  // The group's gym is canonical -- read defensively rather than blocking on a
  // spinner; the picker's own empty state already covers an empty string while
  // the row is still loading.
  const gym = group?.gym ?? ''
  const { data: boulders = [] } = useGroupBoulders(groupId)
  const { data: problems = [] } = useSessionProblems(sessionId)
  const setEntry = useSetMyBoulderEntry()
  const [pickerOpen, setPickerOpen] = useState(false)
  const addBoulder = useAddGroupBoulder()

  const rows = boulderRows(
    boulders,
    problems.map(p => ({
      id: p.id,
      group_boulder_id: p.group_boulder_id,
      gym_problem_id: p.gym_problem_id,
      attempts: p.attempts,
      sent: p.sent,
    })),
  )
  const summary = sessionProjectSummary(rows)

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
        gym,
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
                    <ProblemColorIcons color={row.boulder.color} holdColor={row.boulder.hold_color} size={16} />
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
                  disabled={setEntry.isPending}
                  onClick={() => save(row, { attempts: row.attempts + 1, sent: row.status === 'sent' })}
                  className="flex-1 min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-white border border-gray-200 text-gray-600 text-sm font-semibold disabled:opacity-50"
                >
                  <Plus size={15} strokeWidth={2.25} />
                  {row.attempts === 0 ? 'Add a try' : `${row.attempts} ${row.attempts === 1 ? 'try' : 'tries'}`}
                </button>
                <button
                  type="button"
                  disabled={setEntry.isPending}
                  onClick={() => save(row, {
                    attempts: row.attempts === 0 ? 1 : row.attempts,
                    sent: row.status !== 'sent',
                  })}
                  aria-pressed={row.status === 'sent'}
                  className={`min-h-11 min-w-11 px-3.5 inline-flex items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold disabled:opacity-50 ${
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

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="w-full min-h-12 mt-2 inline-flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-gray-300 text-gray-600 text-sm font-semibold"
      >
        <Plus size={16} strokeWidth={2.25} />
        Add a boulder to the session
      </button>

      <BottomSheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Add a boulder">
        <p className="text-xs text-gray-500 mb-3 leading-relaxed">
          Puts it on the session's list for everyone; you log your own tries on it like any other boulder.
        </p>
        <GymBoulderPicker
          gym={gym}
          onPick={(gp: GymProblem) => {
            const prefill = boulderToPrefill(gp)
            addBoulder.mutate(
              {
                groupId,
                gymProblemId: gp.id,
                grade: prefill.grade_value,
                color: prefill.color,
                holdColor: prefill.hold_color,
                imageUrl: prefill.image_url,
                betaVideoUrl: prefill.beta_video_url,
              },
              {
                onSuccess: () => { setPickerOpen(false); toast.success('On the list') },
                onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not add it'),
              },
            )
          }}
        />
      </BottomSheet>
    </div>
  )
}
