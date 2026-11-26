// The record's properties: every schema field for its type (in schema order), then any keys the
// schema doesn't know, read-only, with "Add to schema".
import { useState } from 'react'
import type { FieldDef, FieldType, RecordDetail } from '../../../shared/api'
import { EMPTY } from '../lib/dates'
import {
  displayValue,
  guessType,
  isEmptyValue,
  otherKeys,
  propertyFields,
  splitEmptyFields
} from '../lib/properties'
import { createPortal } from 'react-dom'
import { AddPropertyDialog } from './AddPropertyDialog'
import { FieldInput, type Commit } from './FieldInput'
import { Icon } from './Icon'
import { Section } from './Section'

export function PropertyPanel({
  record,
  fields,
  byKey,
  onCommit,
  wide = false
}: {
  record: RecordDetail
  fields: FieldDef[] // the schema's fields for this type
  byKey: Record<string, string[]> // problems per field key
  onCommit: Commit
  /**
   * Lay fields out in columns (company page); otherwise one column (side panel). Wide panels also
   * fold empty fields behind "Show N empty fields" (collapsed each time the page opens).
   */
  wide?: boolean
}): React.JSX.Element {
  const [adding, setAdding] = useState<null | { key: string; type: FieldType } | 'new'>(null)
  const [showEmpty, setShowEmpty] = useState(false)
  const all = propertyFields(fields)
  // Fields that had a value or a problem while this page was open stay visible.
  const filled = all.filter((f) => !isEmptyValue(record.fields[f.key]) || byKey[f.key])
  const [kept, setKept] = useState<ReadonlySet<string>>(() => new Set(filled.map((f) => f.key)))
  if (filled.some((f) => !kept.has(f.key))) setKept(new Set([...kept, ...filled.map((f) => f.key)]))
  const keep = new Set([...kept, ...filled.map((f) => f.key)])
  const split = wide ? splitEmptyFields(all, record.fields, keep) : { shown: all, hidden: [] }
  const shown = showEmpty ? all : split.shown
  const others = otherKeys(record.fields, fields)

  return (
    <Section
      title="Properties"
      action={
        <button type="button" className="link" onClick={() => setAdding('new')}>
          <Icon name="plus" size={12} /> Add a property
        </button>
      }
    >
      {shown.length > 0 && (
        <div className={`props${wide ? ' props-wide' : ''}`}>
          {shown.map((f) => (
            <FieldInput
              key={f.key}
              field={f}
              value={record.fields[f.key]}
              problems={byKey[f.key]}
              onCommit={onCommit}
            />
          ))}
        </div>
      )}
      {split.hidden.length > 0 && (
        <button
          type="button"
          className="link props-toggle"
          aria-expanded={showEmpty}
          onClick={() => setShowEmpty(!showEmpty)}
        >
          {showEmpty
            ? 'Hide empty fields'
            : `Show ${split.hidden.length} empty ${split.hidden.length === 1 ? 'field' : 'fields'}`}
        </button>
      )}
      {others.length > 0 && (
        <div className="props-other">
          <h3 className="props-other-title">Other properties</h3>
          <p className="form-hint">In this note but not in the {record.type} fields yet.</p>
          <dl className={`props${wide ? ' props-wide' : ''}`}>
            {others.map((k) => (
              <div key={k} className="prop">
                <dt className="prop-label">{k}</dt>
                <dd className="prop-value prop-inline">
                  <span className="prop-raw">{displayValue(record.fields[k]) || EMPTY}</span>
                  <button
                    type="button"
                    className="link"
                    aria-label={`Add ${k} to the ${record.type} fields`}
                    onClick={() => setAdding({ key: k, type: guessType(record.fields[k]) })}
                  >
                    Add to schema
                  </button>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {adding &&
        // Portaled: the record layout is a layout container, which would otherwise hold the fixed scrim.
        createPortal(
          <AddPropertyDialog
            type={record.type}
            existing={fields.map((f) => f.key)}
            prefill={adding === 'new' ? undefined : adding}
            onClose={() => setAdding(null)}
          />,
          document.body
        )}
    </Section>
  )
}
