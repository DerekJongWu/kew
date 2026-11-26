// Pure logic for the Pipeline screen: board columns, drops, filters, sorting and saved-view edits.
import type { FieldDef, OptionDef, RecordSummary, ViewDef } from '../../../shared/api'

const FILTERABLE = new Set(['select', 'stage', 'multi-select', 'relation'])
export const filterableFields = (fields: FieldDef[]): FieldDef[] =>
  fields.filter((f) => FILTERABLE.has(f.type) && f.key !== 'aliases')

const norm = (s: string): string => s.trim().toLowerCase()
export const unwrap = (v: string): string => v.replace(/^\[\[(.*?)(\|.*)?\]\]$/, '$1')

/** Values of a field as plain strings (relations unwrapped), whatever the stored shape. */
export function valuesOf(v: unknown): string[] {
  const list = Array.isArray(v) ? v : v === null || v === undefined || v === '' ? [] : [v]
  return list.map((x) => unwrap(String(x)))
}

export interface Column {
  value: string // '' for the catch-all column
  label: string
  category?: OptionDef['category']
  rows: RecordSummary[]
}

/**
 * Board columns: the group field's options in schema order, limited to the values the view's
 * filter allows for that field. Cards whose value matches no column land in a final "No <field>" column.
 */
export function boardColumns(view: ViewDef, field: FieldDef, rows: RecordSummary[]): Column[] {
  const allowed = view.filters[field.key]?.map(norm) ?? []
  const options = (field.options ?? []).filter(
    (o) => allowed.length === 0 || allowed.includes(norm(o.value))
  )
  const cols: Column[] = options.map((o) => ({
    value: o.value,
    label: o.label,
    category: o.category,
    rows: []
  }))
  const other: Column = { value: '', label: `No ${field.label.toLowerCase()}`, rows: [] }
  for (const r of rows) {
    const v = valuesOf(r.fields[field.key])[0] ?? ''
    ;(cols.find((c) => norm(c.value) === norm(v)) ?? other).rows.push(r)
  }
  return other.rows.length ? [...cols, other] : cols
}

/**
 * "Move to…" on a card: every option of the group field in schema order (closed stages such as
 * Passed included), not just the columns the view shows, minus the card's own value.
 */
export function moveTargets(field: FieldDef, current: string): { value: string; label: string }[] {
  return (field.options ?? [])
    .filter((o) => norm(o.value) !== norm(current))
    .map((o) => ({ value: o.value, label: o.label }))
}

export type DropAction = { kind: 'none' } | { kind: 'set'; value: string } | { kind: 'pass' }

/** What dropping a card on `to` does. Only passing a company in the pipeline asks for a reason. */
export function dropAction(field: FieldDef, from: string, to: string): DropAction {
  if (from === to || !field.options?.some((o) => o.value === to)) return { kind: 'none' }
  const opt = field.options.find((o) => o.value === to)
  if (field.key === 'pipeline_status' && opt?.category === 'closed' && to === 'passed')
    return { kind: 'pass' }
  return { kind: 'set', value: to }
}

/** Toggle one value in a view's filter; an empty list removes the filter. Returns a new filters object. */
export function toggleFilter(
  filters: ViewDef['filters'],
  key: string,
  value: string
): ViewDef['filters'] {
  const cur = filters[key] ?? []
  const next = cur.some((v) => norm(v) === norm(value))
    ? cur.filter((v) => norm(v) !== norm(value))
    : [...cur, value]
  const out = { ...filters }
  if (next.length) out[key] = next
  else delete out[key]
  return out
}

export const filterCount = (filters: ViewDef['filters']): number => Object.keys(filters).length

/** Header click: a new field sorts ascending; the same field flips direction. */
export function nextSort(sort: ViewDef['sort'], field: string): NonNullable<ViewDef['sort']> {
  return sort?.field === field
    ? { field, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
    : { field, dir: 'asc' }
}

// ---- saved views ----

export function newViewId(views: ViewDef[], name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'view'
  let id = base
  for (let n = 2; views.some((v) => v.id === id); n++) id = `${base}-${n}`
  return id
}

/** A copy of `current` under a new name, appended to the list. */
export function addView(
  views: ViewDef[],
  current: ViewDef,
  name: string
): { views: ViewDef[]; id: string } {
  const id = newViewId(views, name)
  return { views: [...views, structuredClone({ ...current, id, name: name.trim() })], id }
}

export const updateView = (views: ViewDef[], id: string, patch: Partial<ViewDef>): ViewDef[] =>
  views.map((v) => {
    if (v.id !== id) return v
    const next = { ...v, ...patch }
    if (next.sort === undefined) delete next.sort
    return next
  })

export const canDeleteView = (views: ViewDef[]): boolean => views.length > 1

/** Removes a view; the last remaining view can't be removed. */
export const removeView = (views: ViewDef[], id: string): ViewDef[] =>
  canDeleteView(views) ? views.filter((v) => v.id !== id) : views
