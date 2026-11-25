// Pure logic for Settings: the option editor, key rename checks, usage counts and history reasons.
import type {
  FieldType,
  FieldValue,
  HistoryEntry,
  OptionDef,
  RecordSummary,
  StageCategory
} from '../../../shared/api'
import { KEY_RE } from './properties'

/** An option being edited. `origin` is the value it had when the editor opened (null for new ones). */
export interface EditOption extends OptionDef {
  origin: string | null
}

export const CATEGORIES: [StageCategory, string][] = [
  ['new', 'New'],
  ['in-progress', 'In progress'],
  ['active', 'Active'],
  ['closed', 'Closed']
]

export const hasOptions = (t: FieldType): boolean =>
  t === 'select' || t === 'stage' || t === 'multi-select'

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  select: 'Select',
  'multi-select': 'Multi-select',
  stage: 'Stage',
  relation: 'Link to records',
  url: 'Web address',
  checkbox: 'Checkbox'
}

export const toEditOptions = (options: OptionDef[] | undefined): EditOption[] =>
  (options ?? []).map((o) => ({
    value: o.value,
    label: o.label,
    ...(o.category ? { category: o.category } : {}),
    origin: o.value
  }))

/** The option list to send: a changed value carries `renamedFrom` so notes follow the rename. */
export const toOptionDefs = (options: EditOption[]): OptionDef[] =>
  options.map(({ origin, ...o }) =>
    origin !== null && origin !== o.value ? { ...o, renamedFrom: origin } : o
  )

/** Move the option at `i` by `by` places (−1 up, +1 down); out-of-range moves leave the list as it was. */
export function moveOption<T>(list: T[], i: number, by: -1 | 1): T[] {
  const j = i + by
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return list
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/** Why `value` can't be option `index`'s value, or null. */
export function optionValueProblem(
  value: string,
  options: EditOption[],
  index: number
): string | null {
  if (!value) return 'Give the option a value.'
  if (!/^[a-z0-9][a-z0-9-_]*$/.test(value)) return 'Use lowercase letters, digits and dashes.'
  if (options.some((o, i) => i !== index && o.value === value))
    return `There is already an option with the value ${value}.`
  return null
}

/** Why `to` can't be a field's new key, or null. */
export function renameKeyProblem(to: string, from: string, existing: string[]): string | null {
  if (!to) return 'Give the field a key.'
  if (to === from) return 'That is already the key.'
  if (!KEY_RE.test(to))
    return 'The key must start with a lowercase letter and use only a–z, 0–9 and underscores.'
  if (existing.includes(to)) return `There is already a field with the key ${to}.`
  return null
}

const hasValue = (v: FieldValue | undefined): boolean =>
  Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== '' && v !== false

/** How many of `records` have a non-empty value for `key`. */
export const usedBy = (records: RecordSummary[], key: string): number =>
  records.filter((r) => hasValue(r.fields[key])).length

/** What a deleting field would do, in the confirmation's words. */
export function deleteSentence(label: string, count: number): string {
  const where =
    count === 0
      ? 'No notes use it.'
      : `Removes ${label} from ${count} ${count === 1 ? 'note' : 'notes'}.`
  return `${where} You can undo this from History.`
}

export const KIND_LABEL: Record<HistoryEntry['kind'], string> = {
  action: 'Action',
  undo: 'Undo',
  external: 'Outside edit'
}

/** For an entry that can't be undone, why (null when it can be undone). */
export function notUndoableReason(e: Pick<HistoryEntry, 'kind' | 'undoable'>): string | null {
  if (e.undoable) return null
  return e.kind === 'external'
    ? "Edits made outside Kew can't be undone here"
    : 'This note changed since'
}
