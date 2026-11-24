// Record commands. Each builds file edits and hands them to applyAction.
import { existsSync, promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { applyAction, type Ctx, type FileEdit } from './apply'
import { newNote, parseNote, setKeys, setBody as setNoteBody } from '../note'
import { safeFilename, uniqueName } from '../names'
import { nameProblem } from '../../shared/names'
import { newId } from '../ids'
import { extractLinks, rewriteLinks, unlink } from '../links'
import { coerceValue, ValidationError } from '../schema/validate'
import { aliasesOf, key } from '../index/indexer'
import type { FieldDef } from '../schema/types'
import type {
  ActionResult,
  DuplicateHit,
  FieldValue,
  RecordSummary,
  RecordType
} from '../../shared/api'

const SYSTEM_KEYS = new Set(['id', 'type', 'name'])

export function record(ctx: Ctx, id: string): RecordSummary {
  const rec = ctx.index.byId(id)
  if (!rec) throw new Error(`No record with id ${id}`)
  return rec
}

const fieldDef = (ctx: Ctx, type: RecordType, k: string): FieldDef | undefined =>
  ctx.schema().types[type].fields.find((f) => f.key === k)

/** Schema keys are coerced (throws ValidationError); unknown keys pass through. Empty → null. */
export function coerceAll(
  ctx: Ctx,
  type: RecordType,
  changes: Record<string, FieldValue>
): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {}
  for (const [k, v] of Object.entries(changes)) {
    const f = fieldDef(ctx, type, k)
    try {
      out[k] = v === null ? null : f ? coerceValue(f, v) : v
    } catch (e) {
      if (e instanceof ValidationError) throw new ValidationError(`${f?.label ?? k}: ${e.message}`)
      throw e
    }
  }
  return out
}

const filePath = (ctx: Ctx, type: RecordType, name: string): string =>
  `${ctx.schema().types[type].folder}/${safeFilename(name)}.md`

/** A free name: no other record uses it as a name or alias, and its file doesn't exist. */
function freeName(
  ctx: Ctx,
  type: RecordType,
  name: string,
  company: string,
  self?: RecordSummary
): string {
  const names = ctx.index.allNames()
  const own = new Set(self ? [self.name, ...aliasesOf(self.fields)].map(key) : [])
  const taken = (c: string): boolean => {
    if (names.has(key(c)) && !own.has(key(c))) return true
    const rel = filePath(ctx, type, c)
    return rel.toLowerCase() !== self?.path.toLowerCase() && existsSync(join(ctx.root, rel))
  }
  return uniqueName(name, type, taken, company ? { company } : undefined)
}

const companyOf = (fields: Record<string, FieldValue>): string =>
  typeof fields.company === 'string' ? unlink(fields.company) : ''

// Characters that break file names (/ \ : * ? " < >) or links (| # [ ] ^).
// Rejecting them keeps name == file name == link text.
function cleanName(name: string): string {
  const problem = nameProblem(name)
  if (problem) throw new ValidationError(problem)
  return name.trim()
}

/** Every .md file in the vault, skipping dot-files and dot-directories. */
async function vaultNotes(root: string, rel = ''): Promise<string[]> {
  const out: string[] = []
  for (const d of await fsp.readdir(join(root, rel), { withFileTypes: true })) {
    if (d.name.startsWith('.')) continue
    const p = rel ? `${rel}/${d.name}` : d.name
    if (d.isDirectory()) out.push(...(await vaultNotes(root, p)))
    else if (d.isFile() && /\.md$/i.test(d.name)) out.push(p)
  }
  return out
}

export async function createRecord(
  ctx: Ctx,
  type: RecordType,
  name: string,
  fields: Record<string, FieldValue> = {},
  force = false
): Promise<ActionResult | { duplicates: DuplicateHit[] }> {
  const wanted = cleanName(name)
  for (const k of Object.keys(fields)) {
    if (k.startsWith('_')) throw new ValidationError(`${k} is calculated by Kew and can't be set.`)
  }
  const given = coerceAll(
    ctx,
    type,
    Object.fromEntries(Object.entries(fields).filter(([k]) => !SYSTEM_KEYS.has(k)))
  )
  if (!force) {
    const duplicates = ctx.index.findDuplicates(type, wanted, given)
    if (duplicates.length > 0) return { duplicates }
  }
  const finalName = cleanName(freeName(ctx, type, wanted, companyOf(given)))

  const template = parseNote(ctx.templates[type] ?? '')
  const fm: Record<string, FieldValue> = { id: newId(), type, name: finalName }
  for (const [k, v] of Object.entries(given)) if (v !== null) fm[k] = v
  if (type === 'company' && !('first_seen' in fm)) fm.first_seen = ctx.today()
  if (type === 'research' && !('created' in fm)) fm.created = ctx.today()
  for (const [k, v] of Object.entries(template.fm)) if (!(k in fm)) fm[k] = v
  const body = template.ok ? template.body : (ctx.templates[type] ?? '')
  const text = newNote(fm, body)

  const path = filePath(ctx, type, finalName)
  return applyAction(ctx, `Created ${finalName}`, [
    {
      path,
      apply: (current) => {
        if (current !== null) throw new Error(`${path} already exists.`)
        return text
      }
    }
  ])
}

function fieldsMessage(ctx: Ctx, rec: RecordSummary, changes: Record<string, FieldValue>): string {
  const keys = Object.keys(changes)
  if (keys.length !== 1) return `Updated ${rec.name}`
  const f = fieldDef(ctx, rec.type, keys[0])
  if (keys[0] === 'pipeline_status') {
    const option = f?.options?.find((o) => o.value === changes.pipeline_status)
    if (option) return `Moved ${rec.name} to ${option.label}`
  }
  return `Set ${f?.label ?? keys[0]} on ${rec.name}`
}

export async function setFields(
  ctx: Ctx,
  id: string,
  changes: Record<string, FieldValue>
): Promise<ActionResult> {
  const rec = record(ctx, id)
  for (const k of Object.keys(changes)) {
    if (k === 'name') throw new ValidationError('Use rename to change a name.')
    if (SYSTEM_KEYS.has(k)) throw new ValidationError(`The ${k} field can't be changed.`)
    if (k.startsWith('_')) throw new ValidationError(`${k} is calculated by Kew and can't be changed.`)
  }
  const coerced = coerceAll(ctx, rec.type, changes)
  const keyChanges: Record<string, FieldValue | undefined> = {}
  for (const [k, v] of Object.entries(coerced)) keyChanges[k] = v === null ? undefined : v
  const assignedId = newId()
  return applyAction(ctx, fieldsMessage(ctx, rec, changes), [
    {
      path: rec.path,
      apply: (current) => {
        if (current === null) throw new Error(`${rec.path} no longer exists.`)
        const hasId =
          typeof parseNote(current).fm.id === 'string' && parseNote(current).fm.id !== ''
        return setKeys(current, hasId ? keyChanges : { id: assignedId, ...keyChanges })
      }
    }
  ])
}

export async function setBody(ctx: Ctx, id: string, body: string): Promise<ActionResult> {
  const rec = record(ctx, id)
  return applyAction(ctx, `Edited ${rec.name}`, [
    {
      path: rec.path,
      apply: (current) => {
        if (current === null) throw new Error(`${rec.path} no longer exists.`)
        return setNoteBody(current, body)
      }
    }
  ])
}

export async function rename(ctx: Ctx, id: string, newName: string): Promise<ActionResult> {
  const rec = record(ctx, id)
  const name = cleanName(freeName(ctx, rec.type, cleanName(newName), companyOf(rec.fields), rec))
  const newPath = filePath(ctx, rec.type, name)
  if (newPath !== rec.path && newPath.toLowerCase() === rec.path.toLowerCase()) {
    throw new ValidationError("Changing only capitalization isn't supported yet.")
  }
  const relink = (text: string): string => rewriteLinks(text, rec.name, name)
  const edits: FileEdit[] = [
    {
      path: rec.path,
      newPath: newPath === rec.path ? undefined : newPath,
      apply: (current) => {
        if (current === null) throw new Error(`${rec.path} no longer exists.`)
        return relink(setKeys(current, { name }))
      }
    }
  ]
  // Every note in the vault, not just indexed records, so loose notes keep working links.
  const old = key(rec.name)
  for (const rel of await vaultNotes(ctx.root)) {
    if (rel === rec.path) continue
    const text = await fsp.readFile(join(ctx.root, rel), 'utf8')
    if (!extractLinks(text).some((l) => key(l) === old)) continue
    edits.push({
      path: rel,
      apply: (current) => (current === null ? null : relink(current))
    })
  }
  return applyAction(ctx, `Renamed ${rec.name} to ${name}`, edits)
}
