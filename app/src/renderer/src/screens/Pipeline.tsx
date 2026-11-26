import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { kew, useQuery } from '../api'
import { router, useRoute } from '../router'
import { plainError, status } from '../lib/actions'
import {
  addView,
  boardColumns,
  dropAction,
  nextSort,
  removeView,
  toggleFilter,
  updateView
} from '../lib/pipeline'
import type { FieldDef, RecordSummary, ViewDef } from '../../../shared/api'
import { Board } from '../components/Board'
import { DataTable } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { FilterBar, type FilterOption } from '../components/FilterBar'
import { createViewsStore } from '../lib/views-store'
import { PassDialog } from '../components/PassDialog'
import { ViewTabs } from '../components/ViewTabs'

const openRecord = (id: string): void => router.navigate({ name: 'record', id })

export function Pipeline(): React.JSX.Element {
  const [route] = useRoute()
  const { data: saved, error: viewsError, reload } = useQuery(() => kew.views(), [])
  // The views on screen: edits show at once and saves run in order (see lib/views-store.ts).
  const [store] = useState(() => createViewsStore((v) => status.run(() => kew.saveViews(v))))
  useEffect(() => store.sync(saved), [store, saved])
  const views = useSyncExternalStore(store.subscribe, store.get)
  const { data: schema } = useQuery(() => kew.schema(), [])
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [passing, setPassing] = useState<RecordSummary | null>(null)

  const wanted = route.name === 'pipeline' ? route.viewId : undefined
  const view = views?.find((v) => v.id === wanted) ?? views?.[0]
  const typeDef = view && schema?.types[view.type]
  const filtersKey = JSON.stringify(view?.filters ?? {})
  const sortKey = JSON.stringify(view?.sort ?? null)
  const { data: rows, error: rowsError } = useQuery(
    () =>
      view ? kew.list(view.type, { filters: view.filters, sort: view.sort }) : Promise.resolve([]),
    [view?.id, view?.type, filtersKey, sortKey]
  )
  // Relation filters offer the names of the records they point at.
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
            async (f) => [f.key, (await kew.list(f.target as 'person')).map((r) => r.name)] as const
          )
        )
      ) as Record<string, string[]>,
    [relations.map((f) => f.key).join(',')]
  )

  const persist = (fn: (views: ViewDef[]) => ViewDef[], selectId?: string): void => {
    setError(null)
    store.edit(fn).then(
      () => {
        reload()
        if (selectId) router.navigate({ name: 'pipeline', viewId: selectId })
      },
      (e) => (setError(plainError(e)), reload())
    )
  }
  const patch = (fn: (v: ViewDef) => Partial<ViewDef>): void => {
    if (!view) return
    persist((vs) => {
      const cur = vs.find((x) => x.id === view.id)
      return cur ? updateView(vs, cur.id, fn(cur)) : vs
    })
  }

  const run = (id: string, fn: () => Promise<unknown>): void => {
    setError(null)
    setPending((s) => new Set(s).add(id))
    status
      .run(fn)
      .catch((e) => setError(plainError(e)))
      .finally(() =>
        setPending((s) => {
          const n = new Set(s)
          n.delete(id)
          return n
        })
      )
  }

  const groupField = typeDef?.fields.find((f) => f.key === (view?.groupBy ?? 'pipeline_status'))
  const move = (rec: RecordSummary, from: string, to: string): void => {
    if (!groupField) return
    const action = dropAction(groupField, from, to)
    if (action.kind === 'set')
      run(rec.id, () => kew.setFields(rec.id, { [groupField.key]: action.value }))
    else if (action.kind === 'pass') setPassing(rec)
  }

  const fieldMap: Record<string, FieldDef | undefined> = Object.fromEntries(
    (typeDef?.fields ?? []).map((f) => [f.key, f])
  )
  const optionsFor = (f: FieldDef): FilterOption[] =>
    f.type === 'relation'
      ? (relationNames?.[f.key] ?? []).map((n) => ({ value: n, label: n }))
      : (f.options ?? []).map((o) => ({ value: o.value, label: o.label }))

  const tableColumns = useMemo(() => {
    const keys = view?.columns.includes('name') ? view.columns : ['name', ...(view?.columns ?? [])]
    return keys.map((k) => fieldMap[k]).filter((f): f is FieldDef => f !== undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.columns, typeDef])

  const loadError = viewsError ?? rowsError
  return (
    <div className="screen screen-wide">
      <header className="screen-head">
        <div>
          <p className="screen-kicker">
            {rows ? `${rows.length} ${rows.length === 1 ? 'company' : 'companies'}` : ' '}
          </p>
          <h1 className="screen-title">Pipeline</h1>
        </div>
      </header>
      {loadError && (
        <p className="row-error" role="alert">
          Couldn’t load the pipeline: {plainError(loadError)}
        </p>
      )}
      {error && (
        <p className="row-error" role="alert">
          {error}
        </p>
      )}
      {views && view && typeDef && (
        <>
          <ViewTabs
            views={views}
            activeId={view.id}
            onSelect={(id) => router.navigate({ name: 'pipeline', viewId: id })}
            onAdd={(name) => {
              const id = addView(store.get() ?? views, view, name).id
              persist((vs) => addView(vs, vs.find((x) => x.id === view.id) ?? view, name).views, id)
            }}
            onRename={(id, name) => persist((vs) => updateView(vs, id, { name }))}
            onDelete={(id) => {
              const next = removeView(store.get() ?? views, id)
              persist((vs) => removeView(vs, id), id === view.id ? next[0]?.id : undefined)
            }}
          />
          <div className="pipeline-tools">
            <FilterBar
              fields={typeDef.fields}
              filters={view.filters}
              optionsFor={optionsFor}
              onToggle={(key, value) =>
                patch((v) => ({ filters: toggleFilter(v.filters, key, value) }))
              }
              onClear={() => patch(() => ({ filters: {} }))}
            />
            <div className="seg" role="group" aria-label="Layout">
              {(['board', 'table'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  className="seg-btn"
                  aria-pressed={view.layout === l}
                  onClick={() => view.layout !== l && patch(() => ({ layout: l }))}
                >
                  {l === 'board' ? 'Board' : 'Table'}
                </button>
              ))}
            </div>
          </div>
          {rows &&
            (view.layout === 'board' ? (
              groupField?.options ? (
                <Board
                  columns={boardColumns(view, groupField, rows)}
                  groupField={groupField}
                  fields={fieldMap}
                  pending={pending}
                  onOpen={openRecord}
                  onMove={move}
                />
              ) : (
                <EmptyState title="This view can’t be shown as a board">
                  Group it by a select or stage field, or switch to the table.
                </EmptyState>
              )
            ) : rows.length ? (
              <DataTable
                rows={rows}
                columns={tableColumns}
                sort={view.sort}
                onSort={(f) => patch((v) => ({ sort: nextSort(v.sort, f) }))}
                onOpen={openRecord}
              />
            ) : (
              <EmptyState title="No companies match this view">
                Clear a filter to see more.
              </EmptyState>
            ))}
        </>
      )}
      {passing && (
        <PassDialog
          name={passing.name}
          onSubmit={(reason) => {
            const rec = passing
            setPassing(null)
            run(rec.id, () => kew.passCompany(rec.id, reason))
          }}
          onCancel={() => setPassing(null)}
        />
      )}
    </div>
  )
}
