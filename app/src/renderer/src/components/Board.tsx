import { useEffect, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import type { FieldDef, RecordSummary } from '../../../shared/api'
import type { Column } from '../lib/pipeline'
import { moveTargets } from '../lib/pipeline'
import { BoardCard, CardBody } from './BoardCard'

/** Which edges of a horizontal scroller have more columns beyond them. */
function useOverflowEdges(
  ref: React.RefObject<HTMLElement | null>,
  dep: unknown
): { left: boolean; right: boolean } {
  const [edges, setEdges] = useState({ left: false, right: false })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (): void => {
      const left = el.scrollLeft > 1
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
      setEdges((e) => (e.left === left && e.right === right ? e : { left, right }))
    }
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', measure)
      ro.disconnect()
    }
  }, [ref, dep])
  return edges
}

function BoardColumn({
  column,
  children
}: {
  column: Column
  children: React.ReactNode
}): React.JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: column.value, disabled: column.value === '' })
  return (
    <section
      ref={setNodeRef}
      className={`col${isOver ? ' is-over' : ''}`}
      aria-label={`${column.label}, ${column.rows.length}`}
    >
      <header className="col-head">
        <h2 className="col-title">{column.label}</h2>
        <span className="section-count">{column.rows.length}</span>
      </header>
      <div className="col-cards">
        {children}
        {column.rows.length === 0 && <p className="col-empty">Nothing here</p>}
      </div>
    </section>
  )
}

/**
 * Columns of cards. Dropping a card on another column (or choosing "Move to…", which offers every
 * value of the group field) calls onMove. An edge fades while more columns lie beyond it.
 */
export function Board({
  columns,
  groupField,
  fields,
  pending,
  onOpen,
  onMove
}: {
  columns: Column[]
  groupField: FieldDef
  fields: Record<string, FieldDef | undefined>
  pending: Set<string>
  onOpen(id: string): void
  onMove(record: RecordSummary, from: string, to: string): void
}): React.JSX.Element {
  const [dragging, setDragging] = useState<RecordSummary | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const scroller = useRef<HTMLDivElement>(null)
  const edges = useOverflowEdges(scroller, columns.length)
  const find = (id: string): { rec: RecordSummary; from: string } | null => {
    for (const c of columns) {
      const rec = c.rows.find((r) => r.id === id)
      if (rec) return { rec, from: c.value }
    }
    return null
  }
  const onEnd = (e: DragEndEvent): void => {
    setDragging(null)
    const hit = find(String(e.active.id))
    if (hit && e.over) onMove(hit.rec, hit.from, String(e.over.id))
  }
  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setDragging(find(String(e.active.id))?.rec ?? null)}
      onDragEnd={onEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div
        className={`board-wrap${edges.left ? ' fade-left' : ''}${edges.right ? ' fade-right' : ''}`}
      >
        <div className="board" ref={scroller}>
          {columns.map((c) => (
            <BoardColumn key={c.value || 'none'} column={c}>
              {c.rows.map((r) => (
                <BoardCard
                  key={r.id}
                  record={r}
                  fields={fields}
                  pending={pending.has(r.id)}
                  targets={moveTargets(groupField, c.value)}
                  onOpen={onOpen}
                  onMove={(_id, to) => onMove(r, c.value, to)}
                />
              ))}
            </BoardColumn>
          ))}
        </div>
      </div>
      <DragOverlay>
        {dragging && (
          <article className="card card-overlay">
            <div className="card-open">
              <CardBody record={dragging} fields={fields} />
            </div>
          </article>
        )}
      </DragOverlay>
    </DndContext>
  )
}
