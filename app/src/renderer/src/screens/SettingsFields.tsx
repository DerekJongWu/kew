// Settings › Fields: the types, their fields, and an editor for the selected field.
import { useId, useState } from 'react'
import { kew, useQuery } from '../api'
import { plainError, status } from '../lib/actions'
import { TYPE_LABEL } from '../lib/destinations'
import { optionValue } from '../lib/properties'
import {
  CATEGORIES,
  FIELD_TYPE_LABEL,
  deleteSentence,
  hasOptions,
  moveOption,
  optionValueProblem,
  renameKeyProblem,
  toEditOptions,
  toOptionDefs,
  usedBy,
  type EditOption
} from '../lib/settings-fields'
import type { FieldDef, RecordType, StageCategory } from '../../../shared/api'
import { AddPropertyDialog } from '../components/AddPropertyDialog'
import { Button } from '../components/Button'
import { Chip } from '../components/Chip'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { SettingsHeader } from '../components/SettingsTabs'

const TYPES: RecordType[] = ['company', 'person', 'meeting', 'theme', 'research']
const TIER_LABEL = { system: 'System', starter: 'Starter', custom: 'Custom' } as const

function OptionsEditor({
  field,
  options,
  onChange
}: {
  field: FieldDef
  options: EditOption[]
  onChange(next: EditOption[]): void
}): React.JSX.Element {
  const uid = useId()
  const [newLabel, setNewLabel] = useState('')
  const [newCategory, setNewCategory] = useState<StageCategory>('in-progress')
  const stage = field.type === 'stage'
  const patch = (i: number, p: Partial<EditOption>): void =>
    onChange(options.map((o, j) => (j === i ? { ...o, ...p } : o)))
  const addValue = optionValue(newLabel)
  const addProblem = addValue ? optionValueProblem(addValue, options, -1) : null
  const add = (): void => {
    if (!addValue || addProblem) return
    onChange([
      ...options,
      {
        value: addValue,
        label: newLabel.trim(),
        origin: null,
        ...(stage ? { category: newCategory } : {})
      }
    ])
    setNewLabel('')
  }
  return (
    <div className="opt-editor">
      <p className="form-label">Options</p>
      {options.length === 0 && (
        <p className="form-hint">No options yet, so any value is allowed.</p>
      )}
      <ul className="opt-list">
        {options.map((o, i) => {
          const problem = optionValueProblem(o.value, options, i)
          return (
            <li key={o.origin ?? `new-${i}`} className="opt-row">
              <span className="opt-move">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Move ${o.label} up`}
                  disabled={i === 0}
                  onClick={() => onChange(moveOption(options, i, -1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Move ${o.label} down`}
                  disabled={i === options.length - 1}
                  onClick={() => onChange(moveOption(options, i, 1))}
                >
                  ↓
                </button>
              </span>
              <input
                className="field"
                aria-label={`Label for ${o.value}`}
                value={o.label}
                onChange={(e) => patch(i, { label: e.target.value })}
              />
              <div className="opt-rest">
                <input
                  className={`field opt-value${problem ? ' field-invalid' : ''}`}
                  aria-label={`Saved value for ${o.label}`}
                  aria-invalid={problem ? true : undefined}
                  title={
                    problem ?? 'The value stored in notes. Changing it rewrites notes that use it.'
                  }
                  value={o.value}
                  onChange={(e) => patch(i, { value: e.target.value.trim() })}
                />
                {stage && (
                  <select
                    className="field field-select"
                    aria-label={`Category for ${o.label}`}
                    value={o.category ?? 'in-progress'}
                    onChange={(e) => patch(i, { category: e.target.value as StageCategory })}
                  >
                    {CATEGORIES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove option ${o.label}`}
                onClick={() => onChange(options.filter((_, j) => j !== i))}
              >
                ×
              </button>
              {problem && <p className="form-error opt-problem">{problem}</p>}
            </li>
          )
        })}
      </ul>
      <div className="opt-add">
        <label className="visually-hidden" htmlFor={`${uid}-new`}>
          New option label
        </label>
        <input
          id={`${uid}-new`}
          className="field field-grow"
          value={newLabel}
          placeholder={stage ? 'New stage' : 'New option'}
          autoComplete="off"
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        {stage && (
          <select
            className="field field-select"
            aria-label="Category for the new stage"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as StageCategory)}
          >
            {CATEGORIES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        )}
        <Button onClick={add} disabled={!addValue || !!addProblem}>
          {stage ? 'Add stage' : 'Add option'}
        </Button>
      </div>
      {addProblem && <p className="form-error">{addProblem}</p>}
      <p className="form-hint">
        Renaming a label only changes what you see. Changing the saved value rewrites every note
        that uses it, in one change you can undo.
      </p>
    </div>
  )
}

function FieldEditor({
  type,
  field,
  existingKeys,
  onRenamed,
  onDeleted
}: {
  type: RecordType
  field: FieldDef
  existingKeys: string[]
  onRenamed(key: string): void
  onDeleted(): void
}): React.JSX.Element {
  const uid = useId()
  const system = field.tier === 'system'
  const [label, setLabel] = useState(field.label)
  const [options, setOptions] = useState<EditOption[]>(() => toEditOptions(field.options))
  const [newKey, setNewKey] = useState(field.key)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<number | null>(null)

  const withOptions = hasOptions(field.type)
  const labelChanged = label.trim() !== field.label
  const optionsChanged =
    withOptions && JSON.stringify(toOptionDefs(options)) !== JSON.stringify(field.options ?? [])
  const optionProblem = options.some(
    (o, i) => optionValueProblem(o.value, options, i) || !o.label.trim()
  )
  const keyProblem = newKey === field.key ? null : renameKeyProblem(newKey, field.key, existingKeys)

  const run = async (fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      await status.run(fn)
      return true
    } catch (e) {
      setError(plainError(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  const save = (): Promise<boolean> =>
    run(() =>
      kew.changeSchema({
        kind: 'update-field',
        type,
        key: field.key,
        ...(labelChanged ? { label: label.trim() } : {}),
        ...(optionsChanged ? { options: toOptionDefs(options) } : {})
      })
    )

  const rename = async (): Promise<void> => {
    if (
      await run(() => kew.changeSchema({ kind: 'rename-field', type, from: field.key, to: newKey }))
    )
      onRenamed(newKey)
  }

  const askDelete = async (): Promise<void> => {
    setError(null)
    try {
      setConfirm(await kew.affectedCount({ kind: 'delete-field', type, key: field.key }))
    } catch (e) {
      setError(plainError(e))
    }
  }
  const doDelete = async (): Promise<void> => {
    if (await run(() => kew.changeSchema({ kind: 'delete-field', type, key: field.key }))) {
      setConfirm(null)
      onDeleted()
    }
  }

  return (
    <section className="field-panel" aria-label={`Edit ${field.label}`}>
      <header className="field-panel-head">
        <h2 className="section-title">{field.label}</h2>
        <Chip tone={system ? 'accent' : 'neutral'}>{TIER_LABEL[field.tier]}</Chip>
      </header>
      <p className="form-hint">
        <code className="prop-key">{field.key}</code> · {FIELD_TYPE_LABEL[field.type]}
      </p>
      {system && <p className="form-hint field-system">System — can’t be deleted or renamed.</p>}

      <form
        className="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (!busy && (labelChanged || optionsChanged) && label.trim() && !optionProblem)
            void save()
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
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        {withOptions && <OptionsEditor field={field} options={options} onChange={setOptions} />}
        <div className="form-actions">
          <Button
            variant="primary"
            type="submit"
            disabled={busy || !(labelChanged || optionsChanged) || !label.trim() || optionProblem}
          >
            Save changes
          </Button>
        </div>
      </form>

      {!system && (
        <>
          <form
            className="form field-danger-zone"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              if (!busy && newKey !== field.key && !keyProblem) void rename()
            }}
          >
            <div className="form-row">
              <label className="form-label" htmlFor={`${uid}-key`}>
                Key
              </label>
              <div className="prop-inline">
                <input
                  id={`${uid}-key`}
                  className={`field field-grow${keyProblem ? ' field-invalid' : ''}`}
                  aria-invalid={keyProblem ? true : undefined}
                  value={newKey}
                  autoComplete="off"
                  onChange={(e) => setNewKey(e.target.value.toLowerCase())}
                />
                <Button type="submit" disabled={busy || newKey === field.key || !!keyProblem}>
                  Rename key
                </Button>
              </div>
              {keyProblem && newKey !== field.key ? (
                <p className="form-error">{keyProblem}</p>
              ) : (
                <p className="form-hint">Rewrites the key in every note that has it.</p>
              )}
            </div>
          </form>
          <div className="field-danger-zone">
            <Button
              variant="ghost"
              className="btn-danger"
              onClick={() => void askDelete()}
              disabled={busy}
            >
              Delete field…
            </Button>
          </div>
        </>
      )}

      {error && confirm === null && (
        <p className="row-error" role="alert">
          {error}
        </p>
      )}
      {confirm !== null && (
        <ConfirmDialog
          title={`Delete ${field.label}?`}
          confirmLabel="Delete field"
          busy={busy}
          error={error}
          onConfirm={() => void doDelete()}
          onCancel={() => (setConfirm(null), setError(null))}
        >
          {deleteSentence(field.label, confirm)}
        </ConfirmDialog>
      )}
    </section>
  )
}

export function SettingsFields(): React.JSX.Element {
  const [type, setType] = useState<RecordType>('company')
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const { data: schema, error: schemaError } = useQuery(() => kew.schema(), [])
  const { data: records } = useQuery(() => kew.list(type), [type])
  const { data: state } = useQuery(() => kew.getState(), [])

  const fields = schema?.types[type].fields ?? []
  const field = fields.find((f) => f.key === selected) ?? null
  const vaultError = state?.vault?.schemaError ?? null

  return (
    <div className="screen screen-wide settings">
      <SettingsHeader tab="fields" title="Fields" />
      {vaultError && (
        <div className="record-banner" role="alert">
          Your schema file has an error, so Kew is using the last valid version: {vaultError}
        </div>
      )}
      {schemaError && (
        <p className="row-error" role="alert">
          {plainError(schemaError)}
        </p>
      )}
      <div className="settings-grid">
        <nav className="type-list" aria-label="Note type">
          <p className="form-hint">Note type</p>
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className="type-btn"
              aria-current={t === type ? 'true' : undefined}
              onClick={() => (setType(t), setSelected(null))}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </nav>

        <div className="ftable-wrap">
          <table className="ftable">
            <caption className="visually-hidden">{TYPE_LABEL[type]} fields</caption>
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Key</th>
                <th scope="col">Type</th>
                <th scope="col">Tier</th>
                <th scope="col" className="num">
                  Used by
                </th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => {
                const n = records ? usedBy(records, f.key) : null
                return (
                  <tr key={f.key} className={f.key === selected ? 'is-selected' : undefined}>
                    <th scope="row">
                      <button
                        type="button"
                        className="ftable-name"
                        aria-pressed={f.key === selected}
                        onClick={() => setSelected(f.key)}
                      >
                        {f.label}
                      </button>
                    </th>
                    <td>
                      <code className="prop-key">{f.key}</code>
                    </td>
                    <td className="muted">{FIELD_TYPE_LABEL[f.type]}</td>
                    <td>
                      <Chip tone={f.tier === 'system' ? 'accent' : 'neutral'}>
                        {TIER_LABEL[f.tier]}
                      </Chip>
                    </td>
                    <td className="num muted">
                      {n === null ? '' : `${n} ${n === 1 ? 'note' : 'notes'}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="ftable-foot">
            <Button onClick={() => setAdding(true)}>+ Add field</Button>
          </div>
        </div>

        {field ? (
          <FieldEditor
            key={`${type}/${field.key}/${JSON.stringify(field)}`}
            type={type}
            field={field}
            existingKeys={fields.map((f) => f.key)}
            onRenamed={setSelected}
            onDeleted={() => setSelected(null)}
          />
        ) : (
          <section className="field-panel field-panel-empty">
            <p className="form-hint">Select a field to edit its label, options or key.</p>
          </section>
        )}
      </div>
      {adding && (
        <AddPropertyDialog
          type={type}
          existing={fields.map((f) => f.key)}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  )
}
