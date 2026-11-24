// Schema edits and saved views. Each schema change is one action: it writes
// .kew/schema.yaml and migrates every affected note, so undo reverts all of it.
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { parse, stringify } from 'yaml'
import { z } from 'zod'
import { applyAction, type Ctx, type FileEdit } from './apply'
import { parseNote, setKeys } from '../note'
import { DEFAULT_SCHEMA } from '../schema/defaults'
import { loadSchema, serializeSchema } from '../schema/load'
import { ValidationError } from '../schema/validate'
import type { FieldDef, OptionDef, Schema, SchemaChange } from '../schema/types'
import type { ActionResult, FieldValue, RecordSummary, ViewDef } from '../../shared/api'

const SCHEMA_PATH = '.kew/schema.yaml'
const VIEWS_PATH = '.kew/views.yaml'
const KEY_RE = /^[a-z][a-z0-9_]*$/
const OPTION_TYPES = new Set(['select', 'stage', 'multi-select'])

const fieldOf = (schema: Schema, change: SchemaChange, key: string): FieldDef => {
  const f = schema.types[change.type].fields.find((x) => x.key === key)
  if (!f) throw new ValidationError(`There is no field '${key}' on ${change.type}.`)
  return f
}

/** Old option value → new value, for options that carry renamedFrom. */
function renames(change: Extract<SchemaChange, { kind: 'update-field' }>): Map<string, string> {
  const m = new Map<string, string>()
  for (const o of change.options ?? []) {
    if (o.renamedFrom && o.renamedFrom !== o.value) m.set(o.renamedFrom, o.value)
  }
  return m
}

const valuesOf = (v: FieldValue | undefined): string[] =>
  Array.isArray(v) ? v.map(String) : typeof v === 'string' && v !== '' ? [v] : []

const notesOf = (ctx: Ctx, change: SchemaChange): RecordSummary[] =>
  ctx.index.list(change.type)

/** Notes of the type that this change would modify. */
function affectedNotes(ctx: Ctx, change: SchemaChange): RecordSummary[] {
  const schema = ctx.schema()
  switch (change.kind) {
    case 'add-field':
      return []
    case 'rename-field':
    case 'delete-field': {
      const key = change.kind === 'rename-field' ? change.from : change.key
      fieldOf(schema, change, key)
      return notesOf(ctx, change).filter((r) => key in r.fields)
    }
    case 'update-field': {
      const field = fieldOf(schema, change, change.key)
      const map = renames(change)
      if (map.size === 0 || !OPTION_TYPES.has(field.type)) return []
      return notesOf(ctx, change).filter((r) => valuesOf(r.fields[change.key]).some((v) => map.has(v)))
    }
  }
}

export function affectedCount(ctx: Ctx, change: SchemaChange): number {
  return affectedNotes(ctx, change).length
}

const stripRenamed = (options: OptionDef[]): OptionDef[] =>
  options.map(({ renamedFrom: _r, ...rest }) => rest)

const deriveLabel = (key: string): string => {
  const s = key.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Build the new schema (a copy) and the message prefix; throws ValidationError on refusals. */
function nextSchema(ctx: Ctx, change: SchemaChange): { schema: Schema; message: (n: number) => string } {
  const old = ctx.schema()
  const schema: Schema = structuredClone(old)
  const fields = schema.types[change.type].fields
  const count = (n: number): string => (n > 0 ? ` (${n} notes)` : '')
  switch (change.kind) {
    case 'add-field': {
      const f = change.field
      if (!KEY_RE.test(f.key)) throw new ValidationError(`'${f.key}' isn't a valid field key (use lowercase letters, digits and underscores).`)
      if (fields.some((x) => x.key === f.key)) throw new ValidationError(`There is already a field '${f.key}' on ${change.type}.`)
      const added: FieldDef = { ...f, options: f.options ? stripRenamed(f.options) : undefined }
      if (!added.options) delete added.options
      fields.push(added)
      return { schema, message: () => `Added field ${f.label}` }
    }
    case 'update-field': {
      const f = fields.find((x) => x.key === change.key)!
      fieldOf(old, change, change.key)
      if (change.label !== undefined) f.label = change.label
      if (change.options) {
        const map = renames(change)
        const keep = new Set(change.options.map((o) => o.value))
        const dropped = new Set((f.options ?? []).map((o) => o.value).filter((v) => !keep.has(v) && !map.has(v)))
        if (dropped.size > 0) {
          const used = notesOf(ctx, change).filter((r) => valuesOf(r.fields[change.key]).some((v) => dropped.has(v)))
          if (used.length > 0) {
            throw new ValidationError(
              `Can't remove ${[...dropped].join(', ')} from ${f.label}: ${used.length} ${used.length === 1 ? 'note uses' : 'notes use'} it.`
            )
          }
        }
        f.options = stripRenamed(change.options)
      }
      return { schema, message: (n) => `Updated field ${f.label}${count(n)}` }
    }
    case 'rename-field': {
      const f = fields.find((x) => x.key === change.from)!
      fieldOf(old, change, change.from)
      if (f.tier === 'system') throw new ValidationError(`${f.label} is a system field and can't be renamed.`)
      if (!KEY_RE.test(change.to)) throw new ValidationError(`'${change.to}' isn't a valid field key (use lowercase letters, digits and underscores).`)
      if (fields.some((x) => x.key === change.to)) throw new ValidationError(`There is already a field '${change.to}' on ${change.type}.`)
      const oldLabel = f.label
      f.key = change.to
      if (oldLabel === deriveLabel(change.from)) f.label = deriveLabel(change.to)
      return { schema, message: (n) => `Renamed field ${oldLabel} to ${f.label}${count(n)}` }
    }
    case 'delete-field': {
      const f = fieldOf(old, change, change.key)
      if (f.tier === 'system') throw new ValidationError(`${f.label} is a system field and can't be deleted.`)
      schema.types[change.type].fields = fields.filter((x) => x.key !== change.key)
      return { schema, message: (n) => `Deleted field ${f.label}${count(n)}` }
    }
  }
}

/** Rename a top-level frontmatter key in place, keeping its value and position. */
function renameKey(text: string, from: string, to: string): string {
  if (!parseNote(text).ok) return text
  const lines = text.split('\n')
  let end = -1
  for (let i = 1; i < lines.length; i++) if (lines[i].replace(/\r$/, '') === '---') { end = i; break }
  for (let i = 1; i < end; i++) {
    if (lines[i].startsWith(from + ':')) {
      lines[i] = to + lines[i].slice(from.length)
      break
    }
  }
  return lines.join('\n')
}

function migrate(change: SchemaChange, notes: RecordSummary[]): FileEdit[] {
  const edit = (r: RecordSummary, fn: (text: string) => string): FileEdit => ({
    path: r.path,
    apply: (current) => (current === null ? null : fn(current))
  })
  switch (change.kind) {
    case 'add-field':
      return []
    case 'rename-field':
      return notes.map((r) => edit(r, (t) => renameKey(t, change.from, change.to)))
    case 'delete-field':
      return notes.map((r) => edit(r, (t) => setKeys(t, { [change.key]: undefined })))
    case 'update-field': {
      const map = renames(change)
      return notes.map((r) =>
        edit(r, (t) => {
          const v = parseNote(t).fm[change.key]
          if (Array.isArray(v)) return setKeys(t, { [change.key]: v.map((x) => map.get(x) ?? x) })
          if (typeof v === 'string' && map.has(v)) return setKeys(t, { [change.key]: map.get(v)! })
          return t
        })
      )
    }
  }
}

export async function changeSchema(ctx: Ctx, change: SchemaChange): Promise<ActionResult> {
  const setSchema = ctx.setSchema
  if (!setSchema) throw new Error('Schema changes need ctx.setSchema, so the index can use the new schema.')
  const notes = affectedNotes(ctx, change)
  const { schema, message } = nextSchema(ctx, change)
  const text = serializeSchema(schema)
  const check = loadSchema(text, null)
  if (check.error) throw new ValidationError(check.error)

  const edits: FileEdit[] = [{ path: SCHEMA_PATH, apply: () => text }, ...migrate(change, notes)]
  const previous = ctx.schema()
  // Notes are re-indexed inside applyAction, so the new schema must already be in force.
  setSchema(check.schema)
  try {
    return await applyAction(ctx, message(notes.length), edits)
  } catch (e) {
    // Whatever is on disk now is the truth: adopt its schema and rebuild the index from it.
    let onDisk = previous
    try {
      const loaded = loadSchema(await fsp.readFile(join(ctx.root, SCHEMA_PATH), 'utf8'), previous)
      if (!loaded.error) onDisk = loaded.schema
    } catch {
      // keep the previous schema
    }
    setSchema(onDisk)
    try {
      await ctx.index.rebuild(ctx.root, onDisk)
    } catch {
      // the original error is the one to report
    }
    throw e
  }
}

// ---- Saved views ----

function defaultViews(): ViewDef[] {
  const stage = DEFAULT_SCHEMA.types.company.fields.find((f) => f.key === 'pipeline_status')!
  const values = (...cats: string[]): string[] =>
    (stage.options ?? []).filter((o) => cats.includes(o.category ?? '')).map((o) => o.value)
  const columns = ['name', 'pipeline_status', 'stage', 'themes', 'raise']
  const base = { type: 'company' as const, groupBy: 'pipeline_status', columns }
  return [
    { id: 'inbound', name: 'Inbound', layout: 'board', filters: { pipeline_status: values('new', 'in-progress') }, ...base },
    { id: 'active', name: 'Active deals', layout: 'table', filters: { pipeline_status: values('active') }, ...base },
    { id: 'passed', name: 'Passed', layout: 'table', filters: { pipeline_status: values('closed') }, ...base },
    { id: 'all', name: 'All companies', layout: 'table', filters: {}, ...base }
  ]
}

const viewSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['company', 'person', 'meeting', 'theme', 'research']),
  layout: z.enum(['board', 'table']),
  groupBy: z.string().optional(),
  filters: z.record(z.string(), z.array(z.string())),
  columns: z.array(z.string()),
  sort: z.object({ field: z.string(), dir: z.enum(['asc', 'desc']) }).optional()
})
const viewsFile = z.object({ views: z.array(viewSchema) })

export function loadViews(text: string | null): ViewDef[] {
  if (!text || !text.trim()) return defaultViews()
  try {
    const r = viewsFile.safeParse(parse(text))
    if (r.success && r.data.views.length > 0) return r.data.views as ViewDef[]
  } catch {
    // fall through to the defaults
  }
  return defaultViews()
}

export const serializeViews = (views: ViewDef[]): string => stringify({ views })

export function saveViews(ctx: Ctx, views: ViewDef[]): Promise<ActionResult> {
  const text = serializeViews(views)
  return applyAction(ctx, 'Saved views', [{ path: VIEWS_PATH, apply: () => text }])
}
