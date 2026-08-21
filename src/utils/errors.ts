/**
 * The message a thrown value actually carries — including the ones that are not
 * `Error` instances.
 *
 * Every hook here reads Supabase's `{ data, error }` shape and does
 * `if (error) throw error`. postgrest-js only constructs a real `PostgrestError`
 * (which does extend `Error`) when a query opts into `.throwOnError()`; on the
 * `{ data, error }` path it sets `error = JSON.parse(body)` — a **plain object**.
 * So `e instanceof Error` is false for every server-side failure, and the
 * `e instanceof Error ? e.message : 'Could not …'` idiom threw the server's
 * reason away and showed the generic fallback instead. Worse where a caller
 * branched on the text: `join_session`'s `VERDICT_OUT` and `NEEDS_APPROVAL`
 * sentinels never matched, because the string being tested was always empty.
 *
 * Handles a `raise exception` from plpgsql (`{ code: 'P0001', message }`), a
 * PostgREST-level failure (`{ code: 'PGRST202', … }`), a real `Error` from
 * anywhere else, and a bare thrown string.
 */
export function errorMessage(e: unknown, fallback = ''): string {
  const raw =
    typeof e === 'string' ? e
    : e instanceof Error ? e.message
    : typeof e === 'object' && e !== null && 'message' in e
      && typeof (e as { message: unknown }).message === 'string'
      ? (e as { message: string }).message
    : ''
  return raw.trim() || fallback
}
