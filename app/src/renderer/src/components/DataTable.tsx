import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { FieldDef, RecordSummary, ViewDef } from '../../../shared/api'
import { friendlyDate, isoDate } from '../lib/dates'
import { valuesOf } from '../lib/pipeline'
import { lastTouchText } from '../lib/touch'
import { Chip } from './Chip'

const ROW_H = 40

function Cell({
  record,
  field,
  today
}: {
  record: RecordSummary
  field: FieldDef
  today: string
}): React.JSX.Element {
  const raw = record.fields[field.key]
  const vals = valuesOf(raw)
  if (field.key === '_last_touch') return <>{lastTouchText(raw, today)}</>
  if (vals.length === 0) return <span className="cell-empty" aria-label="empty" />
  const label = (v: string): string => field.options?.find((o) => o.value === v)?.label ?? v
  switch (field.type) {
    case 'select':
    case 'stage':
    case 'multi-select':
      return (
        <span className="row-chips">
          {vals.map((v) => (
            <Chip key={v}>{label(v)}</Chip>
          ))}
        </span>
      )
    case 'date':
      return <>{friendlyDate(vals[0], today)}</>
    case 'checkbox':
      return <>{vals[0] === 'true' ? 'Yes' : 'No'}</>
    default:
      return <>{vals.join(', ')}</>
  }
}

/**
 * Virtualized table: only the rows in view are in the DOM. The header sticks; clicking a header sorts.
 * The name column is first and gets the most room, so a name is never cut before other text.
 */
export function DataTable({
  rows,
  columns,
  sort,
  onSort,
  onOpen
}: {
  rows: RecordSummary[]
  columns: FieldDef[]
  sort?: ViewDef['sort']
  onSort(field: string): void
  onOpen(id: string): void
}): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null)
  const today = isoDate()
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_H,
    overscan: 12
  })
  const template = columns
    .map((_c, i) => (i === 0 ? 'minmax(240px, 2.2fr)' : 'minmax(110px, 1fr)'))
    .join(' ')
  return (
    <div className="table-scroll" ref={scroller}>
      <div role="table" aria-label="Records" aria-rowcount={rows.length + 1} className="dtable">
        <div
          role="row"
          className="dtable-row dtable-head"
          style={{ gridTemplateColumns: template }}
        >
          {columns.map((c) => {
            const dir = sort?.field === c.key ? sort.dir : null
            return (
              <div
                key={c.key}
                role="columnheader"
                aria-sort={dir ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button type="button" className="th-btn" onClick={() => onSort(c.key)}>
                  {c.label}
                  {dir && <span aria-hidden="true">{dir === 'asc' ? ' ↑' : ' ↓'}</span>}
                </button>
              </div>
            )
          })}
        </div>
        <div role="rowgroup" style={{ height: virt.getTotalSize(), position: 'relative' }}>
          {virt.getVirtualItems().map((v) => {
            const r = rows[v.index]
            return (
              <div
                key={r.id}
                ref={virt.measureElement}
                data-index={v.index}
                role="row"
                aria-rowindex={v.index + 2}
                className="dtable-row dtable-body"
                style={{
                  gridTemplateColumns: template,
                  transform: `translateY(${v.start}px)`
                }}
                onClick={() => onOpen(r.id)}
              >
                {columns.map((c, i) => (
                  <div key={c.key} role="cell" className={i === 0 ? 'cell-name' : 'cell'}>
                    {c.key === 'name' ? (
                      <button
                        type="button"
                        className="row-name"
                        onClick={(e) => (e.stopPropagation(), onOpen(r.id))}
                      >
                        {r.name}
                      </button>
                    ) : (
                      <Cell record={r} field={c} today={today} />
                    )}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
