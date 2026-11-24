// One property row: label + an inline editor for the field's type. Saves on commit (blur, Return,
// or a selection); clearing a value sends null. Errors from the vault show under the control.
import { useEffect, useId, useRef, useState } from 'react'
import type { FieldDef, FieldValue } from '../../../shared/api'
import { plainError } from '../lib/actions'
import { displayValue, httpsHref, listValue } from '../lib/properties'
import { RelationPicker } from './RelationPicker'

export type Commit = (key: string, value: FieldValue) => Promise<void>

const isFullDate = (s: string): boolean => /^[1-9]\d{3}-\d{2}-\d{2}$/.test(s)

export function FieldInput({
  field,
  value,
  problems = [],
  onCommit
}: {
  field: FieldDef
  value: FieldValue | undefined
  problems?: string[]
  onCommit: Commit
}): React.JSX.Element {
  const id = useId()
  const [error, setError] = useState<string | null>(null)
  const commit = (v: FieldValue): void => {
    setError(null)
    onCommit(field.key, v).catch((e) => setError(plainError(e)))
  }
  const messages = [...(error ? [error] : []), ...problems]
  const errId = messages.length ? `${id}-err` : undefined
  const isRelation = field.type === 'relation'

  return (
    <div className="prop">
      {isRelation ? (
        <span className="prop-label" aria-hidden="true">
          {field.label}
        </span>
      ) : (
        <label className="prop-label" htmlFor={id}>
          {field.label}
        </label>
      )}
      <div className="prop-value">
        <Control
          id={id}
          field={field}
          value={value}
          invalid={messages.length > 0}
          describedBy={errId}
          commit={commit}
        />
        {messages.length > 0 && (
          <p className="form-error" id={errId} role="alert">
            {messages.join(' ')}
          </p>
        )}
      </div>
    </div>
  )
}

interface ControlProps {
  id: string
  field: FieldDef
  value: FieldValue | undefined
  invalid: boolean
  describedBy?: string
  commit(v: FieldValue): void
}

function Control(p: ControlProps): React.JSX.Element {
  const { id, field, value, invalid, describedBy, commit } = p
  const aria = {
    'aria-invalid': invalid || undefined,
    'aria-describedby': describedBy
  }
  switch (field.type) {
    case 'select':
    case 'stage': {
      const v = displayValue(value)
      const options = field.options ?? []
      return (
        <select
          id={id}
          className="field field-select prop-field"
          value={v}
          onChange={(e) => commit(e.target.value || null)}
          {...aria}
        >
          <option value="">—</option>
          {v && !options.some((o) => o.value === v) && <option value={v}>{v}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    }
    case 'checkbox':
      return (
        <input
          id={id}
          type="checkbox"
          className="prop-check"
          checked={value === true}
          onChange={(e) => commit(e.target.checked)}
          {...aria}
        />
      )
    case 'relation':
      return (
        <RelationPicker
          label={field.label}
          labelHidden
          target={field.target ?? 'any'}
          multiple={field.multiple}
          value={listValue(value)}
          onChange={(next) =>
            commit(field.multiple ? (next.length ? next : null) : (next[0] ?? null))
          }
        />
      )
    case 'multi-select':
      return <MultiSelect {...p} />
    case 'date':
      return <DateInput {...p} />
    default:
      return <TextInput {...p} />
  }
}

/** text, number and url: a draft that saves on blur or Return; Escape puts the saved value back. */
function TextInput({
  id,
  field,
  value,
  invalid,
  describedBy,
  commit
}: ControlProps): React.JSX.Element {
  const saved = displayValue(value)
  const [draft, setDraft] = useState(saved)
  const editing = useRef(false)
  useEffect(() => {
    if (!editing.current) setDraft(saved)
  }, [saved])
  const save = (): void => {
    const next = draft.trim()
    if (next !== saved) commit(next === '' ? null : next)
  }
  const href = field.type === 'url' ? httpsHref(saved) : null
  return (
    <div className="prop-inline">
      <input
        id={id}
        className="field prop-field"
        inputMode={field.type === 'number' ? 'decimal' : undefined}
        value={draft}
        spellCheck={field.type === 'text'}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        placeholder="Empty"
        onFocus={() => (editing.current = true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          editing.current = false
          save()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            save()
          } else if (e.key === 'Escape') {
            setDraft(saved)
          }
        }}
      />
      {href && (
        <a
          className="icon-btn prop-open"
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${saved} in your browser`}
          title="Open in your browser"
        >
          ↗
        </a>
      )}
    </div>
  )
}

/** Native date input. Saves once a full date is picked or typed, on blur, and when cleared. */
function DateInput({ id, value, invalid, describedBy, commit }: ControlProps): React.JSX.Element {
  const saved = displayValue(value)
  const [draft, setDraft] = useState(saved)
  const [shown, setShown] = useState(saved)
  if (shown !== saved) {
    // The vault's value changed (our save landed, or an outside edit): show it.
    setShown(saved)
    setDraft(saved)
  }
  const last = useRef<string | null>(null) // the last value sent, so a blur doesn't send it twice
  const save = (v: string): void => {
    if (v === saved || v === last.current) return
    if (v !== '' && !isFullDate(v)) return
    last.current = v
    commit(v === '' ? null : v)
  }
  return (
    <input
      id={id}
      type="date"
      className="field prop-field"
      value={draft}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={(e) => {
        setDraft(e.target.value)
        save(e.target.value)
      }}
      onBlur={() => save(draft)}
    />
  )
}

/** Chips with a remove button, plus a way to add: a menu of options, or free text when there are none. */
function MultiSelect({
  id,
  field,
  value,
  invalid,
  describedBy,
  commit
}: ControlProps): React.JSX.Element {
  const list = listValue(value)
  const options = field.options ?? []
  const [text, setText] = useState('')
  const label = (v: string): string => options.find((o) => o.value === v)?.label ?? v
  const set = (next: string[]): void => commit(next.length ? next : null)
  const remaining = options.filter((o) => !list.includes(o.value))
  const add = (): void => {
    const t = text.trim()
    if (t && !list.includes(t)) set([...list, t])
    setText('')
  }
  return (
    <div className="prop-multi">
      {list.map((v) => (
        <span key={v} className="relpick-chip">
          {label(v)}
          <button
            type="button"
            className="relpick-x"
            aria-label={`Remove ${label(v)}`}
            onClick={() => set(list.filter((x) => x !== v))}
          >
            ×
          </button>
        </span>
      ))}
      {options.length ? (
        remaining.length > 0 && (
          <select
            id={id}
            className="field field-select prop-add"
            value=""
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(e) => e.target.value && set([...list, e.target.value])}
          >
            <option value="">Add…</option>
            {remaining.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )
      ) : (
        <input
          id={id}
          className="field prop-add"
          value={text}
          placeholder="Add…"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(e) => setText(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            add()
          }}
        />
      )}
    </div>
  )
}
