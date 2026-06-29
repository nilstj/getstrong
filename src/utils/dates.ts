/**
 * Today's date as `YYYY-MM-DD` in the user's LOCAL timezone.
 * Avoids the `new Date().toISOString().slice(0,10)` trap, which returns the UTC
 * date and rolls over to tomorrow for negative-UTC users logging in the evening.
 */
export function todayDateString(d: Date = new Date()): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
