import type { OutreachEvent, OutreachState } from '../shared/api'
import { readList } from './note'

const LOG_RE = /^(\d{4}-\d{2}-\d{2}), (out|in|note) · ([\w-]+): (.*)$/

function items(text: string): string[] {
  return readList(text, '## Outreach log').map((l) => l.replace(/^- /, '').trim())
}

export function parseLog(text: string, personId: string): OutreachEvent[] {
  const events: OutreachEvent[] = []
  for (const item of items(text)) {
    const m = item.match(LOG_RE)
    if (m) events.push({ personId, date: m[1], dir: m[2] as OutreachEvent['dir'], channel: m[3], text: m[4].trim() })
  }
  return events
}

export function logProblems(text: string): string[] {
  return items(text)
    .filter((item) => item !== '' && !LOG_RE.test(item))
    .map((item) => `Malformed outreach log line: "${item}"`)
}

export function formatLogLine(e: Omit<OutreachEvent, 'personId'>): string {
  return `- ${e.date}, ${e.dir} · ${e.channel}: ${e.text}`
}

function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

function addDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * 86_400_000).toISOString().slice(0, 10)
}

function when(date: string, today: string): string {
  const n = dayNumber(today) - dayNumber(date)
  if (n === 0) return 'today'
  if (n === 1) return 'yesterday'
  return `${n} days ago`
}

function channelName(channel: string): string {
  if (channel === 'linkedin') return 'LinkedIn'
  if (channel === 'email') return 'email'
  return channel
}

export function computeOutreach(
  input: { met: boolean; cadenceDays: number | null; nextFollowUp: string | null; companyClosed: boolean; lastMeeting: string | null },
  events: OutreachEvent[],
  today: string,
): OutreachState {
  const lastOf = (dir: 'out' | 'in'): string | null => events.filter((e) => e.dir === dir).map((e) => e.date).sort().pop() ?? null
  const lastOutbound = lastOf('out')
  const lastInbound = lastOf('in')
  const base = { lastOutbound, lastInbound }
  const none: OutreachState = { state: 'none', dueDate: null, reason: '', ...base }
  const { cadenceDays, nextFollowUp } = input

  if (input.companyClosed && !input.met) return none

  const dueState = (dueDate: string, reason: string): OutreachState => ({
    state: dueDate <= today ? 'follow-up-due' : 'waiting',
    dueDate,
    reason,
    ...base,
  })

  const latest = [...events].reverse().find((e) => e.dir === 'in' || e.dir === 'out')
  if (latest?.dir === 'in') {
    return {
      state: 'reply-owed',
      dueDate: nextFollowUp ?? latest.date,
      reason: `They replied by ${channelName(latest.channel)} ${when(latest.date, today)}`,
      ...base,
    }
  }
  if (latest?.dir === 'out' && cadenceDays != null) {
    return dueState(
      nextFollowUp ?? addDays(latest.date, cadenceDays),
      `You messaged on ${channelName(latest.channel)} ${when(latest.date, today)}, no reply`,
    )
  }
  if (input.met && cadenceDays != null) {
    const lastEvent = events.map((e) => e.date).sort().pop() ?? null
    const lastMeeting = input.lastMeeting
    const lastTouch = lastEvent && lastMeeting ? (lastEvent > lastMeeting ? lastEvent : lastMeeting) : (lastEvent ?? lastMeeting)
    if (!lastTouch) return none
    const isMeeting = lastMeeting !== null && lastMeeting === lastTouch
    const label = isMeeting ? 'Met' : 'Last touch'
    return dueState(
      nextFollowUp ?? addDays(lastTouch, cadenceDays),
      `${label} ${when(lastTouch, today)}, cadence ${cadenceDays} days`,
    )
  }
  return none
}
