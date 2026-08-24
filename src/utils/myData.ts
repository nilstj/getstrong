import { format } from 'date-fns'

/** What `export_my_data()` returns: one section per table.column that had rows. */
export interface ExportEnvelope {
  generated_at: string
  user_id: string
  data: Record<string, unknown[]>
  unmapped_tables: string[]
}

export interface ExportSummary {
  rowCount: number
  tableCount: number
  unmapped: string[]
}

export function exportFilename(date: Date): string {
  return `moresends-export-${format(date, 'yyyy-MM-dd')}.json`
}

export function summariseExport(envelope: ExportEnvelope): ExportSummary {
  const sections = Object.values(envelope.data ?? {}).filter(Array.isArray)
  return {
    rowCount: sections.reduce((n, rows) => n + rows.length, 0),
    tableCount: sections.length,
    unmapped: envelope.unmapped_tables ?? [],
  }
}

/**
 * Guards an irreversible action, so it fails closed: with no username to type
 * against, nothing matches -- including the empty string.
 */
export function deletionConfirmationMatches(
  typed: string,
  username: string | null | undefined,
): boolean {
  if (!username?.trim()) return false
  return typed.trim().toLowerCase() === username.trim().toLowerCase()
}
