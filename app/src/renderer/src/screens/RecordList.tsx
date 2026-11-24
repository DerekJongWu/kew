import { useEffect, useMemo, useState } from 'react'
import { kew, useQuery } from '../api'
import { router } from '../router'
import { plainError } from '../lib/actions'
import { TYPE_LABEL } from '../lib/destinations'
import { nextSort, toggleFilter, filterCount } from '../lib/pipeline'
import {
  EMPTY_HINT,
  listableFields,
  loadPrefs,
  savePrefs,
  toggleColumn,
  visibleColumns,
  type ListPrefs
} from '../lib/record-list'
import type { FieldDef, RecordType } from '../../../shared/api'
import { Button } from '../components/Button'
import { DataTable } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { FilterBar, type FilterOption } from '../components/FilterBar'
import { NewRecordDialog } from '../components/NewRecordDialog'
import { Popover } from '../components/Popover'

const PLURAL: Record<RecordType, string> = {
  company: 'Companies',
  person: 'People',
  meeting: 'Meetings',
  theme: 'Themes',
  research: 'Research'
}

/** One screen for companies, people, meetings, themes and research. */
export function RecordList({ type }: { type: RecordType }): React.JSX.Element {
  const [prefs, setPrefs] = useState<ListPrefs>(() => loadPrefs(type))
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const noun = TYPE_LABEL[type].toLowerCase()

  const update = (patch: Partial<ListPrefs>): void => setPrefs((p) => ({ ...p, ...patch }))
  useEffect(() => savePrefs(type, prefs), [type, prefs])

  useEffect(() => {
    const t = setTimeout(() => setQuery(text), 150)
    return () => clearTimeout(t)
  }, [text])

  // ⌘N starts a new record while this list is showing (and no dialog is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.metaKey || e.altKey || e.ctrlKey || e.shiftKey || e.key.toLowerCase() !== 'n') return
      if (creating || document.querySelector('[role="dialog"][aria-modal="true"]')) return
      e.preventDefault()
      setCreating(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [creating])

  const { data: schema, error: schemaError } = useQuery(() => kew.schema(), [])
  const typeDef = schema?.types[type]
  const filtersKey = JSON.stringify(prefs.filters)
  const sortKey = JSON.stringify(prefs.sort ?? null)
  const { data: rows, error: rowsError } = useQuery(
    () =>
      kew.list(type, {
        filters: prefs.filters,
        sort: prefs.sort,
        text: query.trim() || undefined
      }),
    [type, filtersKey, sortKey, query]
  )
  const relations = useMemo(
    () =>
      (typeDef?.fields ?? []).filter(
        (f) => f.type === 'relation' && f.target && f.target !== 'any'
      ),
    [typeDef]
  )
  const { data: relationNames } = useQuery(
    async () =>
      Object.fromEntries(
        await Promise.all(
          relations.map(
            async (f) =>
              [f.key, (await kew.list(f.target as RecordType)).map((r) => r.name)] as const
          )
        )
      ) as Record<string, string[]>,
    [relations.map((f) => f.key).join(',')]
  )
  const optionsFor = (f: FieldDef): FilterOption[] =>
    f.type === 'relation'
      ? (relationNames?.[f.key] ?? []).map((n) => ({ value: n, label: n }))
      : (f.options ?? []).map((o) => ({ value: o.value, label: o.label }))

  const columns = useMemo(
    () => visibleColumns(typeDef?.fields ?? [], prefs.columns),
    [typeDef, prefs.columns]
  )
  const pickable = listableFields(typeDef?.fields ?? []).filter((f) => f.key !== 'name')
  const filtering = filterCount(prefs.filters) > 0 || query.trim() !== ''
  const loadError = schemaError ?? rowsError
  const hint = EMPTY_HINT[type]

  return (
    <div className="screen screen-wide">
      <header className="screen-head">
        <div>
          <p className="screen-kicker">
            {rows ? `${rows.length} ${rows.length === 1 ? noun : PLURAL[type].toLowerCase()}` : ' '}
          </p>
          <h1 className="screen-title">{PLURAL[type]}</h1>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)} title="New  ⌘N">
          New {noun}
        </Button>
      </header>
      {loadError && (
        <p className="row-error" role="alert">
          Couldn’t load {PLURAL[type].toLowerCase()}: {plainError(loadError)}
        </p>
      )}
      {typeDef && (
        <div className="pipeline-tools">
          <div className="list-tools-left">
            <input
              type="search"
              className="field list-search"
              aria-label={`Filter ${PLURAL[type].toLowerCase()} by name`}
              placeholder="Filter by name"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Popover label="Columns" panelLabel="Choose columns" buttonClass="btn btn-ghost">
              {() => (
                <fieldset className="filter-list">
                  <legend className="visually-hidden">Columns</legend>
                  <p className="menu-label">Name is always shown.</p>
                  {pickable.map((f) => (
                    <label key={f.key} className="filter-item">
                      <input
                        type="checkbox"
                        checked={prefs.columns.includes(f.key)}
                        onChange={() => update({ columns: toggleColumn(prefs.columns, f.key) })}
                      />
                      <span>{f.label}</span>
                    </label>
                  ))}
                </fieldset>
              )}
            </Popover>
            <FilterBar
              fields={typeDef.fields}
              filters={prefs.filters}
              optionsFor={optionsFor}
              onToggle={(key, value) =>
                update({ filters: toggleFilter(prefs.filters, key, value) })
              }
              onClear={() => update({ filters: {} })}
            />
          </div>
        </div>
      )}
      {rows &&
        (rows.length ? (
          <DataTable
            rows={rows}
            columns={columns}
            sort={prefs.sort}
            onSort={(f) => update({ sort: nextSort(prefs.sort, f) })}
            onOpen={(id) => router.navigate({ name: 'record', id })}
          />
        ) : filtering ? (
          <EmptyState title={`No ${PLURAL[type].toLowerCase()} match`}>
            Clear the filters or the name box to see more.
          </EmptyState>
        ) : (
          <EmptyState title={hint.title}>
            {hint.hint}
            <br />
            <Button variant="primary" className="empty-action" onClick={() => setCreating(true)}>
              New {noun}
            </Button>
          </EmptyState>
        ))}
      {creating && <NewRecordDialog type={type} onClose={() => setCreating(false)} />}
    </div>
  )
}
