// Friendly date text, computed in the renderer. Vault dates are local YYYY-MM-DD strings.

const DAY = 86_400_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const utc = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Local calendar date as YYYY-MM-DD. */
export function isoDate(d: Date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const addDays = (iso: string, n: number): string =>
  new Date(utc(iso) + n * DAY).toISOString().slice(0, 10)

/** The one placeholder for a field with no value. */
export const EMPTY = 'Empty'

/** Whether `iso` is a real calendar date written as YYYY-MM-DD (2026-02-30 is not). */
export function isValidIsoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const t = utc(iso)
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === iso
}

/**
 * The one date format: "24 Nov", with the year ("24 Nov 2025") when it isn't the current year.
 * Anything that isn't a real YYYY-MM-DD date is shown exactly as stored.
 */
export function formatDate(iso: string, today: string): string {
  if (!isValidIsoDate(iso)) return iso
  const d = new Date(utc(iso))
  const day = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
  return iso.slice(0, 4) === today.slice(0, 4) ? day : `${day} ${d.getUTCFullYear()}`
}

/** "today", "3 days ago", "in 4 days", else "24 Nov" (or "20 Aug 2025" in another year). */
export function friendlyDate(iso: string, today: string): string {
  if (!isValidIsoDate(iso) || !isValidIsoDate(today)) return formatDate(iso, today)
  const diff = Math.round((utc(iso) - utc(today)) / DAY)
  if (diff === 0) return 'today'
  if (diff === -1) return 'yesterday'
  if (diff === 1) return 'tomorrow'
  if (diff < 0 && diff > -14) return `${-diff} days ago`
  if (diff > 0 && diff < 14) return `in ${diff} days`
  return formatDate(iso, today)
}

/** "Tuesday, 24 November" for screen headers. */
export function longDate(iso: string): string {
  const d = new Date(utc(iso))
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC'
  })
}

/** Elapsed time for history entries: "just now", "15 min ago", "3 h ago", then days or a date. */
export function timeAgo(timestamp: string, now: Date = new Date()): string {
  const secs = (now.getTime() - new Date(timestamp).getTime()) / 1000
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`
  if (secs < DAY / 1000) return `${Math.floor(secs / 3600)} h ago`
  return friendlyDate(isoDate(new Date(timestamp)), isoDate(now))
}
