// Text for the derived `_last_touch` field: "YYYY-MM-DD|out|linkedin" → "Messaged 3 days ago".
import { friendlyDate } from './dates'

const VERB = { out: 'Messaged', in: 'Replied', note: 'Note' } as const

export function lastTouchText(raw: unknown, today: string): string {
  if (typeof raw !== 'string') return ''
  const [date, dir] = raw.split('|')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !(dir in VERB)) return ''
  const when = friendlyDate(date, today)
  const verb = VERB[dir as keyof typeof VERB]
  return `${verb} ${when}` // "Messaged today", "Replied yesterday", "Note 3 days ago", "Messaged 3 Oct"
}
