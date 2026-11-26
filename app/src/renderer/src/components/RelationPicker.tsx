import { useEffect, useId, useRef, useState } from 'react'
import { kew } from '../api'
import { plainError } from '../lib/actions'
import { unwrap } from '../lib/pipeline'
import { wrapLink } from '../lib/new-record'
import type { RecordSummary, RecordType } from '../../../shared/api'
import { TYPE_LABEL, TYPE_PLURAL } from '../lib/destinations'

const ALL_TYPES: RecordType[] = ['company', 'person', 'meeting', 'theme', 'research']
const MAX_SHOWN = 8

/** Records of `target` (or any type) whose name or alias matches `text`. */
async function find(target: RecordType | 'any', text: string): Promise<RecordSummary[]> {
  const types = target === 'any' ? ALL_TYPES : [target]
  const lists = await Promise.all(types.map((t) => kew.list(t, text.trim() ? { text } : undefined)))
  return lists.flat().slice(0, MAX_SHOWN)
}

/**
 * Search-and-pick for relation fields. `value` holds `[[Name]]` strings. Single mode holds at most one.
 * Keyboard: type to search, ↑/↓ to move, Return to pick, Backspace on an empty box removes the last chip,
 * Escape closes the list (and only the list).
 */
export function RelationPicker({
  label,
  target,
  multiple = false,
  value,
  onChange,
  error,
  hint,
  labelHidden = false
}: {
  label: string
  target: RecordType | 'any'
  multiple?: boolean
  value: string[]
  onChange(next: string[]): void
  error?: string
  hint?: string
  /** Hide the label visually (it stays for screen readers), e.g. in a properties grid. */
  labelHidden?: boolean
}): React.JSX.Element {
  const id = useId()
  const listId = `${id}-list`
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [hits, setHits] = useState<RecordSummary[]>([])
  const [active, setActive] = useState(0)
  const [searchError, setSearchError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    let live = true
    const t = setTimeout(() => {
      find(target, text).then(
        (r) => {
          if (!live) return
          setHits(r)
          setActive(0)
          setSearchError(null)
        },
        (e) => live && (setHits([]), setSearchError(`Search failed: ${plainError(e)}`))
      )
    }, 120)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [open, text, target])

  const chosen = new Set(value.map((v) => unwrap(v).toLowerCase()))
  const options = hits.filter((h) => !chosen.has(h.name.toLowerCase()))

  const pick = (r: RecordSummary): void => {
    onChange(multiple ? [...value, wrapLink(r.name)] : [wrapLink(r.name)])
    setText('')
    setOpen(false)
    input.current?.focus()
  }
  const remove = (v: string): void => {
    onChange(value.filter((x) => x !== v))
    setTimeout(() => input.current?.focus(), 0)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return setOpen(true)
      if (options.length)
        setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
    } else if (e.key === 'Enter' && open && options[active]) {
      e.preventDefault()
      pick(options[active])
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation()
      setOpen(false)
    } else if (e.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="relpick">
      <label className={labelHidden ? 'visually-hidden' : 'form-label'} htmlFor={id}>
        {label}
      </label>
      <div className={`relpick-box${error ? ' field-invalid' : ''}`}>
        {value.map((v) => (
          <span key={v} className="relpick-chip">
            {unwrap(v)}
            <button
              type="button"
              className="relpick-x"
              aria-label={`Remove ${unwrap(v)}`}
              onClick={() => remove(v)}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          ref={input}
          className="relpick-input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && options[active] ? `${id}-${active}` : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          value={text}
          placeholder={
            value.length
              ? ''
              : target === 'any'
                ? 'Search any record'
                : `Search ${TYPE_PLURAL[target]}`
          }
          onChange={(e) => (setText(e.target.value), setOpen(true))}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-label={`${label} results`} className="relpick-list">
          {options.map((r, i) => (
            <li
              key={r.id}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              className="relpick-opt"
              onMouseDown={(e) => (e.preventDefault(), pick(r))}
              onMouseEnter={() => setActive(i)}
            >
              <span>{r.name}</span>
              {target === 'any' && <span className="relpick-type">{TYPE_LABEL[r.type]}</span>}
            </li>
          ))}
          {options.length === 0 && !searchError && (
            <li className="relpick-none" role="presentation">
              {text.trim() ? `No match for “${text.trim()}”.` : 'Nothing here yet.'}
            </li>
          )}
        </ul>
      )}
      {searchError && (
        <p className="form-error" role="alert">
          {searchError}
        </p>
      )}
      {hint && !error && <p className="form-hint">{hint}</p>}
      {error && (
        <p className="form-error" id={`${id}-err`} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
