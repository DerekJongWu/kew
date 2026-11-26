import type { FieldDef, ViewDef } from '../../../shared/api'
import { filterCount, filterableFields } from '../lib/pipeline'
import { Popover } from './Popover'

export interface FilterOption {
  value: string
  label: string
}

interface FilterProps {
  fields: FieldDef[]
  filters: ViewDef['filters']
  optionsFor(field: FieldDef): FilterOption[]
  onToggle(key: string, value: string): void
  onClear(): void
}

const onValues = (filters: ViewDef['filters'], key: string): string[] =>
  (filters[key] ?? []).map((v) => v.toLowerCase())

/** One field's checkboxes. Several values mean "any of". */
function FieldChecks({
  field,
  on,
  options,
  onToggle,
  showLegend
}: {
  field: FieldDef
  on: string[]
  options: FilterOption[]
  onToggle(key: string, value: string): void
  showLegend: boolean
}): React.JSX.Element {
  return (
    <fieldset className="filter-list">
      <legend className={showLegend ? 'filter-legend' : 'visually-hidden'}>{field.label}</legend>
      {options.length === 0 && <p className="menu-label">Nothing to filter by yet.</p>}
      {options.map((o) => (
        <label key={o.value} className="filter-item">
          <input
            type="checkbox"
            checked={on.includes(o.value.toLowerCase())}
            onChange={() => onToggle(field.key, o.value)}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  )
}

/** One checkbox popover per select, stage, multi-select or relation field. Several values mean "any of". */
export function FilterBar({
  fields,
  filters,
  optionsFor,
  onToggle,
  onClear
}: FilterProps): React.JSX.Element {
  return (
    <div className="filter-bar" role="group" aria-label="Filters">
      {filterableFields(fields).map((f) => {
        const on = onValues(filters, f.key)
        return (
          <Popover
            key={f.key}
            label={on.length ? `${f.label} · ${on.length}` : f.label}
            buttonClass={`btn ${on.length ? 'btn-secondary filter-on' : 'btn-ghost'}`}
            panelLabel={`Filter by ${f.label}`}
          >
            {() => (
              <FieldChecks
                field={f}
                on={on}
                options={optionsFor(f)}
                onToggle={onToggle}
                showLegend={false}
              />
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

/**
 * One "Filter" button (with the number of active filters: "Filter · 2") whose popover holds every
 * field's checkboxes and "Clear filters".
 */
export function FilterMenu({
  fields,
  filters,
  optionsFor,
  onToggle,
  onClear
}: FilterProps): React.JSX.Element {
  const count = filterCount(filters)
  return (
    <div className="filter-bar">
      <Popover
        label={count ? `Filter · ${count}` : 'Filter'}
        buttonClass={`btn ${count ? 'btn-secondary filter-on' : 'btn-ghost'}`}
        panelLabel="Filters"
      >
        {() => (
          <div className="filter-menu">
            <div className="filter-menu-body">
              {filterableFields(fields).map((f) => (
                <FieldChecks
                  key={f.key}
                  field={f}
                  on={onValues(filters, f.key)}
                  options={optionsFor(f)}
                  onToggle={onToggle}
                  showLegend
                />
              ))}
            </div>
            <div className="filter-menu-foot">
              <button type="button" className="link" onClick={onClear} disabled={count === 0}>
                Clear filters
              </button>
            </div>
          </div>
        )}
      </Popover>
    </div>
  )
}
