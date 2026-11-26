import { useId, useState } from 'react'
import type { ViewDef } from '../../../shared/api'
import { canDeleteView } from '../lib/pipeline'
import { Button } from './Button'
import { Popover } from './Popover'

/** Name prompt shared by "+ View" and Rename. */
function NameForm({
  initial,
  submit,
  onSubmit,
  onCancel
}: {
  initial: string
  submit: string
  onSubmit(name: string): void
  onCancel(): void
}): React.JSX.Element {
  const [name, setName] = useState(initial)
  const id = useId()
  return (
    <form
      className="view-name-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) onSubmit(name.trim())
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
    >
      <label className="visually-hidden" htmlFor={id}>
        View name
      </label>
      <input
        id={id}
        className="field"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="View name"
      />
      <Button type="submit" variant="primary" disabled={!name.trim()}>
        {submit}
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  )
}

export function ViewTabs({
  views,
  activeId,
  onSelect,
  onAdd,
  onRename,
  onDelete
}: {
  views: ViewDef[]
  activeId: string
  onSelect(id: string): void
  onAdd(name: string): void
  onRename(id: string, name: string): void
  onDelete(id: string): void
}): React.JSX.Element {
  const [mode, setMode] = useState<null | 'add' | 'rename'>(null)
  const active = views.find((v) => v.id === activeId)
  return (
    <div className="view-tabs">
      <nav aria-label="Saved views" className="tabs">
        {views.map((v) =>
          mode === 'rename' && v.id === activeId ? (
            <NameForm
              key={v.id}
              initial={v.name}
              submit="Rename"
              onSubmit={(name) => (setMode(null), onRename(v.id, name))}
              onCancel={() => setMode(null)}
            />
          ) : (
            <span key={v.id} className={`tab-wrap${v.id === activeId ? ' is-active' : ''}`}>
              <button
                type="button"
                className="tab"
                aria-current={v.id === activeId ? 'page' : undefined}
                onClick={() => onSelect(v.id)}
              >
                {v.name}
              </button>
              {v.id === activeId && (
                <Popover
                  label="⋯"
                  buttonClass="tab-menu"
                  panelLabel={`${v.name} view options`}
                  placement="below"
                >
                  {(close) => (
                    <div className="menu">
                      <button
                        type="button"
                        className="menu-item"
                        onClick={() => (close(), setMode('rename'))}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="menu-item"
                        disabled={!canDeleteView(views)}
                        title={canDeleteView(views) ? undefined : 'Keep at least one view'}
                        onClick={() => (close(), onDelete(v.id))}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </Popover>
              )}
            </span>
          )
        )}
        {mode === 'add' ? (
          <NameForm
            initial={active ? `${active.name} copy` : ''}
            submit="Create"
            onSubmit={(name) => (setMode(null), onAdd(name))}
            onCancel={() => setMode(null)}
          />
        ) : (
          <button type="button" className="tab tab-add" onClick={() => setMode('add')}>
            + View
          </button>
        )}
      </nav>
    </div>
  )
}
