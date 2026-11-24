// Pure logic for the record-list screens: which columns exist, the defaults, and remembered choices.
import type { FieldDef, RecordType, ViewDef } from '../../../shared/api'

export interface ListPrefs {
  columns: string[] // beyond name
  sort?: ViewDef['sort']
  filters: ViewDef['filters']
}

const DEFAULT_COLUMNS: Record<RecordType, string[]> = {
  company: ['pipeline_status', 'stage', 'source'],
  person: ['company', 'category', 'next_follow_up'],
  meeting: ['date', 'company', 'meeting_type'],
  theme: ['living_topic'],
  research: ['about', 'topic', 'created']
}

/** Fields a list can show: the type's schema fields, minus calculated (_) and bookkeeping ones. */
export const listableFields = (fields: FieldDef[]): FieldDef[] =>
  fields.filter((f) => !f.key.startsWith('_') && f.key !== 'id' && f.key !== 'type')

export function defaultPrefs(type: RecordType): ListPrefs {
  return {
    columns: DEFAULT_COLUMNS[type],
    sort: type === 'meeting' ? { field: 'date', dir: 'desc' } : undefined,
    filters: {}
  }
}

/** Columns to draw: name first, then the chosen fields that still exist, in schema order. */
export function visibleColumns(fields: FieldDef[], chosen: string[]): FieldDef[] {
  const all = listableFields(fields)
  const name = all.find((f) => f.key === 'name')
  const rest = all.filter((f) => f.key !== 'name' && chosen.includes(f.key))
  return name ? [name, ...rest] : rest
}

export const toggleColumn = (chosen: string[], key: string): string[] =>
  chosen.includes(key) ? chosen.filter((k) => k !== key) : [...chosen, key]

const storageKey = (type: RecordType): string => `kew.list.${type}`

export function loadPrefs(
  type: RecordType,
  store: Pick<Storage, 'getItem'> = localStorage
): ListPrefs {
  const base = defaultPrefs(type)
  try {
    const raw = JSON.parse(store.getItem(storageKey(type)) ?? 'null') as Partial<ListPrefs> | null
    if (!raw || typeof raw !== 'object') return base
    return {
      columns: Array.isArray(raw.columns) ? raw.columns.map(String) : base.columns,
      sort: raw.sort && typeof raw.sort.field === 'string' ? raw.sort : base.sort,
      filters: raw.filters && typeof raw.filters === 'object' ? raw.filters : {}
    }
  } catch {
    return base
  }
}

export function savePrefs(
  type: RecordType,
  prefs: ListPrefs,
  store: Pick<Storage, 'setItem'> = localStorage
): void {
  try {
    store.setItem(storageKey(type), JSON.stringify(prefs))
  } catch {
    // Remembering is a convenience; a blocked store just means defaults next time.
  }
}

export const EMPTY_HINT: Record<RecordType, { title: string; hint: string }> = {
  company: { title: 'No companies yet', hint: 'Add the first company you want to track.' },
  person: {
    title: 'No people yet',
    hint: 'Add founders, investors and anyone you keep in touch with.'
  },
  meeting: {
    title: 'No meetings yet',
    hint: 'Log a meeting to keep notes with the company and people.'
  },
  theme: {
    title: 'No themes yet',
    hint: 'Themes group companies and research by topic you follow.'
  },
  research: { title: 'No research yet', hint: 'Start a note about a company, person or theme.' }
}
