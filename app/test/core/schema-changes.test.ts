import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fsp, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { History } from '../../src/core/history'
import { openIndex, type Index } from '../../src/core/index'
import { loadSchema } from '../../src/core/schema/load'
import { ValidationError } from '../../src/core/schema/validate'
import type { Schema } from '../../src/core/schema/types'
import { undoAction, type Ctx } from '../../src/core/write/apply'
import { setFields } from '../../src/core/write/records'
import {
  affectedCount,
  changeSchema,
  loadViews,
  saveViews,
  serializeViews
} from '../../src/core/write/schema-changes'

const FIXTURE = join(__dirname, '../fixtures/vaults/basic')
const initial = loadSchema(readFileSync(join(FIXTURE, '.kew/schema.yaml'), 'utf8'), null).schema
const TEMPLATES: Ctx['templates'] = { company: '', person: '', meeting: '', theme: '', research: '' }

let tmp: string, vault: string, idx: Index, history: History, ctx: Ctx, current: Schema

const read = (rel: string): string => readFileSync(join(vault, rel), 'utf8')
const companyField = (k: string) => current.types.company.fields.find((f) => f.key === k)!

beforeEach(async () => {
  tmp = await fsp.mkdtemp(join(tmpdir(), 'kew-schema-changes-'))
  vault = join(tmp, 'vault')
  await fsp.cp(FIXTURE, vault, { recursive: true })
  current = initial
  history = await History.open(join(tmp, 'history.git'), vault)
  idx = openIndex(':memory:')
  await idx.rebuild(vault, current)
  ctx = {
    root: vault,
    schema: () => current,
    setSchema: (s) => { current = s },
    index: idx,
    history,
    today: () => '2026-11-24',
    templates: TEMPLATES
  }
})
afterEach(async () => {
  idx.close()
  await fsp.rm(tmp, { recursive: true, force: true })
})

const stageOptions = () =>
  companyField('pipeline_status').options!.map((o) =>
    o.value === 'reached-out' ? { ...o, value: 'contacted', label: 'Contacted', renamedFrom: 'reached-out' } : o
  )

describe('changeSchema', () => {
  it('renames an option, rewriting only notes that use it; undo reverts all; renamedFrom is not persisted', async () => {
    const change = { kind: 'update-field', type: 'company', key: 'pipeline_status', options: stageOptions() } as const
    expect(affectedCount(ctx, change)).toBe(1)
    const schemaBefore = read('.kew/schema.yaml')
    const others = ['Harbor Analytics', 'Lumen Ledger', 'Fernwood Robotics'].map((n) => read(`Companies/${n}.md`))
    const r = await changeSchema(ctx, change)
    expect(r.entry.message).toBe('Updated field Pipeline status (1 notes)')
    expect(read('Companies/Quill Security.md')).toContain('pipeline_status: contacted\n')
    expect(['Harbor Analytics', 'Lumen Ledger', 'Fernwood Robotics'].map((n) => read(`Companies/${n}.md`))).toEqual(others)
    expect(read('.kew/schema.yaml')).not.toContain('renamedFrom')
    expect(read('.kew/schema.yaml')).toContain('value: contacted')
    expect(companyField('pipeline_status').options!.some((o) => o.value === 'contacted')).toBe(true)
    expect(idx.resolveName('Quill Security')!.fields.pipeline_status).toBe('contacted')
    await undoAction(ctx, r.entry.id)
    expect(read('.kew/schema.yaml')).toBe(schemaBefore)
    expect(read('Companies/Quill Security.md')).toContain('pipeline_status: reached-out\n')
  })

  it('renames an option in a multi-select, keeping order', async () => {
    await changeSchema(ctx, {
      kind: 'add-field', type: 'company',
      field: { key: 'tags_x', label: 'Tags x', type: 'multi-select', tier: 'custom', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }] }
    })
    await setFields(ctx, idx.resolveName('Quill Security')!.id, { tags_x: ['a', 'b', 'c'] })
    await changeSchema(ctx, {
      kind: 'update-field', type: 'company', key: 'tags_x',
      options: [{ value: 'a', label: 'A' }, { value: 'bb', label: 'BB', renamedFrom: 'b' }, { value: 'c', label: 'C' }]
    })
    expect(read('Companies/Quill Security.md')).toContain('tags_x: [a, bb, c]')
  })

  it('refuses removing an option that notes still use, naming the count', async () => {
    const options = companyField('pipeline_status').options!.filter((o) => o.value !== 'passed')
    await expect(
      changeSchema(ctx, { kind: 'update-field', type: 'company', key: 'pipeline_status', options })
    ).rejects.toThrow(/1 note uses/)
    expect(read('.kew/schema.yaml')).toBe(readFileSync(join(FIXTURE, '.kew/schema.yaml'), 'utf8'))
    expect(companyField('pipeline_status').options!.some((o) => o.value === 'passed')).toBe(true)
  })

  it('after a failure past the writes, ctx and index match what is on disk; the original error is rethrown', async () => {
    const boom = new Error('history exploded')
    ctx.history = { ...history, commitExternal: history.commitExternal.bind(history), commitAction: async () => { throw boom } } as unknown as History
    await expect(
      changeSchema(ctx, { kind: 'update-field', type: 'company', key: 'pipeline_status', options: stageOptions() })
    ).rejects.toBe(boom)
    const onDisk = loadSchema(read('.kew/schema.yaml'), null)
    expect(onDisk.error).toBeNull()
    expect(ctx.schema()).toEqual(onDisk.schema)
    expect(read('Companies/Quill Security.md')).toContain('pipeline_status: contacted\n')
    const rec = idx.resolveName('Quill Security')!
    expect(rec.fields.pipeline_status).toBe('contacted')
    expect(rec.problems).toEqual([])
  })

  it('restores the old schema in ctx when the action fails before writing', async () => {
    const old = current
    const before = read('.kew/schema.yaml')
    ctx.hooks = { beforeWrite: async () => { throw new Error('stop') } }
    await expect(
      changeSchema(ctx, { kind: 'update-field', type: 'company', key: 'pipeline_status', options: stageOptions() })
    ).rejects.toThrow('stop')
    expect(ctx.schema()).toEqual(old)
    expect(read('.kew/schema.yaml')).toBe(before)
    expect(read('Companies/Quill Security.md')).toContain('pipeline_status: reached-out\n')
    expect(idx.resolveName('Quill Security')!.problems).toEqual([])
  })

  it('refuses schema changes when ctx has no setSchema, writing nothing', async () => {
    const before = read('.kew/schema.yaml')
    delete ctx.setSchema
    await expect(
      changeSchema(ctx, { kind: 'delete-field', type: 'company', key: 'stage' })
    ).rejects.toThrow(/setSchema/)
    expect(read('.kew/schema.yaml')).toBe(before)
  })

  it('renames a field key, keeping values and other lines', async () => {
    const before = read('Companies/Quill Security.md')
    const change = { kind: 'rename-field', type: 'company', from: 'stage', to: 'round_stage' } as const
    const n = affectedCount(ctx, change)
    expect(n).toBe(4)
    const r = await changeSchema(ctx, change)
    expect(r.entry.message).toBe('Renamed field Stage to Round stage (4 notes)')
    expect(read('Companies/Quill Security.md')).toBe(before.replace('stage: seed', 'round_stage: seed'))
    expect(companyField('round_stage').label).toBe('Round stage')
    expect(idx.resolveName('Quill Security')!.fields.round_stage).toBe('seed')
  })

  it('refuses renaming onto an existing key, a bad key, or a system field', async () => {
    const rename = (from: string, to: string) => changeSchema(ctx, { kind: 'rename-field', type: 'company', from, to })
    await expect(rename('stage', 'source')).rejects.toThrow(ValidationError)
    await expect(rename('stage', 'Bad Key')).rejects.toThrow(ValidationError)
    await expect(rename('pipeline_status', 'status')).rejects.toThrow(/system/)
  })

  it('deletes a field from schema and notes; refuses system fields', async () => {
    const del = { kind: 'delete-field', type: 'company', key: 'stage' } as const
    const r = await changeSchema(ctx, del)
    expect(r.entry.message).toBe('Deleted field Stage (4 notes)')
    expect(read('Companies/Quill Security.md')).not.toContain('stage:')
    expect(read('.kew/schema.yaml')).not.toContain('key: stage')
    await expect(changeSchema(ctx, { kind: 'delete-field', type: 'company', key: 'name' })).rejects.toThrow(/system/)
  })

  it('adds a field to the schema only, with no note count in the message', async () => {
    const r = await changeSchema(ctx, {
      kind: 'add-field', type: 'company',
      field: { key: 'fund', label: 'Fund', type: 'text', tier: 'custom' }
    })
    expect(r.entry.message).toBe('Added field Fund')
    await expect(
      changeSchema(ctx, { kind: 'add-field', type: 'company', field: { key: 'fund', label: 'Fund', type: 'text', tier: 'custom' } })
    ).rejects.toThrow(ValidationError)
  })

  it('writes nothing when the new schema would not load', async () => {
    const before = read('.kew/schema.yaml')
    await expect(
      changeSchema(ctx, {
        kind: 'add-field', type: 'company',
        field: { key: 'rel', label: 'Rel', type: 'relation', tier: 'custom' }
      })
    ).rejects.toThrow(ValidationError)
    expect(read('.kew/schema.yaml')).toBe(before)
  })

  it('allows relabelling and category changes on the system stage field', async () => {
    const options = companyField('pipeline_status').options!.map((o) =>
      o.value === 'no-reply' ? { ...o, label: 'Silent', category: 'closed' as const } : o
    )
    await changeSchema(ctx, { kind: 'update-field', type: 'company', key: 'pipeline_status', label: 'Status', options })
    expect(companyField('pipeline_status').label).toBe('Status')
    expect(companyField('pipeline_status').options!.find((o) => o.value === 'no-reply')!.category).toBe('closed')
  })
})

describe('views', () => {
  it('returns the four default views for missing, empty or invalid text', () => {
    for (const t of [null, '', '  \n', 'views: [oops', 'views: 3']) {
      const v = loadViews(t)
      expect(v.map((x) => x.id)).toEqual(['inbound', 'active', 'passed', 'all'])
    }
    const [inbound, active, passed, all] = loadViews(null)
    expect(inbound).toMatchObject({ name: 'Inbound', layout: 'board', groupBy: 'pipeline_status' })
    expect(inbound.filters.pipeline_status).toEqual(['new', 'pursuing', 'reached-out', 'no-reply'])
    expect(active.filters.pipeline_status).toEqual(['active'])
    expect(passed.filters.pipeline_status).toEqual(['revisit', 'passed', 'archived'])
    expect(all.filters).toEqual({})
    expect(all.layout).toBe('table')
  })

  it('round-trips through saveViews as one history entry', async () => {
    const views = loadViews(null).slice(0, 2)
    const r = await saveViews(ctx, views)
    expect(r.entry.message).toBe('Saved views')
    expect(read('.kew/views.yaml')).toBe(serializeViews(views))
    expect(loadViews(read('.kew/views.yaml'))).toEqual(views)
  })
})
