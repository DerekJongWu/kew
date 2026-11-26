import { describe, it, expect } from 'vitest'
import {
  addView,
  boardColumns,
  canDeleteView,
  dropAction,
  moveTargets,
  filterableFields,
  nextSort,
  removeView,
  toggleFilter,
  updateView,
  valuesOf
} from '../../src/renderer/src/lib/pipeline'
import { lastTouchText } from '../../src/renderer/src/lib/touch'
import { DEFAULT_SCHEMA } from '../../src/core/schema/defaults'
import type { RecordSummary, ViewDef } from '../../src/shared/api'

const company = DEFAULT_SCHEMA.types.company.fields
const status = company.find((f) => f.key === 'pipeline_status')!
const rec = (name: string, fields: RecordSummary['fields']): RecordSummary => ({
  id: name,
  type: 'company',
  name,
  path: `Companies/${name}.md`,
  fields,
  problems: []
})
const view = (filters: ViewDef['filters'] = {}): ViewDef => ({
  id: 'v',
  name: 'V',
  type: 'company',
  layout: 'board',
  groupBy: 'pipeline_status',
  filters,
  columns: ['name']
})

describe('boardColumns', () => {
  const rows = [
    rec('A', { pipeline_status: 'new' }),
    rec('B', { pipeline_status: 'pursuing' }),
    rec('C', { pipeline_status: 'new' }),
    rec('D', {})
  ]
  it('uses every option in schema order, plus a catch-all only when needed', () => {
    const cols = boardColumns(view(), status, rows)
    expect(cols.map((c) => c.value)).toEqual([
      'new',
      'pursuing',
      'reached-out',
      'no-reply',
      'active',
      'revisit',
      'passed',
      'archived',
      ''
    ])
    expect(cols[0].rows.map((r) => r.name)).toEqual(['A', 'C'])
    expect(cols.at(-1)!.rows.map((r) => r.name)).toEqual(['D'])
    expect(boardColumns(view(), status, rows.slice(0, 3)).at(-1)!.value).toBe('archived')
  })
  it('limits columns to the values the view filter allows', () => {
    const cols = boardColumns(
      view({ pipeline_status: ['new', 'pursuing', 'reached-out', 'no-reply'] }),
      status,
      rows.slice(0, 3)
    )
    expect(cols.map((c) => c.value)).toEqual(['new', 'pursuing', 'reached-out', 'no-reply'])
  })
})

describe('moveTargets', () => {
  it("offers every stage in the schema, closed ones included, even when the view shows fewer columns", () => {
    const shown = boardColumns(view({ pipeline_status: ['new', 'pursuing'] }), status, [])
    expect(shown.map((c) => c.value)).toEqual(['new', 'pursuing'])
    const targets = moveTargets(status, 'new')
    expect(targets.map((t) => t.value)).toEqual(
      status.options!.map((o) => o.value).filter((v) => v !== 'new')
    )
    expect(targets.map((t) => t.value)).toEqual(
      expect.arrayContaining(['active', 'passed', 'archived', 'revisit'])
    )
    expect(targets.find((t) => t.value === 'passed')?.label).toBe(
      status.options!.find((o) => o.value === 'passed')!.label
    )
  })
  it('offers every stage to a card with no value and leaves out the current one case-insensitively', () => {
    expect(moveTargets(status, '')).toHaveLength(status.options!.length)
    expect(moveTargets(status, 'Active').some((t) => t.value === 'active')).toBe(false)
  })
})

describe('dropAction', () => {
  it('sets the field, asks for a reason on passed, and ignores no-ops', () => {
    expect(dropAction(status, 'new', 'pursuing')).toEqual({ kind: 'set', value: 'pursuing' })
    expect(dropAction(status, 'new', 'passed')).toEqual({ kind: 'pass' })
    expect(dropAction(status, 'new', 'archived')).toEqual({ kind: 'set', value: 'archived' })
    expect(dropAction(status, 'new', 'revisit')).toEqual({ kind: 'set', value: 'revisit' })
    expect(dropAction(status, 'new', 'new')).toEqual({ kind: 'none' })
    expect(dropAction(status, 'new', 'nope')).toEqual({ kind: 'none' })
  })
})

describe('filters and sorting', () => {
  it('toggles values and drops empty filters', () => {
    const a = toggleFilter({}, 'source', 'intro')
    expect(a).toEqual({ source: ['intro'] })
    expect(toggleFilter(a, 'source', 'email')).toEqual({ source: ['intro', 'email'] })
    expect(toggleFilter(a, 'source', 'Intro')).toEqual({})
  })
  it('offers select, stage and relation fields only', () => {
    const keys = filterableFields(company).map((f) => f.key)
    expect(keys).toContain('pipeline_status')
    expect(keys).toContain('themes')
    expect(keys).not.toContain('raise')
    expect(keys).not.toContain('first_seen')
  })
  it('flips direction on the same field', () => {
    expect(nextSort(undefined, 'name')).toEqual({ field: 'name', dir: 'asc' })
    expect(nextSort({ field: 'name', dir: 'asc' }, 'name')).toEqual({ field: 'name', dir: 'desc' })
    expect(nextSort({ field: 'name', dir: 'desc' }, 'raise')).toEqual({
      field: 'raise',
      dir: 'asc'
    })
  })
  it('unwraps relation values', () => {
    expect(valuesOf(['[[AI Agent Security]]', 'x'])).toEqual(['AI Agent Security', 'x'])
    expect(valuesOf(null)).toEqual([])
  })
})

describe('saved views', () => {
  const a = view({ source: ['intro'] })
  it('copies the current view under a new, unique id', () => {
    const r = addView([a], a, 'My view')
    expect(r.id).toBe('my-view')
    expect(r.views[1]).toMatchObject({ name: 'My view', filters: { source: ['intro'] } })
    r.views[1].filters.source.push('x')
    expect(a.filters.source).toEqual(['intro'])
    expect(addView(r.views, a, 'My view').id).toBe('my-view-2')
  })
  it('updates and removes views, keeping the last one', () => {
    expect(updateView([a], 'v', { layout: 'table' })[0].layout).toBe('table')
    expect(
      'sort' in
        updateView([{ ...a, sort: { field: 'name', dir: 'asc' } }], 'v', { sort: undefined })[0]
    ).toBe(false)
    const two = [a, { ...a, id: 'w' }]
    expect(canDeleteView(two)).toBe(true)
    expect(removeView(two, 'v').map((v) => v.id)).toEqual(['w'])
    expect(canDeleteView([a])).toBe(false)
    expect(removeView([a], 'v')).toEqual([a])
  })
})

describe('lastTouchText', () => {
  it('formats the derived value relative to today', () => {
    expect(lastTouchText('2026-11-21|out|linkedin', '2026-11-24')).toBe('Messaged 3 days ago')
    expect(lastTouchText('2026-11-22|in|email', '2026-11-24')).toBe('Replied 2 days ago')
    expect(lastTouchText('2026-11-19|note|email', '2026-11-24')).toBe('Note 5 days ago')
    expect(lastTouchText('2026-11-24|out|email', '2026-11-24')).toBe('Messaged today')
    expect(lastTouchText(null, '2026-11-24')).toBe('')
    expect(lastTouchText('garbage', '2026-11-24')).toBe('')
  })
})
