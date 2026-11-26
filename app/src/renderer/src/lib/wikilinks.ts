// [[Wiki link]] helpers for the editor: the link under the cursor, an open "[[" query, name matching.
import type { FieldValue } from '../../../shared/api'

/**
 * A [[link]] on one line: [[Target]], [[Target|alias]], [[Target#Heading]] or
 * [[Target#Heading|alias]]. Group 1 is the target, without the heading, as in core/links.ts.
 */
export const LINK = /\[\[([^\][\n|#]*)(#[^\][\n|]*)?(\|[^\][\n]*)?\]\]/g

/** The link spanning `pos` (inclusive of its brackets), or null. */
export function linkAt(
  text: string,
  pos: number
): { name: string; from: number; to: number } | null {
  for (const m of text.matchAll(LINK)) {
    const from = m.index
    const to = from + m[0].length
    if (pos >= from && pos <= to) return m[1].trim() ? { name: m[1].trim(), from, to } : null
  }
  return null
}

/** An unclosed "[[" before the cursor on the same line: where it starts and what's typed after it. */
export function linkQuery(before: string): { from: number; text: string } | null {
  const m = /\[\[([^\][\n|]*)$/.exec(before)
  return m ? { from: m.index, text: m[1] } : null
}

/** Whether a link's target is among `names` (lower-cased record names and aliases). */
export const isKnownLink = (name: string, names: ReadonlySet<string>): boolean =>
  names.has(name.trim().toLowerCase())

/** Whether a record's name or one of its aliases is `name` (case-insensitive). */
export function matchesName(
  r: { name: string; fields: Record<string, FieldValue> },
  name: string
): boolean {
  const n = name.trim().toLowerCase()
  const aliases = Array.isArray(r.fields.aliases) ? r.fields.aliases.map(String) : []
  return [r.name, ...aliases].some((x) => x.trim().toLowerCase() === n)
}
