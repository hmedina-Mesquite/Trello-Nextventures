// Shared by CardItem, CardDetailModal, and CalendarPage -- all three need
// the same start/end-date formatting and datetime-local <-> ISO conversion
// (flagged by an audit pass as worth consolidating once a third caller
// needed it; this is that third caller).

/** ISO timestamp -> the local "YYYY-MM-DDTHH:mm" a <input type="datetime-local"> needs.
 * Deliberately local time, not UTC -- datetime-local has no zone of its own,
 * it always means "this wall-clock time in whatever zone the browser is in". */
export function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromDatetimeLocalValue(value: string): string | null {
  if (!value) return null
  return new Date(value).toISOString()
}

/** Re-stamps a datetime-local value to noon UTC of the same calendar date --
 * used whenever a card has no end_date (all-day/deadline mode), so the
 * stored instant doesn't drift a day depending on the viewer's timezone the
 * way a literal near-midnight local stamp could. */
export function toAllDayNoonUtc(value: string): string | null {
  if (!value) return null
  const [datePart] = value.split('T')
  return `${datePart}T12:00:00.000Z`
}

/** Full display: date, plus a time range when there's a real end time. */
export function formatCardDateRange(startDate: string, endDate: string | null): string {
  const start = new Date(startDate)
  if (!endDate) return start.toLocaleDateString()
  const end = new Date(endDate)
  const startTime = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const endTime = end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const sameDay = start.toDateString() === end.toDateString()
  return sameDay
    ? `${start.toLocaleDateString()} ${startTime} - ${endTime}`
    : `${start.toLocaleString()} - ${end.toLocaleString()}`
}

/** For contexts already grouped by day (CalendarPage) -- time portion only. */
export function formatTimeRangeOnly(startDate: string, endDate: string | null): string {
  if (!endDate) return '(todo el día)'
  const start = new Date(startDate)
  const end = new Date(endDate)
  const startTime = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const endTime = end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `${startTime} - ${endTime}`
}
