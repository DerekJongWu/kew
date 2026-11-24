// The single write path: the only code that writes files inside the vault.
// Every action records hand edits to its files first ("External edits"),
// re-checks the files right before writing, writes atomically, then records
// one history entry and re-indexes what it touched.
import { promises as fsp } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { basename, dirname, join, resolve, sep } from 'node:path'
import type { History } from '../history'
import type { Index } from '../index'
import type { ActionResult, RecordType } from '../../shared/api'
import type { Schema } from '../schema/types'

export interface Ctx {
  root: string
  schema: () => Schema
  /** Swaps in a new schema (schema changes call it before re-indexing). Optional. */
  setSchema?: (s: Schema) => void
  index: Index
  history: History
  today: () => string
  templates: Record<RecordType, string>
  /** Called with the action's paths right before each pre-write re-read. */
  hooks?: { beforeWrite?: (paths: string[]) => Promise<void> | void }
}

/** `apply` returns the file's new text, or null to delete it. `newPath` moves the result there. */
export interface FileEdit {
  path: string
  apply: (current: string | null) => string | null
  newPath?: string
}

export class ConflictError extends Error {
  constructor(public readonly path: string) {
    super(`${path} keeps changing on disk; nothing was written. Try again.`)
    this.name = 'ConflictError'
  }
}

type Snapshot = Map<string, { text: string | null; hash: string | null; bytes: Buffer | null }>

const hash = (b: Buffer): string => createHash('sha256').update(b).digest('hex')

function abs(root: string, rel: string): string {
  const base = resolve(root)
  const p = resolve(base, rel)
  if (!p.startsWith(base + sep)) throw new Error(`Refusing to write outside the vault: ${rel}`)
  return p
}

async function snapshot(root: string, paths: string[]): Promise<Snapshot> {
  const out: Snapshot = new Map()
  for (const rel of paths) {
    try {
      const b = await fsp.readFile(abs(root, rel))
      out.set(rel, { text: b.toString('utf8'), hash: hash(b), bytes: b })
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw e
      out.set(rel, { text: null, hash: null, bytes: null })
    }
  }
  return out
}

const changedPath = (a: Snapshot, b: Snapshot): string | null => {
  for (const [rel, v] of a) if (b.get(rel)!.hash !== v.hash) return rel
  return null
}

async function writeAtomic(file: string, text: string | Buffer): Promise<void> {
  await fsp.mkdir(dirname(file), { recursive: true })
  const tmp = join(dirname(file), `.${basename(file)}.kew-tmp-${randomBytes(6).toString('hex')}`)
  try {
    await fsp.writeFile(tmp, text)
    await fsp.rename(tmp, file)
  } catch (e) {
    await fsp.rm(tmp, { force: true })
    throw e
  }
}

interface Planned {
  edit: FileEdit
  to: string
  result: string | null
  current: string | null
}

function plan(edits: FileEdit[], snap: Snapshot): Planned[] {
  return edits.map((edit) => {
    const current = snap.get(edit.path)!.text
    const to = edit.newPath ?? edit.path
    if (to !== edit.path && snap.get(to)!.text !== null) {
      throw new Error(`Can't move ${edit.path}: ${to} already exists.`)
    }
    return { edit, to, current, result: edit.apply(current) }
  })
}

export async function applyAction(
  ctx: Ctx,
  message: string,
  edits: FileEdit[],
  opts: { kind?: 'action' | 'undo' } = {}
): Promise<ActionResult> {
  const paths = [...new Set(edits.flatMap((e) => (e.newPath ? [e.path, e.newPath] : [e.path])))]
  if (new Set(edits.map((e) => e.path)).size !== edits.length)
    throw new Error('An action may edit each file once.')
  for (const p of paths) abs(ctx.root, p)

  let snap = await snapshot(ctx.root, paths)
  await ctx.history.commitExternal(paths)
  let planned = plan(edits, snap)
  for (let attempt = 0; ; attempt++) {
    await ctx.hooks?.beforeWrite?.(paths)
    const now = await snapshot(ctx.root, paths)
    const moved = changedPath(snap, now)
    if (!moved) break
    if (attempt === 1) throw new ConflictError(moved)
    // A hand edit landed after our read: record it, then re-apply on top of it.
    await ctx.history.commitExternal(paths)
    snap = now
    planned = plan(edits, snap)
  }

  const isMove = (p: Planned): boolean => p.to !== p.edit.path
  if (planned.every((p) => !isMove(p) && p.result === p.current)) {
    const [latest] = await ctx.history.list(1)
    return { entry: latest, changedIds: [] }
  }

  refuseCaseVariants(planned)

  // Write phase. On any failure, put every touched path back as it was.
  const touched: string[] = []
  try {
    for (const p of planned) {
      if (!isMove(p) && p.result === p.current) continue
      const from = abs(ctx.root, p.edit.path)
      if (p.result === null) {
        touched.push(p.edit.path)
        await fsp.rm(from, { force: true })
      } else {
        touched.push(p.to)
        await writeAtomic(abs(ctx.root, p.to), p.result)
        if (isMove(p)) {
          touched.push(p.edit.path)
          await fsp.rm(from, { force: true })
        }
      }
    }
  } catch (e) {
    await rollBack(ctx, touched, snap)
    throw e
  }

  const entry = await ctx.history.commitAction(paths, message, opts.kind ?? 'action')

  // Removals first, so a moved record's id isn't seen twice while re-indexing.
  const finals = new Map<string, string | null>()
  for (const p of planned) {
    if (isMove(p)) finals.set(p.edit.path, null)
    finals.set(p.to, p.result)
  }
  const ids = new Set<string>()
  for (const [rel, text] of finals) {
    if (text !== null) continue
    const rec = ctx.index.byPath(rel)
    if (rec && !isMoveSource(planned, rel)) ids.add(rec.id)
    ctx.index.removeFile(rel)
  }
  for (const [rel, text] of finals) {
    if (text === null) continue
    ctx.index.indexFile(rel, text, ctx.schema())
    const rec = ctx.index.byPath(rel)
    if (rec) ids.add(rec.id)
  }
  return { entry, changedIds: [...ids] }
}

/**
 * On a case-insensitive disk, deleting or moving away from "A.md" while writing
 * "a.md" would remove the file just written. Refuse such actions outright.
 */
function refuseCaseVariants(planned: Planned[]): void {
  const written = planned.filter((p) => p.result !== null).map((p) => p.to)
  const gone = planned.flatMap((p) =>
    p.result === null ? [p.edit.path] : p.to !== p.edit.path ? [p.edit.path] : []
  )
  for (const g of gone) {
    const clash = written.find((w) => w !== g && w.toLowerCase() === g.toLowerCase())
    if (clash) {
      throw new Error(
        `Can't remove ${g} while writing ${clash}: the names differ only in capitalization.`
      )
    }
  }
}

async function rollBack(ctx: Ctx, touched: string[], snap: Snapshot): Promise<void> {
  const failed: string[] = []
  for (const rel of [...new Set(touched)].reverse()) {
    const before = snap.get(rel)!
    try {
      if (before.bytes === null) await fsp.rm(abs(ctx.root, rel), { force: true })
      else await writeAtomic(abs(ctx.root, rel), before.bytes)
      if (before.text === null) ctx.index.removeFile(rel)
      else ctx.index.indexFile(rel, before.text, ctx.schema())
    } catch {
      failed.push(rel)
    }
  }
  if (failed.length > 0) {
    throw new Error(`A write failed and these files could not be put back: ${failed.join(', ')}`)
  }
}

const isMoveSource = (planned: Planned[], rel: string): boolean =>
  planned.some((p) => p.edit.path === rel && p.to !== rel && p.result !== null)

/** Undo one history entry as a new 'undo' action. Refuses if a file changed after the check. */
export async function undoAction(ctx: Ctx, entryId: string): Promise<ActionResult> {
  const { message, restores } = await ctx.history.undo(entryId)
  const checked = await snapshot(
    ctx.root,
    restores.map((r) => r.path)
  )
  const edits: FileEdit[] = restores.map((r) => ({
    path: r.path,
    apply: (current) => {
      if (current !== checked.get(r.path)!.text) throw new ConflictError(r.path)
      return r.content
    }
  }))
  return applyAction(ctx, 'Undid: ' + message, edits, { kind: 'undo' })
}
