// Pure logic for the record page's properties panel: which fields show, problems per field, new keys.
import type { FieldDef, FieldType, FieldValue } from '../../../shared/api'

const HIDDEN = new Set(['id', 'type', 'name'])
const hidden = (key: string): boolean => HIDDEN.has(key) || key.startsWith('_')

/** Schema fields shown as properties, in schema order. `name` is edited through the title. */
export const propertyFields = (fields: FieldDef[]): FieldDef[] =>
  fields.filter((f) => !hidden(f.key))

/** No value: missing, null, blank text, an empty list or an unticked checkbox. */
export const isEmptyValue = (v: FieldValue | undefined): boolean =>
  v === null ||
  v === undefined ||
  v === false ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.every((x) => String(x).trim() === ''))

/**
 * The company page shows filled fields and folds empty ones behind "Show N empty fields".
 * `keep` holds keys that had a value (or a problem) at some point on this page, so a field you
 * just filled, or cleared, doesn't vanish under you. Schema order is kept.
 */
export function splitEmptyFields(
  fields: FieldDef[],
  values: Record<string, FieldValue>,
  keep: ReadonlySet<string>
): { shown: FieldDef[]; hidden: FieldDef[] } {
  const shown: FieldDef[] = []
  const hidden: FieldDef[] = []
  for (const f of fields) (isEmptyValue(values[f.key]) && !keep.has(f.key) ? hidden : shown).push(f)
  return { shown, hidden }
}

/** Frontmatter keys the schema doesn't define (shown read-only under "Other properties"). */
export function otherKeys(values: Record<string, FieldValue>, fields: FieldDef[]): string[] {
  const known = new Set(fields.map((f) => f.key))
  return Object.keys(values).filter((k) => !hidden(k) && !known.has(k))
}

/** Splits index problems ("key: message") into per-field messages and the rest. */
export function splitProblems(
  problems: string[],
  keys: string[]
): { byKey: Record<string, string[]>; unmatched: string[] } {
  const byKey: Record<string, string[]> = {}
  const unmatched: string[] = []
  for (const p of problems) {
    const key = keys.find((k) => p.startsWith(`${k}: `))
    if (key) (byKey[key] ??= []).push(p.slice(key.length + 2))
    else unmatched.push(p)
  }
  return { byKey, unmatched }
}

export const KEY_RE = /^[a-z][a-z0-9_]*$/

/** "Board seat?" → "board_seat". */
export const keyFromLabel = (label: string): string =>
  label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

/** Why `key` can't be a new field key, or null. */
export function propertyKeyProblem(key: string, existing: string[]): string | null {
  if (!key) return 'Give the property a label with at least one letter.'
  if (!KEY_RE.test(key)) return 'The key must start with a letter (a–z).'
  if (existing.includes(key) || HIDDEN.has(key))
    return `There is already a property with the key ${key}.`
  return null
}

/** A field value as a list (relations and multi-selects may be stored as one string). */
export function listValue(v: FieldValue | undefined): string[] {
  if (Array.isArray(v)) return v.map(String)
  if (v === null || v === undefined || v === '') return []
  return [String(v)]
}

/** A raw value as plain text. */
export function displayValue(v: FieldValue | undefined): string {
  if (Array.isArray(v)) return v.join(', ')
  if (v === null || v === undefined) return ''
  return String(v)
}

/** An https link for a URL field (bare domains get https://); anything else gets no link. */
export function httpsHref(v: string): string | null {
  const s = v.trim()
  if (!s) return null
  if (/^https:\/\//i.test(s)) return s
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null
  return /^[^\s/]+\.[^\s/]+/.test(s) ? `https://${s}` : null
}

/** An option's stored value from its label: "Series A+" → "series-a". */
export const optionValue = (label: string): string =>
  label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** "board_seat" → "Board seat". */
export const labelFromKey = (key: string): string => {
  const s = key.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** A sensible field type for an unknown key, from the value already in the note. */
export function guessType(v: FieldValue | undefined): FieldType {
  if (typeof v === 'boolean') return 'checkbox'
  if (typeof v === 'number') return 'number'
  const list = listValue(v)
  if (list.length && list.every((x) => /^\[\[.+\]\]$/.test(x))) return 'relation'
  if (Array.isArray(v)) return 'multi-select'
  const s = list[0] ?? ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'date'
  if (/^https?:\/\//.test(s)) return 'url'
  return 'text'
}

/**
 * Saves a text field's draft if it differs from the stored value and wasn't already sent.
 * Resolves when the write finishes (so a flush can wait for it); a failed write clears `sent`.
 */
export async function saveDraft(
  draft: string,
  saved: string,
  sent: { current: string | null },
  commit: (v: FieldValue) => Promise<boolean>
): Promise<void> {
  const next = draft.trim()
  if (next === saved || next === sent.current) return
  sent.current = next
  const ok = await commit(next === '' ? null : next)
  if (!ok && sent.current === next) sent.current = null
}
