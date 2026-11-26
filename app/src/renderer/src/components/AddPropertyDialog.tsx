// "+ Add a property": a new custom field on a record type (label → key, type, options or target).
import { useEffect, useId, useRef, useState } from 'react'
import { kew } from '../api'
import { plainError, status } from '../lib/actions'
import { DESTINATIONS, TYPE_LABEL } from '../lib/destinations'
import { keyFromLabel, labelFromKey, optionValue, propertyKeyProblem } from '../lib/properties'
import type { FieldDef, FieldType, OptionDef, RecordType } from '../../../shared/api'
import { Button } from './Button'

const TYPES: [FieldType, string][] = [
  ['text', 'Text'],
  ['number', 'Number'],
  ['date', 'Date'],
  ['select', 'Select'],
  ['multi-select', 'Multi-select'],
  ['relation', 'Link to records'],
  ['url', 'Web address'],
  ['checkbox', 'Checkbox']
]
const TARGETS: (RecordType | 'any')[] = ['company', 'person', 'meeting', 'theme', 'research', 'any']
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled])'

export function AddPropertyDialog({
  type,
  existing,
  prefill,
  onClose
}: {
  type: RecordType
  existing: string[] // keys already on the type
  /** From "Add to schema" on an unknown key: the key is fixed, the type is a guess. */
  prefill?: { key: string; type: FieldType }
  onClose(): void
}): React.JSX.Element {
  const uid = useId()
  const box = useRef<HTMLDivElement>(null)
  const [restore] = useState(() => document.activeElement)
  const [label, setLabel] = useState(prefill ? labelFromKey(prefill.key) : '')
  const [fieldType, setFieldType] = useState<FieldType>(prefill?.type ?? 'text')
  const [options, setOptions] = useState<OptionDef[]>([])
  const [optionText, setOptionText] = useState('')
  const [target, setTarget] = useState<RecordType | 'any'>('company')
  const [multiple, setMultiple] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const key = prefill?.key ?? keyFromLabel(label)
  // A prefilled key comes from a note as written, so it gets the same check as a typed label.
  const keyProblem = propertyKeyProblem(key, existing)
  const hasOptions = fieldType === 'select' || fieldType === 'multi-select'

  useEffect(() => {
    box.current?.querySelector<HTMLElement>('input')?.focus()
  }, [])

  const close = (): void => {
    onClose()
    if (restore instanceof HTMLElement) restore.focus()
  }

  const addOption = (): void => {
    const l = optionText.trim()
    const value = optionValue(l)
    if (!value || options.some((o) => o.value === value)) return
    setOptions([...options, { value, label: l }])
    setOptionText('')
  }

  const submit = async (): Promise<void> => {
    if (!label.trim()) return setError('Give the property a label.')
    if (keyProblem)
      return setError(
        prefill
          ? `${prefill.key} can't be a field key as written. ${keyProblem} Rename it in the note first.`
          : keyProblem
      )
    const field: FieldDef = { key, label: label.trim(), type: fieldType, tier: 'custom' }
    if (hasOptions && options.length) field.options = options
    if (fieldType === 'relation') {
      field.target = target
      field.multiple = multiple
    }
    setBusy(true)
    setError(null)
    try {
      await status.run(() => kew.changeSchema({ kind: 'add-field', type, field }))
      close()
    } catch (e) {
      setError(plainError(e))
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Tab') {
      const items = [...(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
  }

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        className="dialog dialog-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        ref={box}
        onKeyDown={onKeyDown}
      >
        <p className="dialog-title" id={`${uid}-title`}>
          Add a property to {TYPE_LABEL[type].toLowerCase()} notes
        </p>
        <form
          className="form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (!busy) void submit()
          }}
        >
          <div className="form-row">
            <label className="form-label" htmlFor={`${uid}-label`}>
              Label
            </label>
            <input
              id={`${uid}-label`}
              className="field"
              value={label}
              autoComplete="off"
              onChange={(e) => (setLabel(e.target.value), setError(null))}
            />
            <p className="form-hint">
              {key ? (
                <>
                  Saved in notes as <code className="prop-key">{key}</code>
                  {prefill && ' (the key already in this note)'}
                </>
              ) : (
                'Kew makes the key from the label.'
              )}
            </p>
          </div>
          <div className="form-row">
            <label className="form-label" htmlFor={`${uid}-type`}>
              Type
            </label>
            <select
              id={`${uid}-type`}
              className="field field-select"
              value={fieldType}
              onChange={(e) => setFieldType(e.target.value as FieldType)}
            >
              {TYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          {hasOptions && (
            <div className="form-row">
              <label className="form-label" htmlFor={`${uid}-opt`}>
                Options
              </label>
              {options.length > 0 && (
                <div className="prop-multi">
                  {options.map((o) => (
                    <span key={o.value} className="relpick-chip">
                      {o.label}
                      <button
                        type="button"
                        className="relpick-x"
                        aria-label={`Remove option ${o.label}`}
                        onClick={() => setOptions(options.filter((x) => x !== o))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="prop-inline">
                <input
                  id={`${uid}-opt`}
                  className="field field-grow"
                  value={optionText}
                  placeholder="Type an option and press Return"
                  autoComplete="off"
                  onChange={(e) => setOptionText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addOption()
                    }
                  }}
                />
                <Button onClick={addOption} disabled={!optionValue(optionText)}>
                  Add option
                </Button>
              </div>
              <p className="form-hint">Leave empty to allow any value.</p>
            </div>
          )}
          {fieldType === 'relation' && (
            <>
              <div className="form-row">
                <label className="form-label" htmlFor={`${uid}-target`}>
                  Links to
                </label>
                <select
                  id={`${uid}-target`}
                  className="field field-select"
                  value={target}
                  onChange={(e) => setTarget(e.target.value as RecordType | 'any')}
                >
                  {TARGETS.map((t) => (
                    <option key={t} value={t}>
                      {t === 'any' ? 'Any record' : DESTINATIONS.find((d) => d.key === t)?.label}
                    </option>
                  ))}
                </select>
              </div>
              <label className="form-check">
                <input
                  type="checkbox"
                  checked={multiple}
                  onChange={(e) => setMultiple(e.target.checked)}
                />
                <span>Allow more than one</span>
              </label>
            </>
          )}
          {error && (
            <p className="row-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={busy}>
              Add property
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
