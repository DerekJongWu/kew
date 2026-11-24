// The record's properties: every schema field for its type (in schema order), then any keys the
// schema doesn't know, read-only, with "Add to schema".
import { useState } from 'react'
import type { FieldDef, FieldType, RecordDetail } from '../../../shared/api'
import { displayValue, guessType, otherKeys, propertyFields } from '../lib/properties'
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
  /** Lay fields out in columns (company page); otherwise one column (side panel). */
  wide?: boolean
}): React.JSX.Element {
  const [adding, setAdding] = useState<null | { key: string; type: FieldType } | 'new'>(null)
  const shown = propertyFields(fields)
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
      {others.length > 0 && (
        <div className="props-other">
          <h3 className="props-other-title">Other properties</h3>
          <p className="form-hint">In this note but not in the {record.type} fields yet.</p>
          <dl className={`props${wide ? ' props-wide' : ''}`}>
            {others.map((k) => (
              <div key={k} className="prop">
                <dt className="prop-label">{k}</dt>
                <dd className="prop-value prop-inline">
                  <span className="prop-raw">{displayValue(record.fields[k]) || '—'}</span>
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
      {adding && (
        <AddPropertyDialog
          type={record.type}
          existing={fields.map((f) => f.key)}
          prefill={adding === 'new' ? undefined : adding}
          onClose={() => setAdding(null)}
        />
      )}
    </Section>
  )
}
