// [[Wiki link]] helpers for the editor: the link under the cursor, an open "[[" query, name matching.
import type { FieldValue } from '../../../shared/api'

const LINK = /\[\[([^\][\n|]+)(\|[^\][\n]*)?\]\]/g

/** The link spanning `pos` (inclusive of its brackets), or null. */
export function linkAt(
  text: string,
  pos: number
): { name: string; from: number; to: number } | null {
  for (const m of text.matchAll(LINK)) {
    const from = m.index
    const to = from + m[0].length
    if (pos >= from && pos <= to) return { name: m[1].trim(), from, to }
  }
  return null
}

/** An unclosed "[[" before the cursor on the same line: where it starts and what's typed after it. */
export function linkQuery(before: string): { from: number; text: string } | null {
  const m = /\[\[([^\][\n|]*)$/.exec(before)
  return m ? { from: m.index, text: m[1] } : null
}

/** Whether a record's name or one of its aliases is `name` (case-insensitive). */
export function matchesName(
  r: { name: string; fields: Record<string, FieldValue> },
  name: string
): boolean {
  const n = name.trim().toLowerCase()
  const aliases = Array.isArray(r.fields.aliases) ? r.fields.aliases.map(String) : []
  return [r.name, ...aliases].some((x) => x.trim().toLowerCase() === n)
}
