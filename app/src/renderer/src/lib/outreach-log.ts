// The log forms accept an empty summary; the entry then says what happened instead.
const FALLBACK = { out: 'Sent', in: 'Replied' } as const

export function logEntryText(dir: 'out' | 'in', text: string): string {
  return text.trim() || FALLBACK[dir]
}
