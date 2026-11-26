import { useDraggable } from '@dnd-kit/core'
import type { FieldDef, RecordSummary } from '../../../shared/api'
import { isoDate } from '../lib/dates'
import { lastTouchText } from '../lib/touch'
import { Chip } from './Chip'
import { Popover } from './Popover'

export interface MoveTarget {
  value: string
  label: string
}

const label = (schema: FieldDef | undefined, v: unknown): string =>
  schema?.options?.find((o) => o.value === v)?.label ?? String(v ?? '')

export function CardBody({
  record,
  fields
}: {
  record: RecordSummary
  fields: Record<string, FieldDef | undefined>
}): React.JSX.Element {
  const today = isoDate()
  const f = record.fields
  const touch = lastTouchText(f._last_touch, today)
  const summary = typeof f._summary === 'string' ? f._summary : ''
  return (
    <>
      <p className="card-name">{record.name}</p>
      {summary && <p className="card-line">{summary}</p>}
      <div className="row-chips">
        {f.source ? <Chip>{label(fields.source, f.source)}</Chip> : null}
        {f.raise ? <Chip tone="accent">{String(f.raise)}</Chip> : null}
      </div>
      {touch && <p className="card-touch">{touch}</p>}
    </>
  )
}

/** A draggable card. The name opens the record; "Move to…" is the keyboard way to change column. */
export function BoardCard({
  record,
  fields,
  pending,
  targets,
  onOpen,
  onMove
}: {
  record: RecordSummary
  fields: Record<string, FieldDef | undefined>
  pending: boolean
  /** Every value the card can move to (its own excluded). */
  targets: MoveTarget[]
  onOpen(id: string): void
  onMove(id: string, to: string): void
}): React.JSX.Element {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: record.id, disabled: pending })
  return (
    <article
      ref={setNodeRef}
      className={`card${isDragging ? ' is-dragging' : ''}`}
      aria-busy={pending}
      {...listeners}
    >
      <button type="button" className="card-open" onClick={() => onOpen(record.id)}>
        <CardBody record={record} fields={fields} />
      </button>
      <div className="card-foot">
        {pending ? (
          <span className="card-touch" role="status">
            Moving…
          </span>
        ) : (
          <Popover
            label="Move to…"
            buttonClass="btn btn-ghost btn-sm"
            panelLabel={`Move ${record.name}`}
            placement="below"
          >
            {(close) => (
              <div className="menu">
                {targets.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    className="menu-item"
                    onClick={() => (close(), onMove(record.id, t.value))}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </Popover>
        )}
      </div>
    </article>
  )
}
