// The Vault: one object composing schema, index, history and the write path.
// The Electron main process holds one per open vault and forwards KewApi calls to it.
//
// Per-vault data lives in `dataDir` (never in the vault):
//   index.sqlite       the derived index
//   history.git        undo history (gitdir; the vault is the work tree)
//   last-schema.yaml   the last valid schema, the fallback for a broken .kew/schema.yaml
//   index-schema.txt   sha256 of the schema the index was last fully rebuilt with.
//                      A fingerprint rather than the version number, so hand edits that
//                      keep the version still trigger a rebuild.
import { existsSync, promises as fsp, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, join } from 'node:path'
import { History } from './history'
import { openIndex, type Index } from './index'
import { RECORD_TYPES } from './index/indexer'
import { undoAction, type Ctx } from './write/apply'
import * as records from './write/records'
import * as workflow from './write/workflow'
import * as schemaChanges from './write/schema-changes'
import { DEFAULT_SCHEMA } from './schema/defaults'
import { loadSchema, serializeSchema } from './schema/load'
import { BUILTIN_TEMPLATES, SCHEMA_PATH } from './setup'
import type {
  ActionResult, DuplicateHit, FieldValue, HistoryEntry, KewApi, ListQuery, RecordDetail,
  RecordSummary, RecordType, SearchHit, TodayData, VaultInfo, ViewDef
} from '../shared/api'
import type { Schema, SchemaChange } from './schema/types'

const VIEWS_PATH = '.kew/views.yaml'
const SAMPLE_MARKER = '.kew/sample'

/** The KewApi methods a Vault serves (openInFinder is Electron-only, in main). */
export type VaultApi = Pick<
  KewApi,
  | 'today' | 'list' | 'get' | 'search' | 'schema' | 'views' | 'history'
  | 'createRecord' | 'setFields' | 'setBody' | 'rename' | 'logOutreach' | 'weMet'
  | 'passCompany' | 'snooze' | 'changeSchema' | 'saveViews' | 'undo' | 'rebuildIndex'
>

export function vaultDataDir(userData: string, root: string): string {
  const key = createHash('sha256').update(realpathSync(root)).digest('hex').slice(0, 16)
  return join(userData, 'vaults', key)
}

const fingerprint = (s: Schema): string => createHash('sha256').update(serializeSchema(s)).digest('hex')

/** Local calendar date, YYYY-MM-DD. The one place core reads the clock for "today". */
function localToday(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function readOrNull(file: string): string | null {
  try {
    return readFileSync(file, 'utf8')
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return null
    throw e
  }
}

export class Vault implements VaultApi {
  private current: Schema = DEFAULT_SCHEMA
  private lastValid: Schema | null = null
  private schemaError: string | null = null
  private closed = false
  private queue: Promise<unknown> = Promise.resolve()
  private readonly ctx: Ctx

  private constructor(
    readonly root: string,
    private readonly dataDir: string,
    private readonly index: Index,
    history: History,
    today: () => string
  ) {
    const templates = {} as Record<RecordType, string>
    for (const t of RECORD_TYPES) {
      Object.defineProperty(templates, t, { enumerable: true, get: () => this.template(t) })
    }
    this.ctx = {
      root,
      schema: () => this.current,
      setSchema: (s) => {
        this.current = s
        this.lastValid = s
        this.schemaError = null
        this.persistLastValid()
      },
      index,
      history,
      today,
      templates
    }
  }

  static async open(root: string, dataDir: string, opts: { today?: () => string } = {}): Promise<Vault> {
    await fsp.mkdir(dataDir, { recursive: true })
    const history = await History.open(join(dataDir, 'history.git'), root)
    const index = openIndex(join(dataDir, 'index.sqlite'))
    const v = new Vault(root, dataDir, index, history, opts.today ?? localToday)
    try {
      const saved = readOrNull(join(dataDir, 'last-schema.yaml'))
      if (saved !== null) {
        const r = loadSchema(saved, null)
        if (!r.error) v.lastValid = r.schema
      }
      v.loadSchemaFile()
      const empty = RECORD_TYPES.every((t) => index.list(t).length === 0)
      if (empty) await v.rebuild()
      else await v.syncIndex()
    } catch (e) {
      v.close()
      throw e
    }
    return v
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.index.close()
  }

  info(): VaultInfo {
    return {
      root: this.root,
      name: basename(this.root),
      isSample: existsSync(join(this.root, SAMPLE_MARKER)),
      schemaError: this.schemaError
    }
  }

  pathOf(id: string): string | null {
    const rec = this.index.byId(id)
    return rec ? join(this.root, rec.path) : null
  }

  affectedCount(change: SchemaChange): number {
    return schemaChanges.affectedCount(this.ctx, change)
  }

  // ---- schema and index upkeep ----

  private template(t: RecordType): string {
    const text = readOrNull(join(this.root, this.current.types[t].template))
    return text ?? BUILTIN_TEMPLATES[t]
  }

  private persistLastValid(): void {
    if (this.lastValid) writeFileSync(join(this.dataDir, 'last-schema.yaml'), serializeSchema(this.lastValid))
  }

  /** Reads .kew/schema.yaml; a broken or missing file keeps the last valid schema. */
  private loadSchemaFile(): void {
    const text = readOrNull(join(this.root, SCHEMA_PATH))
    if (text === null) {
      this.current = this.lastValid ?? DEFAULT_SCHEMA
      this.schemaError = `${SCHEMA_PATH} is missing; using the last valid schema.`
      return
    }
    const r = loadSchema(text, this.lastValid)
    this.current = r.schema
    this.schemaError = r.error
    if (!r.error) {
      this.lastValid = r.schema
      this.persistLastValid()
    }
  }

  private async rebuild(): Promise<void> {
    await this.index.rebuild(this.root, this.current)
    writeFileSync(join(this.dataDir, 'index-schema.txt'), fingerprint(this.current))
  }

  /** Rebuilds when the index was built with a different schema. Returns whether it did. */
  private async syncIndex(): Promise<boolean> {
    const built = readOrNull(join(this.dataDir, 'index-schema.txt'))
    if (built === fingerprint(this.current)) {
      this.index.useSchema(this.current)
      return false
    }
    await this.rebuild()
    return true
  }

  private allIds(): string[] {
    return RECORD_TYPES.flatMap((t) => this.index.list(t).map((r) => r.id))
  }

  /** Runs mutations one at a time, so watcher re-indexing never interleaves with an action. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn)
    this.queue = run.catch(() => undefined)
    return run
  }

  // ---- queries ----

  async today(): Promise<TodayData> {
    return this.index.today(this.ctx.today())
  }
  async list(type: RecordType, q?: ListQuery): Promise<RecordSummary[]> {
    return this.index.list(type, q)
  }
  async get(id: string): Promise<RecordDetail | null> {
    return this.index.detail(id, this.root, this.ctx.today())
  }
  async search(text: string, limit?: number): Promise<SearchHit[]> {
    return this.index.search(text, limit)
  }
  async schema(): Promise<Schema> {
    return this.current
  }
  async views(): Promise<ViewDef[]> {
    return schemaChanges.loadViews(readOrNull(join(this.root, VIEWS_PATH)))
  }
  history(limit = 50): Promise<HistoryEntry[]> {
    return this.ctx.history.list(limit)
  }

  // ---- commands ----

  createRecord(
    type: RecordType, name: string, fields?: Record<string, FieldValue>, force?: boolean
  ): Promise<ActionResult | { duplicates: DuplicateHit[] }> {
    return this.serial(() => records.createRecord(this.ctx, type, name, fields, force))
  }
  setFields(id: string, changes: Record<string, FieldValue>): Promise<ActionResult> {
    return this.serial(() => records.setFields(this.ctx, id, changes))
  }
  setBody(id: string, body: string): Promise<ActionResult> {
    return this.serial(() => records.setBody(this.ctx, id, body))
  }
  rename(id: string, name: string): Promise<ActionResult> {
    return this.serial(() => records.rename(this.ctx, id, name))
  }
  logOutreach(
    personId: string, e: { dir: 'out' | 'in' | 'note'; channel: string; text: string; date?: string }
  ): Promise<ActionResult> {
    return this.serial(() => workflow.logOutreach(this.ctx, personId, e))
  }
  weMet(personId: string): Promise<ActionResult> {
    return this.serial(() => workflow.weMet(this.ctx, personId))
  }
  passCompany(id: string, reason: string): Promise<ActionResult> {
    return this.serial(() => workflow.passCompany(this.ctx, id, reason))
  }
  snooze(id: string, until: string): Promise<ActionResult> {
    return this.serial(() => workflow.snooze(this.ctx, id, until))
  }
  changeSchema(change: SchemaChange): Promise<ActionResult> {
    // A full rebuild afterwards re-validates notes the migration didn't touch.
    return this.serial(async () => {
      try {
        return await schemaChanges.changeSchema(this.ctx, change)
      } finally {
        await this.syncIndex()
      }
    })
  }
  saveViews(views: ViewDef[]): Promise<ActionResult> {
    return this.serial(() => schemaChanges.saveViews(this.ctx, views))
  }
  undo(entryId: string): Promise<ActionResult> {
    return this.serial(async () => {
      const result = await undoAction(this.ctx, entryId)
      if (result.entry.files.includes(SCHEMA_PATH)) {
        this.loadSchemaFile()
        if (await this.syncIndex()) return { ...result, changedIds: this.allIds() }
      }
      return result
    })
  }
  rebuildIndex(): Promise<void> {
    return this.serial(() => this.rebuild())
  }

  /**
   * Re-index files the watcher saw change (vault-relative paths). Never records history:
   * hand edits are committed lazily, right before the app next writes those files.
   * Returns the ids of records that changed, appeared or disappeared.
   */
  onExternalChange(paths: string[]): Promise<string[]> {
    return this.serial(async () => {
      const ids = new Set<string>()
      for (const rel of new Set(paths)) {
        if (rel === SCHEMA_PATH) {
          const before = this.allIds()
          this.loadSchemaFile()
          if (await this.syncIndex()) for (const id of [...before, ...this.allIds()]) ids.add(id)
          continue
        }
        if (rel.split('/').some((s) => s.startsWith('.')) || !/\.md$/i.test(rel)) continue
        const before = this.index.byPath(rel)?.id
        const text = await fsp.readFile(join(this.root, rel), 'utf8').catch((e: NodeJS.ErrnoException) => {
          if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null
          throw e
        })
        if (text === null) this.index.removeFile(rel)
        else this.index.indexFile(rel, text, this.current)
        const after = this.index.byPath(rel)?.id
        if (before) ids.add(before)
        if (after) ids.add(after)
      }
      return [...ids]
    })
  }
}
