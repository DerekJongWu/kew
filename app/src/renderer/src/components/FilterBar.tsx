import type { FieldDef, ViewDef } from '../../../shared/api'
import { filterCount, filterableFields } from '../lib/pipeline'
import { Popover } from './Popover'

export interface FilterOption {
  value: string
  label: string
}

/** One checkbox popover per select, stage, multi-select or relation field. Several values mean "any of". */
export function FilterBar({
  fields,
  filters,
  optionsFor,
  onToggle,
  onClear
}: {
  fields: FieldDef[]
  filters: ViewDef['filters']
  optionsFor(field: FieldDef): FilterOption[]
  onToggle(key: string, value: string): void
  onClear(): void
}): React.JSX.Element {
  return (
    <div className="filter-bar" role="group" aria-label="Filters">
      {filterableFields(fields).map((f) => {
        const on = (filters[f.key] ?? []).map((v) => v.toLowerCase())
        const options = optionsFor(f)
        return (
          <Popover
            key={f.key}
            label={on.length ? `${f.label} · ${on.length}` : f.label}
            buttonClass={`btn ${on.length ? 'btn-secondary filter-on' : 'btn-ghost'}`}
            panelLabel={`Filter by ${f.label}`}
          >
            {() => (
              <fieldset className="filter-list">
                <legend className="visually-hidden">{f.label}</legend>
                {options.length === 0 && <p className="menu-label">Nothing to filter by yet.</p>}
                {options.map((o) => (
                  <label key={o.value} className="filter-item">
                    <input
                      type="checkbox"
                      checked={on.includes(o.value.toLowerCase())}
                      onChange={() => onToggle(f.key, o.value)}
                    />
                    <span>{o.label}</span>
                  </label>
                ))}
              </fieldset>
            )}
          </Popover>
        )
      })}
      {filterCount(filters) > 0 && (
        <button type="button" className="link" onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  )
}
